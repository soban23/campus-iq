import argparse
import os

import chromadb
import requests

from retrieval.answer import buildAnswerMessages
from retrieval.expander import buildExpanderMessages
from retrieval.hyde import buildHydeMessages
from retrieval.pipeline import formatChunksAsContext
from retrieval.retriever import retrieveChunks
from dotenv import load_dotenv
load_dotenv()


CHROMA_PATH = "./chroma_db"
COLLECTION_NAME = "uni_documents_2025"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b:free"


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
    envApiKey = os.getenv("OPENROUTER_API_KEY")
    if envApiKey is None:
        raise RuntimeError("OPENROUTER_API_KEY is missing. Set env var or pass --api-key.")
    if envApiKey.strip() == "":
        raise RuntimeError("OPENROUTER_API_KEY is empty. Set env var or pass --api-key.")
    return envApiKey


def createCollection():
    chromaClient = chromadb.PersistentClient(path=CHROMA_PATH)
    collection = chromaClient.get_or_create_collection(COLLECTION_NAME)
    return collection


def postChatCompletion(messagesList, modelName, maxTokens, apiKey):
    authorizationValue = "Bearer " + apiKey
    contentTypeValue = "application/json"
    headers = {"Authorization": authorizationValue, "Content-Type": contentTypeValue}
    reasoningValue = {"enabled": True}
    payload = {"model": modelName, "messages": messagesList, "max_tokens": maxTokens, "reasoning": reasoningValue}
    response = requests.post(url=OPENROUTER_URL, headers=headers, json=payload, timeout=120)
    response.raise_for_status()
    responseJson = response.json()
    return responseJson


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


def requestExpandedQuestion(questionText, modelName, apiKey):
    messagesList = buildExpanderMessages(questionText)
    maxTokensValue = 150
    responseJson = postChatCompletion(messagesList, modelName, maxTokensValue, apiKey)
    messageDict = extractMessageDict(responseJson)
    contentValue = messageDict.get("content", "")
    normalizedContent = normalizeContentValue(contentValue)
    expandedQuestion = normalizedContent.strip()
    isExpandedEmpty = expandedQuestion == ""
    if isExpandedEmpty:
        expandedQuestion = questionText
    return expandedQuestion


def requestHydePassage(expandedQuestion, modelName, apiKey):
    messagesList = buildHydeMessages(expandedQuestion)
    maxTokensValue = 250
    responseJson = postChatCompletion(messagesList, modelName, maxTokensValue, apiKey)
    messageDict = extractMessageDict(responseJson)
    contentValue = messageDict.get("content", "")
    normalizedContent = normalizeContentValue(contentValue)
    hydePassage = normalizedContent.strip()
    isHydeEmpty = hydePassage == ""
    if isHydeEmpty:
        hydePassage = expandedQuestion
    return hydePassage


def requestAnswerMessage(questionText, formattedContext, modelName, maxTokens, apiKey):
    messagesList = buildAnswerMessages(questionText, formattedContext)
    responseJson = postChatCompletion(messagesList, modelName, maxTokens, apiKey)
    messageDict = extractMessageDict(responseJson)
    return messageDict


def requestSecondPass(questionText, firstMessageDict, modelName, maxTokens, apiKey):
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
    responseJson = postChatCompletion(messagesList, modelName, maxTokens, apiKey)
    messageDict = extractMessageDict(responseJson)
    contentValue = messageDict.get("content", "")
    normalizedContent = normalizeContentValue(contentValue)
    finalSecondPassAnswer = normalizedContent.strip()
    return finalSecondPassAnswer


def runRetrieval(questionText, modelName, topK, sourceFile, apiKey):
    expandedQuestion = requestExpandedQuestion(questionText, modelName, apiKey) #raw query to expanded query(punctuation, synonyms, related terms)
    hydePassage = requestHydePassage(expandedQuestion, modelName, apiKey)#expanded query to hyde passage (sample answer without context)
    collection = createCollection()
    retrievedChunks = retrieveChunks(collection, hydePassage, topK, sourceFile)#hyde passage to retrieved chunks from vector db
    formattedContext = formatChunksAsContext(retrievedChunks)#format retrieved chunks into context string for LLM answer generation
    resultDict = {}
    resultDict["expandedQuestion"] = expandedQuestion
    resultDict["hydePassage"] = hydePassage
    resultDict["chunks"] = retrievedChunks
    resultDict["context"] = formattedContext
    return resultDict


def main():
    parser = buildArgumentParser()
    args = parser.parse_args()

    apiKey = resolveApiKey(args.api_key)
    pipelineResult = runRetrieval(args.question, args.model, args.top_k, args.source, apiKey)
    formattedContext = pipelineResult["context"]

    firstMessageDict = requestAnswerMessage(args.question, formattedContext, args.model, args.max_tokens, apiKey)#generate answer based on retrieved context + raw question
    firstAnswerRaw = firstMessageDict.get("content", "")
    firstAnswerNormalized = normalizeContentValue(firstAnswerRaw)
    finalAnswer = firstAnswerNormalized.strip()

    if args.double_check:
        secondAnswer = requestSecondPass(args.question, firstMessageDict, args.model, args.max_tokens, apiKey)
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


if __name__ == "__main__":
    main()
