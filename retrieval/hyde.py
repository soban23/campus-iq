def buildHydeMessages(expandedQuestion):
    systemPrompt = "You are a FAST-NUCES university handbook. Write a 3 to 5 sentence formal policy passage that directly answers the question. Write as if the text is extracted from a printed university handbook. Do not say according to or reference yourself."
    userMessage = "Question: " + expandedQuestion
    systemRole = "system"
    userRole = "user"
    systemEntry = {"role": systemRole, "content": systemPrompt}
    userEntry = {"role": userRole, "content": userMessage}
    messagesList = []
    messagesList.append(systemEntry)
    messagesList.append(userEntry)
    return messagesList


def generateHydePassage(expandedQuestion, llmClient, modelName):
    messagesList = buildHydeMessages(expandedQuestion)
    chatResource = llmClient.chat
    completionsResource = chatResource.completions
    requestModel = modelName
    requestMessages = messagesList
    requestMaxTokens = 250
    llmResponse = completionsResource.create(model=requestModel, messages=requestMessages, max_tokens=requestMaxTokens)
    firstChoiceIndex = 0
    firstChoice = llmResponse.choices[firstChoiceIndex]
    messageObject = firstChoice.message
    hydeRaw = messageObject.content
    hydeClean = hydeRaw.strip()
    return hydeClean
