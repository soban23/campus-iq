def buildRecentConversationTurns(conversationTurns, maxPairs=3):
    if not isinstance(conversationTurns, list):
        return []
    filteredTurns = []
    index = 0
    totalTurns = len(conversationTurns)
    while index < totalTurns:
        currentTurn = conversationTurns[index]
        isDictTurn = isinstance(currentTurn, dict)
        if isDictTurn:
            roleValue = currentTurn.get("role", "")
            contentValue = currentTurn.get("content", "")
            isSupportedRole = roleValue == "user" or roleValue == "assistant"
            if isSupportedRole:
                contentText = str(contentValue).strip()
                if contentText != "":
                    filteredTurns.append({"role": roleValue, "content": contentText})
        index = index + 1
    maxTurns = maxPairs * 2
    if len(filteredTurns) > maxTurns:
        filteredTurns = filteredTurns[-maxTurns:]
    return filteredTurns


def buildAnswerMessages(rawQuestion, formattedContext, conversationTurns=None):
    systemPrompt = "You are CampusIQ, a friendly assistant for FAST-NUCES students. For casual greetings, small talk, or general chat (like 'hi', 'what's up', 'thanks'), respond naturally and warmly, like a helpful person would - do not use the fallback line for these. For actual questions about university policies, rules, or academic information, answer using only the provided context. Do not mention chunk numbers, chunk labels, or retrieval internals. If a real academic/policy question has no matching context, respond exactly with: I don't have information on that. Please visit the respective university office. Keep answers concise and precise."
    contextBlock = "Context:\n" + formattedContext
    systemEntry = {"role": "system", "content": systemPrompt}
    contextEntry = {"role": "system", "content": contextBlock}
    recentTurns = buildRecentConversationTurns(conversationTurns, maxPairs=3)
    currentQuestionEntry = {"role": "user", "content": rawQuestion}
    messagesList = []
    messagesList.append(systemEntry)
    messagesList.append(contextEntry)
    messagesList.extend(recentTurns)
    messagesList.append(currentQuestionEntry)
    return messagesList


# def generateFinalAnswer(rawQuestion, formattedContext, llmClient, modelName, conversationTurns=None):
#     messagesList = buildAnswerMessages(rawQuestion, formattedContext, conversationTurns)
#     chatResource = llmClient.chat
#     completionsResource = chatResource.completions
#     requestModel = modelName
#     requestMessages = messagesList
#     requestMaxTokens = 500
#     llmResponse = completionsResource.create(model=requestModel, messages=requestMessages, max_tokens=requestMaxTokens)
#     firstChoiceIndex = 0
#     firstChoice = llmResponse.choices[firstChoiceIndex]
#     messageObject = firstChoice.message
#     answerRaw = messageObject.content
#     answerClean = answerRaw.strip()
#     return answerClean
