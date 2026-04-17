import argparse
import asyncio
import os

import chromadb
import httpx
from google import genai

from retrieval.answer import buildAnswerMessages
from retrieval.expander import buildExpanderMessages
from retrieval.hyde import buildHydeMessages
from retrieval.pipeline import formatChunksAsContext
from retrieval.retriever import retrieveChunks
from dotenv import load_dotenv
load_dotenv()


CHROMA_PATH = os.getenv("CHROMA_PATH", "./chroma_db")
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "uni_documents_2025")
DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "gemini-2.5-flash")
GROK_API_URL = os.getenv("GROK_API_URL", "https://api.groq.com/openai/v1/chat/completions")
GROK_BACKUP_MODEL = os.getenv("GROK_BACKUP_MODEL", "llama-3.3-70b-versatile")


def buildArgumentParser():
    parser = argparse.ArgumentParser()
    parser.add_argument("question")
    parser.add_argument("--source", default=None)
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--max-tokens", type=int, default=500)
    parser.add_argument("--api-key", default=None)
    parser.add_argument("--double-check", action="store_true")
    parser.add_argument("--show-context", action="store_true")
    return parser


def resolveApiKey(cliApiKey):
    if cliApiKey is not None:
        if cliApiKey.strip() != "":
            return cliApiKey
    envApiKey = os.getenv("GOOGLE_GENERATIVE_AI_API_KEY")
    if envApiKey is None:
        raise RuntimeError("GOOGLE_GENERATIVE_AI_API_KEY is missing. Set env var or pass --api-key.")
    if envApiKey.strip() == "":
        raise RuntimeError("GOOGLE_GENERATIVE_AI_API_KEY is empty. Set env var or pass --api-key.")
    return envApiKey


def resolveGrokApiKey():
    grokApiKey = os.getenv("GROK_API_KEY", "")
    if grokApiKey.strip() != "":
        return grokApiKey
    groqApiKey = os.getenv("GROQ_API_KEY", "")
    if groqApiKey.strip() != "":
        return groqApiKey
    return ""


def createCollection():
    chromaClient = chromadb.PersistentClient(path=CHROMA_PATH)
    collection = chromaClient.get_or_create_collection(COLLECTION_NAME)
    return collection


async def postChatCompletion(messagesList, modelName, maxTokens, apiKey, requestLabel="chat"):
    def normalizeMessageContent(rawValue):
        if rawValue is None:
            return ""
        if isinstance(rawValue, str):
            return rawValue
        if not isinstance(rawValue, list):
            return str(rawValue)
        textParts = []
        for itemValue in rawValue:
            if isinstance(itemValue, dict):
                textValue = itemValue.get("text", "")
                if isinstance(textValue, str):
                    textParts.append(textValue)
        return " ".join(textParts)

    def buildPromptFromMessages(rawMessages):
        lines = []
        for message in rawMessages:
            if not isinstance(message, dict):
                continue
            roleValue = str(message.get("role", "user")).strip().lower()
            contentText = normalizeMessageContent(message.get("content", "")).strip()
            if contentText == "":
                continue
            lineValue = roleValue.upper() + ":\n" + contentText
            lines.append(lineValue)
        promptText = "\n\n".join(lines)
        return promptText

    def invokeModelSync(rawMessages, selectedModel, tokenLimit, selectedApiKey):
        client = genai.Client(api_key=selectedApiKey)
        promptText = buildPromptFromMessages(rawMessages)
        response = client.models.generate_content(
            model=selectedModel,
            contents=promptText,
            config={"max_output_tokens": tokenLimit},
        )
        responseText = getattr(response, "text", "")
        if responseText is None:
            responseText = ""
        responseText = str(responseText)
        return {"choices": [{"message": {"content": responseText}}]}

    try:
        responseJson = await asyncio.to_thread(invokeModelSync, messagesList, modelName, maxTokens, apiKey)
        print(f"[RAG][{requestLabel}] Provider=Gemini Model={modelName}")
        return responseJson
    except Exception as geminiError:
        print(f"[RAG][{requestLabel}] Gemini failed on model={modelName}. Trying Grok fallback.")
        fallbackApiKey = resolveGrokApiKey()
        if fallbackApiKey == "":
            raise RuntimeError("Gemini request failed and GROK_API_KEY is missing for fallback.") from geminiError

        fallbackHeaders = {
            "Authorization": "Bearer " + fallbackApiKey,
            "Content-Type": "application/json",
        }
        fallbackPayload = {
            "model": GROK_BACKUP_MODEL,
            "messages": messagesList,
            "max_tokens": maxTokens,
        }

        try:
            async with httpx.AsyncClient(timeout=120) as client:
                fallbackResponse = await client.post(url=GROK_API_URL, headers=fallbackHeaders, json=fallbackPayload)
            fallbackResponse.raise_for_status()
            fallbackJson = fallbackResponse.json()
            print(f"[RAG][{requestLabel}] Provider=GrokFallback Model={GROK_BACKUP_MODEL}")
            return fallbackJson
        except Exception as fallbackError:
            raise RuntimeError(
                "Gemini request failed and Grok fallback also failed: " + str(fallbackError)
            ) from fallbackError


