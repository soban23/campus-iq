from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from httpx import HTTPError
from pydantic import BaseModel, Field
from dotenv import load_dotenv
import os
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
    max_tokens: int = Field(default=500, ge=1)
    api_key: str = os.getenv("GOOGLE_GENERATIVE_AI_API_KEY", "")
    double_check: bool = False
    show_context: bool = False
    history: list[dict[str, str]] = Field(default_factory=list)


class RetrievalResponse(BaseModel):
    expandedQuestion: str
    hydePassage: str
    chunks: list[dict[str, Any]]
    finalAnswer: str
    context: str | None = None


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

        responsePayload = RetrievalResponse(
            expandedQuestion=pipelineResult["expandedQuestion"],
            hydePassage=pipelineResult["hydePassage"],
            chunks=pipelineResult["chunks"],
            finalAnswer=finalAnswer,
            context=formattedContext if payload.show_context else None,
        )
        return responsePayload
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