import os


CHUNK_SIZE = 512
MAX_BREADCRUMB_LEN = 120


def readFile(filePath):
    fileHandle = open(filePath, "r", encoding="utf-8")
    rawText = fileHandle.read()
    fileHandle.close()
    return rawText


def parseLines(rawText):
    lines = rawText.split("\n")
    return lines


def getHeaderLevel(line):
    stripped = line.strip()
    isHeader = stripped.startswith("#")
    if not isHeader:
        return 0
    level = 0
    index = 0
    length = len(stripped)
    while index < length and stripped[index] == "#":
        level = level + 1
        index = index + 1
    hasSpace = index < length and stripped[index] == " "
    if not hasSpace:
        return 0
    if level > 6:
        return 0
    return level


def getHeaderText(line, level):
    stripped = line.strip()
    headerText = stripped[level + 1:]
    headerText = headerText.strip()
    return headerText


def updateHeaderStack(stack, level, headerText):
    index = len(stack) - 1
    while index >= 0:
        existingLevel = stack[index][0]
        if existingLevel >= level:
            stack.pop(index)
        index = index - 1
    stack.append((level, headerText))
    return stack


def buildBreadcrumb(stack, filePath, maxLength):
    parts = []
    for entry in stack:
        parts.append(entry[1])
    baseName = os.path.basename(filePath)
    stemName = os.path.splitext(baseName)[0]
    parts = [stemName] + parts
    breadcrumb = " > ".join(parts)
    tooLong = len(breadcrumb) > maxLength
    if tooLong:
        breadcrumb = breadcrumb[:maxLength - 3]
        breadcrumb = breadcrumb + "..."
    return breadcrumb


def splitIntoChunks(text, maxTokens):
    chunks = []
    text = text.strip()
    words = text.split()
    totalWords = len(words)
    start = 0
    while start < totalWords:
        end = start + maxTokens
        chunkWords = words[start:end]
        piece = " ".join(chunkWords)
        piece = piece.strip()
        if piece:
            chunks.append(piece)
        start = end
    return chunks


def attachContext(chunks, breadcrumb):
    result = []
    for chunk in chunks:
        contextLine = breadcrumb
        separator = "\n\n"
        fullChunk = contextLine + separator + chunk
        result.append(fullChunk)
    return result


def chunkMarkdownFile(filePath):
    rawText = readFile(filePath)
    lines = parseLines(rawText)
    headerStack = []
    currentLines = []
    allChunks = []
    currentCrumb = buildBreadcrumb([], filePath, MAX_BREADCRUMB_LEN)
    for line in lines:
        level = getHeaderLevel(line)
        isHeader = level > 0
        if isHeader:
            hasContent = len(currentLines) > 0
            if hasContent:
                sectionText = "\n".join(currentLines)
                rawChunks = splitIntoChunks(sectionText, CHUNK_SIZE)
                tagged = attachContext(rawChunks, currentCrumb)
                allChunks.extend(tagged)
                currentLines = []
            headerText = getHeaderText(line, level)
            headerStack = updateHeaderStack(headerStack, level, headerText)
            currentCrumb = buildBreadcrumb(headerStack, filePath, MAX_BREADCRUMB_LEN)
        else:
            currentLines.append(line)
    hasRemaining = len(currentLines) > 0
    if hasRemaining:
        sectionText = "\n".join(currentLines)
        rawChunks = splitIntoChunks(sectionText, CHUNK_SIZE)
        tagged = attachContext(rawChunks, currentCrumb)
        allChunks.extend(tagged)
    return allChunks