def extractMessageDict(responseJson):
    choicesList = responseJson.get("choices", [])
    totalChoices = len(choicesList)
    hasChoices = totalChoices > 0
    if not hasChoices:
        emptyDict = {}
        return emptyDict
    firstChoiceIndex = 0
    firstChoice = choicesList[firstChoiceIndex]
    messageDict = firstChoice.get("message", {})
    if messageDict is None:
        messageDict = {}
    return messageDict


def normalizeContentValue(contentValue):
    if contentValue is None:
        emptyString = ""
        return emptyString
    isStringValue = isinstance(contentValue, str)
    if isStringValue:
        return contentValue
    isListValue = isinstance(contentValue, list)
    if not isListValue:
        fallbackString = str(contentValue)
        return fallbackString
    textParts = []
    index = 0
    totalItems = len(contentValue)
    while index < totalItems:
        itemValue = contentValue[index]
        isDictItem = isinstance(itemValue, dict)
        if isDictItem:
            textValue = itemValue.get("text", "")
            textIsString = isinstance(textValue, str)
            if textIsString:
                textParts.append(textValue)
        index = index + 1
    normalizedString = " ".join(textParts)
    return normalizedString


def extractRecentUserMessages(conversationTurns, maxMessages):
    if not isinstance(conversationTurns, list):
        return []
    userMessages = []
    index = 0
    totalTurns = len(conversationTurns)
    while index < totalTurns:
        turnValue = conversationTurns[index]
        isDictTurn = isinstance(turnValue, dict)
        if isDictTurn:
            roleValue = turnValue.get("role", "")
            if roleValue == "user":
                contentValue = turnValue.get("content", "")
                contentText = str(contentValue).strip()
                if contentText != "":
                    userMessages.append(contentText)
        index = index + 1
    if len(userMessages) > maxMessages:
        userMessages = userMessages[-maxMessages:]
    return userMessages


async def requestExpandedQuestion(questionText, modelName, apiKey, recentUserMessages=None):
    messagesList = buildExpanderMessages(questionText, recentUserMessages)
    maxTokensValue = 150
    responseJson = await postChatCompletion(messagesList, modelName, maxTokensValue, apiKey, requestLabel="expansion")
    messageDict = extractMessageDict(responseJson)
    contentValue = messageDict.get("content", "")
    normalizedContent = normalizeContentValue(contentValue)
    expandedQuestion = normalizedContent.strip()
    isExpandedEmpty = expandedQuestion == ""
    if isExpandedEmpty:
        expandedQuestion = questionText
    print(f"[RAG][expansion] Response={expandedQuestion}")
    return expandedQuestion


async def requestHydePassage(expandedQuestion, modelName, apiKey, recentUserMessages=None):
    messagesList = buildHydeMessages(expandedQuestion, recentUserMessages)
    maxTokensValue = 250
    responseJson = await postChatCompletion(messagesList, modelName, maxTokensValue, apiKey, requestLabel="hyde")
    messageDict = extractMessageDict(responseJson)
    contentValue = messageDict.get("content", "")
    normalizedContent = normalizeContentValue(contentValue)
    hydePassage = normalizedContent.strip()
    isHydeEmpty = hydePassage == ""
    if isHydeEmpty:
        hydePassage = expandedQuestion
    print(f"[RAG][hyde] Response={hydePassage}")
    return hydePassage


