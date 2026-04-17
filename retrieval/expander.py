def buildExpanderMessages(rawQuestion, recentUserMessages=None):
    systemPrompt = "You are a university assistant for FAST-NUCES. Rewrite the student question by adding related terms, synonyms, and keywords that would appear in a university handbook or policy document. If recent user messages are provided, use them only as disambiguating context. Return only the expanded query. No explanation."
    hasRecentMessages = isinstance(recentUserMessages, list) and len(recentUserMessages) > 0
    if hasRecentMessages:
        contextLines = []
        index = 0
        totalMessages = len(recentUserMessages)
        while index < totalMessages:
            messageNumber = index + 1
            messageText = str(recentUserMessages[index])
            contextLines.append(str(messageNumber) + ". " + messageText)
            index = index + 1
        contextBlock = "Recent user questions:\n" + "\n".join(contextLines)
        userMessage = contextBlock + "\n\nCurrent question: " + rawQuestion
    else:
        userMessage = "Original question: " + rawQuestion
    systemRole = "system"
    userRole = "user"
    systemEntry = {"role": systemRole, "content": systemPrompt}
    userEntry = {"role": userRole, "content": userMessage}
    messagesList = []
    messagesList.append(systemEntry)
    messagesList.append(userEntry)
    return messagesList


# def expandQuery(rawQuestion, llmClient, modelName, recentUserMessages=None):
#     messagesList = buildExpanderMessages(rawQuestion, recentUserMessages)
#     chatResource = llmClient.chat
#     completionsResource = chatResource.completions
#     requestModel = modelName
#     requestMessages = messagesList
#     requestMaxTokens = 150
#     llmResponse = completionsResource.create(model=requestModel, messages=requestMessages, max_tokens=requestMaxTokens)
#     firstChoiceIndex = 0
#     firstChoice = llmResponse.choices[firstChoiceIndex]
#     messageObject = firstChoice.message
#     expandedRaw = messageObject.content
#     expandedClean = expandedRaw.strip()
#     return expandedClean
