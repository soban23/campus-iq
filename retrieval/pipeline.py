from retrieval.expander import expandQuery
from retrieval.hyde import generateHydePassage
from retrieval.retriever import retrieveChunks


def formatChunksAsContext(parsedChunks):
    contextParts = []
    chunkNumber = 1
    totalChunks = len(parsedChunks)
    while chunkNumber <= totalChunks:
        currentIndex = chunkNumber - 1
        singleChunk = parsedChunks[currentIndex]
        chunkText = singleChunk["text"]
        chunkMeta = singleChunk["metadata"]
        breadcrumb = chunkMeta.get("breadcrumb", "unknown")
        scoreValue = singleChunk["score"]
        scoreRounded = round(scoreValue, 3)
        headerLine = "--- Chunk " + str(chunkNumber) + " | " + breadcrumb + " | Score: " + str(scoreRounded) + " ---"
        contextParts.append(headerLine)
        contextParts.append(chunkText)
        chunkNumber = chunkNumber + 1
    separator = "\n\n"
    fullContext = separator.join(contextParts)
    return fullContext


# def runRetrievalPipeline(rawQuestion, llmClient, modelName, chromaCollection, topK, sourceFile):
#     expandedQuestion = expandQuery(rawQuestion, llmClient, modelName)
#     hydePassage = generateHydePassage(expandedQuestion, llmClient, modelName)
#     retrievedChunks = retrieveChunks(chromaCollection, hydePassage, topK, sourceFile)
#     formattedContext = formatChunksAsContext(retrievedChunks)
#     pipelineResult = {}
#     pipelineResult["expandedQuestion"] = expandedQuestion
#     pipelineResult["hydePassage"] = hydePassage
#     pipelineResult["chunks"] = retrievedChunks
#     pipelineResult["context"] = formattedContext
#     return pipelineResult