async def requestAnswerMessage(questionText, formattedContext, modelName, maxTokens, apiKey, conversationTurns=None):
    messagesList = buildAnswerMessages(questionText, formattedContext, conversationTurns)
    responseJson = await postChatCompletion(messagesList, modelName, maxTokens, apiKey, requestLabel="answer")
    messageDict = extractMessageDict(responseJson)
    return messageDict


async def requestSecondPass(questionText, firstMessageDict, modelName, maxTokens, apiKey):
    userRoleValue = "user"
    assistantRoleValue = "assistant"
    firstUserMessage = {"role": userRoleValue, "content": questionText}
    firstAssistantContentRaw = firstMessageDict.get("content", "")
    firstAssistantContent = normalizeContentValue(firstAssistantContentRaw)
    assistantMessage = {"role": assistantRoleValue, "content": firstAssistantContent}
    reasoningDetailsValue = firstMessageDict.get("reasoning_details")
    hasReasoningDetails = reasoningDetailsValue is not None
    if hasReasoningDetails:
        assistantMessage["reasoning_details"] = reasoningDetailsValue
    userMessageTwo = {"role": "user", "content": "Are you sure? Think carefully."}
    messagesList = [firstUserMessage, assistantMessage, userMessageTwo]
    responseJson = await postChatCompletion(messagesList, modelName, maxTokens, apiKey, requestLabel="second-pass")
    messageDict = extractMessageDict(responseJson)
    contentValue = messageDict.get("content", "")
    normalizedContent = normalizeContentValue(contentValue)
    finalSecondPassAnswer = normalizedContent.strip()
    return finalSecondPassAnswer


async def runRetrieval(questionText, modelName, topK, sourceFile, apiKey, conversationTurns=None):
    print(f"[RAG] Starting retrieval with requested model={modelName}")
    recentUserMessages = extractRecentUserMessages(conversationTurns, maxMessages=2)
    expandedQuestion = await requestExpandedQuestion(questionText, modelName, apiKey, recentUserMessages) #raw query to expanded query(punctuation, synonyms, related terms)
    # sleep(3)
    hydePassage = await requestHydePassage(expandedQuestion, modelName, apiKey, recentUserMessages)#expanded query to hyde passage (sample answer without context)
    collection = createCollection()
    retrievedChunks = retrieveChunks(collection, hydePassage, topK, sourceFile)#hyde passage to retrieved chunks from vector db
    formattedContext = formatChunksAsContext(retrievedChunks)#format retrieved chunks into context string for LLM answer generation
    resultDict = {}
    resultDict["expandedQuestion"] = expandedQuestion
    resultDict["hydePassage"] = hydePassage
    resultDict["chunks"] = retrievedChunks
    resultDict["context"] = formattedContext
    return resultDict


async def asyncMain():
    parser = buildArgumentParser()
    args = parser.parse_args()

    apiKey = resolveApiKey(args.api_key)
    pipelineResult = await runRetrieval(args.question, args.model, args.top_k, args.source, apiKey)
    formattedContext = pipelineResult["context"]

    firstMessageDict = await requestAnswerMessage(args.question, formattedContext, args.model, args.max_tokens, apiKey)#generate answer based on retrieved context + raw question
    firstAnswerRaw = firstMessageDict.get("content", "")
    firstAnswerNormalized = normalizeContentValue(firstAnswerRaw)
    finalAnswer = firstAnswerNormalized.strip()

    if args.double_check:
        secondAnswer = await requestSecondPass(args.question, firstMessageDict, args.model, args.max_tokens, apiKey)
        finalAnswer = secondAnswer

    print("Expanded Query:")
    print(pipelineResult["expandedQuestion"])
    print("")
    print("HyDE Passage:")
    print(pipelineResult["hydePassage"])
    print("")

    if args.show_context:
        print("Context:")
        print(formattedContext)
        print("")

    print("Final Answer:")
    print(finalAnswer)


def main():
    asyncio.run(asyncMain())


if __name__ == "__main__":
    main()
