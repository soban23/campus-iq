import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import FastLoadingScreen from './components/FastLoadingScreen'

const markdownComponents = {
  p: ({ children }) => <p className="mb-2 max-w-full break-words last:mb-0 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 list-disc pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal pl-5">{children}</ol>,
  li: ({ children }) => <li className="mb-1">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  pre: ({ children }) => (
    <pre className="my-2 max-w-full overflow-x-auto border border-[#333] bg-[#0a0a0a] p-2 font-mono-ui text-[12px] text-[#ccc]">
      {children}
    </pre>
  ),
  code: ({ children }) => (
    <code className="max-w-full rounded-none border border-[#333] bg-[#111] px-1.5 py-0.5 font-mono-ui text-[12px] text-[#ccc]">
      {children}
    </code>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto border border-[#333] bg-[#0a0a0a]">
      <table className="min-w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-[#1a1a1a]">{children}</thead>,
  th: ({ children }) => (
    <th className="border border-[#333] px-2 py-1 text-left font-semibold text-[#e8e8e8] uppercase tracking-wider text-[10px]">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border border-[#333] px-2 py-1 align-top text-[#aaa]">{children}</td>,
}

const STORAGE_KEY = 'campus-iq-chat-state-v1'

function createMessageId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createWelcomeMessage() {
  return {
    id: 'welcome',
    role: 'assistant',
    content:
      'Welcome to **CampusIQ**. Ask me anything about FAST university policies, rules, or handbook details — I will answer.',
  }
}

const FALLBACK_MESSAGES = [createWelcomeMessage()]

function createConversation(messages = [createWelcomeMessage()]) {
  const now = new Date().toISOString()
  return {
    id: createMessageId('chat'),
    name: 'New Chat',
    createdAt: now,
    updatedAt: now,
    messages,
  }
}

function isSupportedMessage(message) {
  return (
    message &&
    typeof message === 'object' &&
    typeof message.content === 'string' &&
    ['assistant', 'user', 'error'].includes(message.role)
  )
}

function normalizeStoredMessages(rawMessages) {
  if (!Array.isArray(rawMessages)) {
    return [createWelcomeMessage()]
  }

  const messages = rawMessages.filter(isSupportedMessage).map((message) => ({
    id: typeof message.id === 'string' ? message.id : createMessageId(message.role[0] ?? 'm'),
    role: message.role,
    content: message.content,
    createdAt: typeof message.createdAt === 'string' ? message.createdAt : undefined,
    citations: Array.isArray(message.citations) ? message.citations : [],
  }))

  if (!messages.some((message) => message.id === 'welcome')) {
    messages.unshift(createWelcomeMessage())
  }

  return messages.length > 0 ? messages : [createWelcomeMessage()]
}

function normalizeStoredConversations(parsedState) {
  const rawConversations = Array.isArray(parsedState?.conversations)
    ? parsedState.conversations
    : Array.isArray(parsedState?.messages)
      ? [{ id: 'legacy-chat', name: 'Saved Chat', messages: parsedState.messages }]
      : []

  const conversations = rawConversations
    .filter((conversation) => conversation && typeof conversation === 'object')
    .map((conversation) => ({
      id: typeof conversation.id === 'string' ? conversation.id : createMessageId('chat'),
      name: typeof conversation.name === 'string' && conversation.name.trim() ? conversation.name : 'Saved Chat',
      createdAt: typeof conversation.createdAt === 'string' ? conversation.createdAt : new Date().toISOString(),
      updatedAt: typeof conversation.updatedAt === 'string' ? conversation.updatedAt : new Date().toISOString(),
      messages: normalizeStoredMessages(conversation.messages),
    }))

  return conversations.length > 0 ? conversations : [createConversation()]
}

function loadStoredChatState() {
  try {
    const storedValue = window.localStorage.getItem(STORAGE_KEY)
    if (!storedValue) {
      const conversation = createConversation()
      return { conversations: [conversation], activeConversationId: conversation.id }
    }

    const parsedState = JSON.parse(storedValue)
    const conversations = normalizeStoredConversations(parsedState)
    const storedActiveId = typeof parsedState?.activeConversationId === 'string' ? parsedState.activeConversationId : ''
    const activeConversationId = conversations.some((conversation) => conversation.id === storedActiveId)
      ? storedActiveId
      : conversations[0].id

    return { conversations, activeConversationId }
  } catch {
    const conversation = createConversation()
    return { conversations: [conversation], activeConversationId: conversation.id }
  }
}

function prepareMessagesForStorage(messages) {
  return normalizeStoredMessages(messages).map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    citations: Array.isArray(message.citations) ? message.citations : [],
  }))
}

function getConversationName(conversation, messages) {
  const hasCustomName = conversation.name && conversation.name !== 'New Chat' && conversation.name !== 'Saved Chat'
  if (hasCustomName) {
    return conversation.name
  }

  const firstUserMessage = messages.find((message) => message.role === 'user')
  if (!firstUserMessage) {
    return conversation.name || 'New Chat'
  }

  const cleanName = firstUserMessage.content.replace(/\s+/g, ' ').trim()
  return cleanName.length > 36 ? `${cleanName.slice(0, 36)}...` : cleanName
}

function buildConversationHistory(messageList) {
  return messageList
    .filter((message) => (message.role === 'user' || message.role === 'assistant') && message.id !== 'welcome')
    .map((message) => ({ role: message.role, content: message.content }))
}

function normalizeCitation(rawCitation, index) {
  const source = String(rawCitation?.source ?? rawCitation?.metadata?.source ?? 'unknown source').trim()
  const rawChunkIndex = rawCitation?.chunk_index ?? rawCitation?.chunkIndex ?? rawCitation?.metadata?.chunk_index ?? index
  const parsedChunkIndex = Number(rawChunkIndex)
  const rawRelevance = rawCitation?.relevance ?? rawCitation?.score
  const parsedRelevance = Number(rawRelevance)
  const breadcrumb = rawCitation?.breadcrumb ?? rawCitation?.metadata?.breadcrumb

  return {
    source: source || 'unknown source',
    chunkIndex: Number.isFinite(parsedChunkIndex) ? parsedChunkIndex : index,
    relevance: Number.isFinite(parsedRelevance) ? parsedRelevance : null,
    breadcrumb: typeof breadcrumb === 'string' && breadcrumb.trim() ? breadcrumb.trim() : null,
  }
}

function buildCitationsFromChunks(chunks) {
  if (!Array.isArray(chunks)) {
    return []
  }
  return chunks.slice(0, 5).map((chunk, index) => normalizeCitation(chunk, index))
}

function getMessageCitations(message) {
  if (Array.isArray(message.citations) && message.citations.length > 0) {
    return message.citations.slice(0, 5).map((citation, index) => normalizeCitation(citation, index))
  }
  return buildCitationsFromChunks(message.chunks)
}

function formatRelevance(value) {
  if (!Number.isFinite(value)) {
    return 'n/a'
  }
  const clampedPercent = Math.max(0, Math.min(100, value * 100))
  return `${Math.round(clampedPercent)}% relevance`
}

function toPlainText(markdownText) {
  return String(markdownText)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_>#-]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function copyPlainText(text) {
  const plainText = toPlainText(text)
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(plainText)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = plainText
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

function sanitizeErrorText(rawText) {
  let sanitized = String(rawText)
  sanitized = sanitized.replace(/https?:\/\/\S+/gi, '[link]')
  sanitized = sanitized.replace(/\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/gi, '[email]')
  sanitized = sanitized.replace(/\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [token]')
  sanitized = sanitized.replace(/\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, '[sensitive]')
  sanitized = sanitized.trim()
  if (sanitized.length > 220) {
    sanitized = sanitized.slice(0, 220) + '...'
  }
  return sanitized
}

function getSafeErrorMessage(requestError) {
  if (!(requestError instanceof Error)) {
    return 'Something went wrong. Please try again.'
  }
  const rawMessage = requestError.message || 'Something went wrong.'
  const rateLimitError = /\b429\b|too many requests|rate\s*limit|ratelimit/i.test(rawMessage)
  if (rateLimitError) {
    return 'Too many requests. Please try again shortly.'
  }
  const networkLikeError = /failed to fetch|networkerror|network error|load failed/i.test(rawMessage)
  if (networkLikeError) {
    return 'Unable to connect right now. Please try again in a moment.'
  }
  const safeMessage = sanitizeErrorText(rawMessage)
  if (safeMessage === '') {
    return 'Something went wrong. Please try again.'
  }
  return safeMessage
}

function getUniqueSuggestions(candidates) {
  const seen = new Set()
  const unique = []
  for (const candidate of candidates) {
    const cleanCandidate = String(candidate).replace(/\s+/g, ' ').trim()
    const key = cleanCandidate.toLowerCase()
    if (cleanCandidate !== '' && !seen.has(key)) {
      unique.push(cleanCandidate)
      seen.add(key)
    }
    if (unique.length === 3) {
      return unique
    }
  }
  return unique
}

function buildFollowUpSuggestions(answerText) {
  const normalizedAnswer = String(answerText).toLowerCase()
  if (normalizedAnswer.trim() === '') {
    return []
  }

  const candidates = []
  if (normalizedAnswer.includes('attendance')) {
    candidates.push('What happens if attendance is short?', 'Summarize the attendance rules', 'Is there any exception?')
  }
  if (normalizedAnswer.includes('withdraw') || normalizedAnswer.includes('drop')) {
    candidates.push('What is the withdrawal deadline?', 'Does this affect GPA?', 'Compare drop and withdrawal')
  }
  if (normalizedAnswer.includes('fee') || normalizedAnswer.includes('refund') || normalizedAnswer.includes('payment')) {
    candidates.push('Explain the fee policy simply', 'What is the refund rule?', 'What happens after late payment?')
  }
  if (normalizedAnswer.includes('cgpa') || normalizedAnswer.includes('gpa') || normalizedAnswer.includes('probation')) {
    candidates.push('What if CGPA stays low?', 'Explain academic probation', 'How can a student recover?')
  }
  if (normalizedAnswer.includes('exam') || normalizedAnswer.includes('midterm') || normalizedAnswer.includes('final')) {
    candidates.push('What if an exam is missed?', 'Explain makeup exam rules', 'Summarize exam policy')
  }
  if (normalizedAnswer.includes('admission') || normalizedAnswer.includes('eligibility') || normalizedAnswer.includes('merit')) {
    candidates.push('Explain eligibility criteria', 'How is merit calculated?', 'What documents are required?')
  }

  candidates.push('Explain this further', 'Summarize this topic', 'Give a practical example')
  return getUniqueSuggestions(candidates)
}

function App() {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'
  const [chatState, setChatState] = useState(loadStoredChatState)
  const [question, setQuestion] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isBooting, setIsBooting] = useState(true)
  const [error, setError] = useState('')
  const [copiedMessageId, setCopiedMessageId] = useState('')
  const [isMobileControlsOpen, setIsMobileControlsOpen] = useState(false)
  const messageEndRef = useRef(null)
  const activeConversation =
    chatState.conversations.find((conversation) => conversation.id === chatState.activeConversationId) ??
    chatState.conversations[0]
  const messages = activeConversation?.messages ?? FALLBACK_MESSAGES
  const latestAssistantMessageId = [...messages]
    .reverse()
    .find((message) => message.role === 'assistant' && message.id !== 'welcome')?.id

  useEffect(() => {
    const startupTimer = window.setTimeout(() => {
      setIsBooting(false)
    }, 2300)

    return () => window.clearTimeout(startupTimer)
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          activeConversationId: chatState.activeConversationId,
          conversations: chatState.conversations.map((conversation) => ({
            ...conversation,
            messages: prepareMessagesForStorage(conversation.messages),
          })),
        }),
      )
    } catch {
      // Storage may be unavailable or full; chat still works in memory.
    }
  }, [chatState])

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isSending])

  const updateConversationMessages = (conversationId, updater) => {
    setChatState((previousState) => ({
      ...previousState,
      conversations: previousState.conversations.map((conversation) => {
        if (conversation.id !== conversationId) {
          return conversation
        }

        const nextMessages = updater(conversation.messages)
        return {
          ...conversation,
          name: getConversationName(conversation, nextMessages),
          updatedAt: new Date().toISOString(),
          messages: nextMessages,
        }
      }),
    }))
  }

  const handlePromptKeyDown = (event) => {
    const isEnter = event.key === 'Enter'
    const isShiftEnter = event.shiftKey
    const isComposing = event.nativeEvent.isComposing
    if (isEnter && !isShiftEnter && !isComposing) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  const sendQuestionText = async (trimmedQuestion, options = {}) => {
    if (!trimmedQuestion || isSending) {
      return
    }

    const targetConversationId = options.conversationId ?? chatState.activeConversationId
    const baseMessages = options.baseMessages ?? messages
    const conversationHistory = buildConversationHistory(baseMessages)

    const userMessage = {
      id: createMessageId('u'),
      role: 'user',
      content: trimmedQuestion,
      createdAt: new Date().toISOString(),
    }

    if (options.appendUser !== false) {
      updateConversationMessages(targetConversationId, (previousMessages) => [...previousMessages, userMessage])
    }
    setError('')
    setIsSending(true)
    setCopiedMessageId('')

    try {
      const response = await fetch(`${API_BASE_URL}/rag/retrieve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: trimmedQuestion,
          history: conversationHistory,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        const detail = typeof data?.detail === 'string' ? data.detail : 'Request failed.'
        throw new Error(detail)
      }

      const assistantMessage = {
        id: createMessageId('a'),
        role: 'assistant',
        content: data.finalAnswer ?? 'No answer returned.',
        createdAt: new Date().toISOString(),
        expandedQuestion: data.expandedQuestion,
        hydePassage: data.hydePassage,
        context: data.context,
        citations: Array.isArray(data.citations) ? data.citations : [],
        chunks: Array.isArray(data.chunks) ? data.chunks : [],
      }
      updateConversationMessages(targetConversationId, (previousMessages) => [...previousMessages, assistantMessage])
    } catch (requestError) {
      const failureMessage = getSafeErrorMessage(requestError)
      setError(failureMessage)
      updateConversationMessages(targetConversationId, (previousMessages) => [
        ...previousMessages,
        {
          id: createMessageId('e'),
          role: 'error',
          content: failureMessage,
          createdAt: new Date().toISOString(),
        },
      ])
    } finally {
      setIsSending(false)
    }
  }

  const sendQuestion = async (event) => {
    event.preventDefault()
    const trimmedQuestion = question.trim()
    if (!trimmedQuestion || isSending) {
      return
    }

    setQuestion('')
    await sendQuestionText(trimmedQuestion, { appendUser: true, baseMessages: messages })
  }

  const sendSuggestedQuestion = async (suggestion) => {
    if (isSending) {
      return
    }
    setQuestion('')
    await sendQuestionText(suggestion, { appendUser: true, baseMessages: messages })
  }

  const retryLastResponse = async () => {
    if (isSending) {
      return
    }

    const lastAssistantIndex = messages
      .map((message, index) => ({ message, index }))
      .reverse()
      .find(({ message }) => message.role === 'assistant' && message.id !== 'welcome')?.index

    if (lastAssistantIndex === undefined) {
      return
    }

    const previousUserIndex = messages
      .slice(0, lastAssistantIndex)
      .map((message, index) => ({ message, index }))
      .reverse()
      .find(({ message }) => message.role === 'user')?.index

    if (previousUserIndex === undefined) {
      return
    }

    const promptToRetry = messages[previousUserIndex].content
    const baseMessages = messages.slice(0, previousUserIndex)
    const visibleMessages = messages.slice(0, lastAssistantIndex)

    updateConversationMessages(activeConversation.id, () => visibleMessages)
    await sendQuestionText(promptToRetry, {
      appendUser: false,
      baseMessages,
      conversationId: activeConversation.id,
    })
  }

  const copyResponse = async (message) => {
    try {
      await copyPlainText(message.content)
      setCopiedMessageId(message.id)
      window.setTimeout(() => {
        setCopiedMessageId((currentId) => (currentId === message.id ? '' : currentId))
      }, 1400)
    } catch {
      setError('Unable to copy response.')
    }
  }

  const startNewChat = () => {
    const conversation = createConversation()
    setChatState((previousState) => ({
      activeConversationId: conversation.id,
      conversations: [conversation, ...previousState.conversations],
    }))
    setQuestion('')
    setError('')
    setCopiedMessageId('')
  }

  const clearCurrentChat = () => {
    if (!activeConversation || isSending) {
      return
    }
    updateConversationMessages(activeConversation.id, () => [createWelcomeMessage()])
    setQuestion('')
    setError('')
    setCopiedMessageId('')
  }

  const selectConversation = (event) => {
    setChatState((previousState) => ({
      ...previousState,
      activeConversationId: event.target.value,
    }))
    setQuestion('')
    setError('')
    setCopiedMessageId('')
    setIsMobileControlsOpen(false)
  }

  if (isBooting) {
    return <FastLoadingScreen />
  }

  return (
    <div className="crt-scanlines noise-bg crt-flicker relative min-h-dvh overflow-x-hidden bg-[#0a0a0a] text-[#e8e8e8]">
      {/* Vignette */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%)',
        }}
      />

      {/* Subtle grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />

      {/* Corner decorations */}
      <div className="pointer-events-none absolute left-4 top-4 text-[10px] text-[#333] font-mono-ui select-none">
        ┌─────
      </div>
      <div className="pointer-events-none absolute right-4 top-4 text-[10px] text-[#333] font-mono-ui select-none">
        ─────┐
      </div>
      <div className="pointer-events-none absolute left-4 bottom-4 text-[10px] text-[#333] font-mono-ui select-none">
        └─────
      </div>
      <div className="pointer-events-none absolute right-4 bottom-4 text-[10px] text-[#333] font-mono-ui select-none">
        ─────┘
      </div>

      <div className="chat-shell mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-3 pb-3 pt-3 sm:px-6 sm:pb-5 sm:pt-5 lg:px-8 lg:pb-6 lg:pt-6">
        <main className="relative flex min-h-0 flex-1 flex-col gap-3 sm:gap-4">
          {/* Header */}
          <header className="flex flex-col gap-3 border border-[#333] bg-[#111] p-3 sm:gap-4 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              {/* Terminal icon */}
                <div className="font-mono-ui text-[18px] text-[#555] leading-none select-none">
                  {'>'}_
                </div>
                <div className="min-w-0">
                  <h1 className="font-display text-base font-bold uppercase tracking-[0.12em] text-[#e8e8e8] retro-glow sm:text-lg">
                    CampusIQ
                  </h1>
                  <p className="truncate font-mono-ui text-[9px] uppercase tracking-[0.16em] text-[#555] sm:text-[10px] sm:tracking-[0.2em]">
                    Retrieval-Augmented Chat Terminal
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileControlsOpen((isOpen) => !isOpen)}
                className="min-h-10 border border-[#333] bg-[#0a0a0a] px-3 py-2 font-mono-ui text-[10px] font-semibold uppercase tracking-[0.15em] text-[#888] transition-colors hover:border-[#555] hover:text-[#e8e8e8] lg:hidden"
                aria-expanded={isMobileControlsOpen}
                aria-controls="chat-controls"
              >
                {isMobileControlsOpen ? 'Close' : 'Menu'}
              </button>
            </div>
            <div
              id="chat-controls"
              className={`chat-controls flex-col gap-2 lg:flex lg:flex-row lg:flex-wrap lg:items-center lg:justify-end ${
                isMobileControlsOpen ? 'flex' : 'hidden'
              }`}
            >
              <select
                value={activeConversation?.id ?? ''}
                onChange={selectConversation}
                disabled={isSending}
                className="min-h-10 w-full border border-[#333] bg-[#0a0a0a] px-2 py-2 font-mono-ui text-[10px] uppercase tracking-wider text-[#888] outline-none lg:max-w-44"
                aria-label="Select conversation"
              >
                {chatState.conversations.map((conversation) => (
                  <option key={conversation.id} value={conversation.id}>
                    {conversation.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={startNewChat}
                disabled={isSending}
                className="min-h-10 border border-[#333] bg-[#0a0a0a] px-3 py-2 font-mono-ui text-[10px] font-semibold uppercase tracking-[0.15em] text-[#888] transition-colors hover:border-[#555] hover:text-[#e8e8e8] disabled:opacity-30"
              >
                New Chat
              </button>
              <button
                type="button"
                onClick={clearCurrentChat}
                disabled={isSending}
                className="min-h-10 border border-[#333] bg-[#0a0a0a] px-3 py-2 font-mono-ui text-[10px] font-semibold uppercase tracking-[0.15em] text-[#888] transition-colors hover:border-[#555] hover:text-[#e8e8e8] disabled:opacity-30"
              >
                Clear
              </button>
              <span className="font-mono-ui text-[10px] tracking-wider text-[#555] uppercase hidden sm:inline">
                SYS:OK
              </span>
              <span className="flex min-h-10 items-center gap-1.5 border border-[#333] bg-[#0a0a0a] px-3 py-2">
                <span className="h-1.5 w-1.5 bg-[#e8e8e8] thinking-dot" />
                <span className="font-mono-ui text-[10px] font-semibold uppercase tracking-[0.15em] text-[#888]">
                  Live
                </span>
              </span>
            </div>
          </header>

          {/* Messages area */}
          <section className="chat-log min-h-[42vh] flex-1 space-y-3 overflow-y-auto overflow-x-hidden border border-[#333] bg-[#0d0d0d] p-3 sm:p-5">
            {/* Decorative header inside message area */}
            <div className="font-mono-ui text-[9px] text-[#333] tracking-widest uppercase select-none border-b border-[#1a1a1a] pb-2 mb-3">
              ══════ conversation log ══════
            </div>

            {messages.map((message) => {
              const citations = getMessageCitations(message)
              const isLatestAssistant = message.id === latestAssistantMessageId
              const followUpSuggestions =
                message.role === 'assistant' && message.id !== 'welcome'
                  ? buildFollowUpSuggestions(message.content)
                  : []

              return (
                <article
                  key={message.id}
                  className={`message-card w-full max-w-full px-3 py-3 text-sm transition-all duration-200 sm:max-w-3xl sm:px-4 ${
                    message.role === 'user'
                      ? 'ml-auto border border-[#e8e8e8] bg-[#e8e8e8] text-[#0a0a0a]'
                      : message.role === 'error'
                        ? 'mr-auto border border-[#555] bg-[#1a1a1a] text-[#aaa]'
                        : 'mr-auto border border-[#282828] bg-[#111] text-[#ccc]'
                  }`}
                >
                  <header
                    className={`mb-2 font-mono-ui text-[10px] font-semibold uppercase tracking-[0.2em] ${
                      message.role === 'user'
                        ? 'text-[#555]'
                        : message.role === 'error'
                          ? 'text-[#888]'
                          : 'text-[#666]'
                    }`}
                  >
                    {message.role === 'user'
                      ? '▶ You'
                      : message.role === 'error'
                        ? '✕ Error'
                        : '◆ CampusIQ'}
                  </header>
                  {message.role === 'assistant' ? (
                    <div className="message-content max-w-full overflow-hidden break-words text-sm leading-relaxed text-[#ccc]">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="max-w-full whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
                  )}

                  {message.role === 'assistant' && message.id !== 'welcome' && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => copyResponse(message)}
                        className="min-h-9 border border-[#282828] bg-[#0a0a0a] px-3 py-2 font-mono-ui text-[10px] font-semibold uppercase tracking-[0.15em] text-[#666] transition-colors hover:border-[#555] hover:text-[#e8e8e8]"
                      >
                        {copiedMessageId === message.id ? 'Copied' : 'Copy'}
                      </button>
                      {isLatestAssistant && (
                        <button
                          type="button"
                          onClick={retryLastResponse}
                          disabled={isSending}
                          className="min-h-9 border border-[#282828] bg-[#0a0a0a] px-3 py-2 font-mono-ui text-[10px] font-semibold uppercase tracking-[0.15em] text-[#666] transition-colors hover:border-[#555] hover:text-[#e8e8e8] disabled:opacity-30"
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  )}

                  {followUpSuggestions.length > 0 && (
                    <div className="mt-3 border border-[#222] bg-[#0a0a0a] p-2">
                      <p className="mb-2 font-mono-ui text-[10px] font-semibold uppercase tracking-[0.15em] text-[#555]">
                        Follow-up prompts
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {followUpSuggestions.map((suggestion) => (
                          <button
                            key={`${message.id}-${suggestion}`}
                            type="button"
                            onClick={() => sendSuggestedQuestion(suggestion)}
                            disabled={isSending}
                            className="min-h-9 max-w-full border border-[#282828] bg-[#111] px-3 py-2 text-left font-mono-ui text-[10px] font-semibold uppercase tracking-[0.08em] text-[#777] transition-colors hover:border-[#555] hover:text-[#e8e8e8] disabled:opacity-30"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {message.role === 'assistant' && citations.length > 0 && (
                    <details className="mt-3 max-w-full border border-[#282828] bg-[#0d0d0d] p-3">
                      <summary className="cursor-pointer font-mono-ui text-[10px] font-semibold uppercase tracking-[0.15em] text-[#666] hover:text-[#999] transition-colors">
                        Sources ({citations.length})
                      </summary>
                      <ul className="mt-3 space-y-1">
                        {citations.map((citation, index) => (
                          <li
                            key={`${message.id}-source-${index}`}
                            className="max-w-full overflow-hidden break-words border border-[#222] bg-[#0a0a0a] px-2 py-1 font-mono-ui text-[11px] text-[#666]"
                          >
                            <span className="text-[#888]">{index + 1}.</span>{' '}
                            <span className="text-[#999]">{citation.source}</span>{' '}
                            <span className="text-[#444]">|</span> chunk{' '}
                            <span className="text-[#888]">{citation.chunkIndex}</span>{' '}
                            <span className="text-[#444]">|</span>{' '}
                            <span className="text-[#777]">{formatRelevance(citation.relevance)}</span>
                            {citation.breadcrumb && (
                              <span className="block truncate text-[#444]">{citation.breadcrumb}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}

                  {message.role === 'assistant' && message.expandedQuestion && (
                    <details className="mt-3 max-w-full border border-[#282828] bg-[#0d0d0d] p-3">
                      <summary className="cursor-pointer font-mono-ui text-[10px] font-semibold uppercase tracking-[0.15em] text-[#666] hover:text-[#999] transition-colors">
                        ▸ Retrieval Details
                      </summary>
                      <div className="mt-3 space-y-3 text-xs text-[#888]">
                        <div>
                          <p className="font-mono-ui text-[10px] uppercase tracking-wider text-[#555] mb-1">
                            Expanded Query:
                          </p>
                          <pre className="max-h-44 max-w-full overflow-auto whitespace-pre-wrap break-words border border-[#222] bg-[#0a0a0a] p-2 font-mono-ui text-[11px] text-[#777]">
                            {message.expandedQuestion}
                          </pre>
                        </div>
                        <div>
                          <p className="font-mono-ui text-[10px] uppercase tracking-wider text-[#555] mb-1">
                            HyDE Passage:
                          </p>
                          <pre className="max-h-52 max-w-full overflow-auto whitespace-pre-wrap break-words border border-[#222] bg-[#0a0a0a] p-2 font-mono-ui text-[11px] text-[#777]">
                            {message.hydePassage}
                          </pre>
                        </div>
                        {message.context && (
                          <div>
                            <p className="font-mono-ui text-[10px] uppercase tracking-wider text-[#555] mb-1">
                              Context:
                            </p>
                            <p className="max-h-44 max-w-full overflow-auto break-words border border-[#222] bg-[#0a0a0a] p-2 font-mono-ui text-[11px] text-[#777]">
                              {message.context}
                            </p>
                          </div>
                        )}
                        {Array.isArray(message.chunks) && message.chunks.length > 0 && (
                          <div>
                            <p className="font-mono-ui text-[10px] uppercase tracking-wider text-[#555] mb-1">
                              Retrieved Chunks:
                            </p>
                            <ul className="space-y-1">
                              {message.chunks.slice(0, 5).map((chunk, index) => {
                                const breadcrumb =
                                  chunk?.metadata?.breadcrumb ?? chunk?.metadata?.source ?? 'unknown'
                                const score = Number.isFinite(chunk?.score) ? chunk.score.toFixed(3) : 'n/a'
                                return (
                                  <li
                                    key={`${message.id}-${index}`}
                                    className="max-w-full overflow-hidden break-words border border-[#222] bg-[#0a0a0a] px-2 py-1 font-mono-ui text-[11px] text-[#666]"
                                  >
                                    <span className="text-[#888]">{index + 1}.</span> {breadcrumb}{' '}
                                    <span className="text-[#444]">|</span> score{' '}
                                    <span className="text-[#999]">{score}</span>
                                  </li>
                                )
                              })}
                            </ul>
                          </div>
                        )}
                      </div>
                    </details>
                  )}
                </article>
              )
            })}

            {isSending && (
              <div className="mr-auto inline-flex items-center gap-3 border border-[#282828] bg-[#111] px-4 py-3 text-sm text-[#888]">
                <span className="flex gap-1.5">
                  <span className="retro-dot" style={{ width: 6, height: 6 }} />
                  <span className="retro-dot" style={{ width: 6, height: 6 }} />
                  <span className="retro-dot" style={{ width: 6, height: 6 }} />
                </span>
                <span className="font-mono-ui text-[11px] tracking-wider uppercase">
                  Processing query...
                </span>
              </div>
            )}
            <div ref={messageEndRef} />
          </section>

          {/* Input form */}
          <form onSubmit={sendQuestion} className="border border-[#333] bg-[#111] p-3 sm:p-4">
            <label
              htmlFor="prompt"
              className="mb-3 flex items-center gap-2 font-mono-ui text-[10px] font-semibold uppercase tracking-[0.2em] text-[#555]"
            >
              <span className="text-[#888]">{'>'}</span> Enter your query
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <textarea
                id="prompt"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={handlePromptKeyDown}
                rows={3}
                placeholder="Example: What is the policy for course withdrawal after midterm?"
                className="retro-input min-h-24 flex-1 resize-none px-3 py-3 text-sm sm:min-h-20 sm:py-2"
              />
              <button
                type="submit"
                disabled={isSending || question.trim() === ''}
                className="retro-btn min-h-11 px-6 py-3 text-[12px] sm:self-end"
              >
                SEND ▸
              </button>
            </div>
            {error && (
              <p className="mt-2 font-mono-ui text-[12px] text-[#888] flex items-center gap-2">
                <span className="text-[#666]">✕</span> {error}
              </p>
            )}
          </form>

          {/* Footer */}
          <footer className="font-mono-ui text-[9px] text-[#333] tracking-widest text-center select-none uppercase">
            ─── CampusIQ v1.0 • Knowledge Retrieval System ───
          </footer>
        </main>
      </div>
    </div>
  )
}

export default App
