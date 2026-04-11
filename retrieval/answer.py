def buildAnswerMessages(rawQuestion, formattedContext):
    systemPrompt = "You are CampusIQ, a university assistant for FAST-NUCES. Answer the student question using only the provided context chunks. Each chunk is labeled with its source document and section via a breadcrumb. If the answer is not present in the context, say you do not have that information. Be concise and precise."
    contextBlock = "Context:\n" + formattedContext
    questionBlock = "Student Question: " + rawQuestion
    userMessage = contextBlock + "\n\n" + questionBlock
    systemRole = "system"
    userRole = "user"
    systemEntry = {"role": systemRole, "content": systemPrompt}
    userEntry = {"role": userRole, "content": userMessage}
    messagesList = []
    messagesList.append(systemEntry)
    messagesList.append(userEntry)
    return messagesList


def generateFinalAnswer(rawQuestion, formattedContext, llmClient, modelName):
    messagesList = buildAnswerMessages(rawQuestion, formattedContext)
    chatResource = llmClient.chat
    completionsResource = chatResource.completions
    requestModel = modelName
    requestMessages = messagesList
    requestMaxTokens = 500
    llmResponse = completionsResource.create(model=requestModel, messages=requestMessages, max_tokens=requestMaxTokens)
    firstChoiceIndex = 0
    firstChoice = llmResponse.choices[firstChoiceIndex]
    messageObject = firstChoice.message
    answerRaw = messageObject.content
    answerClean = answerRaw.strip()
    return answerClean
