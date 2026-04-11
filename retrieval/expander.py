def buildExpanderMessages(rawQuestion):
    systemPrompt = "You are a university assistant for FAST-NUCES. Rewrite the student question by adding related terms, synonyms, and keywords that would appear in a university handbook or policy document. Return only the expanded query. No explanation."
    userMessage = "Original question: " + rawQuestion
    systemRole = "system"
    userRole = "user"
    systemEntry = {"role": systemRole, "content": systemPrompt}
    userEntry = {"role": userRole, "content": userMessage}
    messagesList = []
    messagesList.append(systemEntry)
    messagesList.append(userEntry)
    return messagesList


def expandQuery(rawQuestion, llmClient, modelName):
    messagesList = buildExpanderMessages(rawQuestion)
    chatResource = llmClient.chat
    completionsResource = chatResource.completions
    requestModel = modelName
    requestMessages = messagesList
    requestMaxTokens = 150
    llmResponse = completionsResource.create(model=requestModel, messages=requestMessages, max_tokens=requestMaxTokens)
    firstChoiceIndex = 0
    firstChoice = llmResponse.choices[firstChoiceIndex]
    messageObject = firstChoice.message
    expandedRaw = messageObject.content
    expandedClean = expandedRaw.strip()
    return expandedClean
