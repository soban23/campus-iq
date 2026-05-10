import asyncio
import json
import os
import re
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from httpx import HTTPError
from pydantic import BaseModel, Field
from dotenv import load_dotenv
load_dotenv()

from run_retrieval import (
    DEFAULT_MODEL,
    normalizeContentValue,
    requestAnswerMessage,
    requestSecondPass,
    resolveApiKey,
    runRetrieval,
)


class RetrievalRequest(BaseModel):
    question: str = Field(..., min_length=1)
    source: str | None = None
    top_k: int = Field(default=5, ge=1)
    model: str = DEFAULT_MODEL
    max_tokens: int = Field(default=1000, ge=1)
    api_key: str = os.getenv("GOOGLE_GENERATIVE_AI_API_KEY", "")
    double_check: bool = False
    show_context: bool = False
    history: list[dict[str, str]] = Field(default_factory=list)


class RetrievalCitation(BaseModel):
    source: str
    chunk_index: int | None = None
    relevance: float | None = None
    breadcrumb: str | None = None


class RetrievalResponse(BaseModel):
    expandedQuestion: str
    hydePassage: str
    chunks: list[dict[str, Any]]
    finalAnswer: str
    context: str | None = None
    citations: list[RetrievalCitation] = Field(default_factory=list)
    followUpSuggestions: list[str] = Field(default_factory=list)


class FeedbackRequest(BaseModel):
    message_id: str = Field(..., min_length=1)
    conversation_id: str | None = None
    rating: Literal["up", "down"]
    question: str | None = None
    answer: str = Field(..., min_length=1)
    citations: list[RetrievalCitation] = Field(default_factory=list)


def buildCitations(chunks: list[dict[str, Any]]) -> list[RetrievalCitation]:
    citations = []
    for position, chunk in enumerate(chunks):
        if not isinstance(chunk, dict):
            chunk = {}
        metadata = chunk.get("metadata", {})
        if not isinstance(metadata, dict):
            metadata = {}

        rawSource = metadata.get("source") or metadata.get("file") or metadata.get("document")
        source = str(rawSource).strip() if rawSource is not None else ""
        if source == "":
            source = "unknown source"

        rawChunkIndex = metadata.get("chunk_index", position)
        chunkIndex = None
        try:
            chunkIndex = int(rawChunkIndex)
        except (TypeError, ValueError):
            chunkIndex = position

        rawScore = chunk.get("score")
        relevance = None
        try:
            relevance = float(rawScore)
        except (TypeError, ValueError):
            relevance = None

        rawBreadcrumb = metadata.get("breadcrumb")
        breadcrumb = str(rawBreadcrumb).strip() if rawBreadcrumb is not None else None
        if breadcrumb == "":
            breadcrumb = None

        citations.append(
            RetrievalCitation(
                source=source,
                chunk_index=chunkIndex,
                relevance=relevance,
                breadcrumb=breadcrumb,
            )
        )
    return citations


def getCorsOrigins():
    rawOrigins = os.getenv("CORS_ORIGINS", "")
    if rawOrigins.strip() != "":
        originParts = [origin.strip() for origin in rawOrigins.split(",")]
        cleanedOrigins = [origin for origin in originParts if origin != ""]
        if len(cleanedOrigins) > 0:
            return cleanedOrigins
    return [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]


def getUniqueSuggestions(candidates: list[str], limit: int = 3) -> list[str]:
    seen = set()
    suggestions = []
    for candidate in candidates:
        cleaned = re.sub(r"\s+", " ", str(candidate)).strip()
        key = cleaned.lower()
        if cleaned != "" and key not in seen:
            suggestions.append(cleaned)
            seen.add(key)
        if len(suggestions) == limit:
            return suggestions
    return suggestions


def getCitationTopic(citations: list[RetrievalCitation]) -> str:
    for citation in citations:
        rawTopic = citation.breadcrumb or citation.source
        topicParts = [part.strip() for part in rawTopic.split(">") if part.strip() != ""]
        if len(topicParts) > 0:
            topic = topicParts[-1]
            return topic[:72]
    return "this policy"


def buildFollowUpSuggestions(
    answerText: str,
    citations: list[RetrievalCitation],
    chunks: list[dict[str, Any]],
) -> list[str]:
    normalizedAnswer = str(answerText).lower()
    topic = getCitationTopic(citations)
    candidates = []

    if "attendance" in normalizedAnswer:
        candidates.extend(["What happens if attendance is short?", "Are there attendance exceptions?"])
    if "withdraw" in normalizedAnswer or "drop" in normalizedAnswer:
        candidates.extend(["What is the withdrawal deadline?", "Does this affect GPA?"])
    if "fee" in normalizedAnswer or "refund" in normalizedAnswer or "payment" in normalizedAnswer:
        candidates.extend(["What is the refund rule?", "What happens after late payment?"])
    if "cgpa" in normalizedAnswer or "gpa" in normalizedAnswer or "probation" in normalizedAnswer:
        candidates.extend(["Explain academic probation", "How can a student recover?"])
    if "exam" in normalizedAnswer or "midterm" in normalizedAnswer or "final" in normalizedAnswer:
        candidates.extend(["What if an exam is missed?", "Explain makeup exam rules"])
    if "admission" in normalizedAnswer or "eligibility" in normalizedAnswer or "merit" in normalizedAnswer:
        candidates.extend(["Explain eligibility criteria", "How is merit calculated?"])

    if len(chunks) > 0:
        candidates.append(f"What else does {topic} say?")
        candidates.append(f"Summarize the source section on {topic}")

    candidates.extend(["Explain this with an example", "What are the important deadlines?", "What should a student do next?"])
    return getUniqueSuggestions(candidates)


