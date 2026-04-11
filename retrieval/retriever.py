def buildSourceFilter(sourceFile):
    noFilter = sourceFile is None
    if noFilter:
        return None
    filterDict = {"source": {"$eq": sourceFile}}
    return filterDict


def queryCollection(chromaCollection, hydePassage, topK, metadataFilter):
    includeFields = ["documents", "metadatas", "distances"]
    hasFilter = metadataFilter is not None
    if hasFilter:
        queryResult = chromaCollection.query(query_texts=[hydePassage], n_results=topK, where=metadataFilter, include=includeFields)
    else:
        queryResult = chromaCollection.query(query_texts=[hydePassage], n_results=topK, include=includeFields)
    return queryResult


def parseQueryResult(queryResult):
    documentsList = queryResult["documents"][0]
    metadatasList = queryResult["metadatas"][0]
    distancesList = queryResult["distances"][0]
    totalChunks = len(documentsList)
    parsedChunks = []
    index = 0
    while index < totalChunks:
        chunkText = documentsList[index]
        chunkMeta = metadatasList[index]
        chunkDistance = distancesList[index]
        chunkScore = 1 - chunkDistance
        chunkDict = {"text": chunkText, "metadata": chunkMeta, "score": chunkScore}
        parsedChunks.append(chunkDict)
        index = index + 1
    return parsedChunks


def retrieveChunks(chromaCollection, hydePassage, topK, sourceFile):
    metadataFilter = buildSourceFilter(sourceFile)
    rawResult = queryCollection(chromaCollection, hydePassage, topK, metadataFilter)
    parsedChunks = parseQueryResult(rawResult)
    return parsedChunks