async def buildRetrievalResponse(payload: RetrievalRequest) -> RetrievalResponse:
    print(f"Received question: {payload}")
    conversationTurns = payload.history
    apiKey = resolveApiKey(payload.api_key)
    pipelineResult = await runRetrieval(
        payload.question,
        payload.model,
        payload.top_k,
        payload.source,
        apiKey,
        conversationTurns,
    )
    formattedContext = pipelineResult["context"]

    firstMessageDict = await requestAnswerMessage(
        payload.question,
        formattedContext,
        payload.model,
        payload.max_tokens,
        apiKey,
        conversationTurns,
    )
    firstAnswerRaw = firstMessageDict.get("content", "")
    firstAnswerNormalized = normalizeContentValue(firstAnswerRaw)
    finalAnswer = firstAnswerNormalized.strip()

    if payload.double_check:
        finalAnswer = await requestSecondPass(
            payload.question,
            firstMessageDict,
            payload.model,
            payload.max_tokens,
            apiKey,
        )

    citations = buildCitations(pipelineResult["chunks"])
    return RetrievalResponse(
        expandedQuestion=pipelineResult["expandedQuestion"],
        hydePassage=pipelineResult["hydePassage"],
        chunks=pipelineResult["chunks"],
        finalAnswer=finalAnswer,
        context=formattedContext if payload.show_context else None,
        citations=citations,
        followUpSuggestions=buildFollowUpSuggestions(finalAnswer, citations, pipelineResult["chunks"]),
    )


def encodeStreamEvent(eventName: str, payload: dict[str, Any]) -> str:
    eventPayload = {"event": eventName, **payload}
    return json.dumps(eventPayload, ensure_ascii=False) + "\n"


async def streamRetrievalResponse(payload: RetrievalRequest):
    try:
        responsePayload = await buildRetrievalResponse(payload)
        metadata = responsePayload.model_dump()
        finalAnswer = metadata.pop("finalAnswer", "")
        yield encodeStreamEvent("metadata", metadata)

        answerParts = re.findall(r"\S+\s*", finalAnswer)
        for answerPart in answerParts:
            yield encodeStreamEvent("token", {"text": answerPart})
            await asyncio.sleep(0.012)

        yield encodeStreamEvent("done", {"finalAnswer": finalAnswer})
    except Exception as streamError:
        yield encodeStreamEvent("error", {"detail": str(streamError)})


app = FastAPI(title="CampusIQ RAG API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=getCorsOrigins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"message": "CampusIQ API is running.", "endpoint": "/rag/retrieve"}


@app.post("/rag/retrieve", response_model=RetrievalResponse)
async def rag_retrieve(payload: RetrievalRequest):
    try:
        return await buildRetrievalResponse(payload)
    except RuntimeError as runtimeError:
        runtimeDetail = str(runtimeError)
        loweredDetail = runtimeDetail.lower()
        isTimeout = "timed out" in loweredDetail or "timeout" in loweredDetail
        statusCode = 504 if isTimeout else 400
        raise HTTPException(status_code=statusCode, detail=runtimeDetail) from runtimeError
    except HTTPError as requestError:
        raise HTTPException(status_code=502, detail=f"LLM request failed: {requestError}") from requestError
    except Exception as unknownError:
        raise HTTPException(status_code=500, detail=f"Unexpected server error: {unknownError}") from unknownError


@app.post("/rag/retrieve/stream")
async def rag_retrieve_stream(payload: RetrievalRequest):
    return StreamingResponse(streamRetrievalResponse(payload), media_type="application/x-ndjson")


@app.post("/feedback")
async def save_feedback(payload: FeedbackRequest):
    os.makedirs("feedback", exist_ok=True)
    feedbackRecord = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "message_id": payload.message_id,
        "conversation_id": payload.conversation_id,
        "rating": payload.rating,
        "question": payload.question,
        "answer": payload.answer,
        "citations": [citation.model_dump() for citation in payload.citations],
    }
    with open(os.path.join("feedback", "feedback.jsonl"), "a", encoding="utf-8") as feedbackFile:
        feedbackFile.write(json.dumps(feedbackRecord, ensure_ascii=False) + "\n")
    return {"saved": True}
