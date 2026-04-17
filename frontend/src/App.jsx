import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import FastLoadingScreen from './components/FastLoadingScreen'

const markdownComponents = {
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 list-disc pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal pl-5">{children}</ol>,
  li: ({ children }) => <li className="mb-1">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  code: ({ children }) => (
    <code className="rounded bg-[#F4F6F8] px-1 py-0.5 font-mono-ui text-[12px] text-[#005DAA]">{children}</code>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-lg border border-[#DCE3E8] bg-white">
      <table className="min-w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-[#F4F6F8]">{children}</thead>,
  th: ({ children }) => <th className="border border-[#DCE3E8] px-2 py-1 text-left font-semibold text-[#005DAA]">{children}</th>,
  td: ({ children }) => <td className="border border-[#DCE3E8] px-2 py-1 align-top">{children}</td>,
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

function App() {
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Welcome to CampusIQ. Ask me anything about university policies, rules, or handbook details, and I will answer using the retrieval API.',
    },
  ])
  const [question, setQuestion] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isBooting, setIsBooting] = useState(true)
  const [error, setError] = useState('')
  const messageEndRef = useRef(null)

  useEffect(() => {
    const startupTimer = window.setTimeout(() => {
      setIsBooting(false)
    }, 2300)

    return () => window.clearTimeout(startupTimer)
  }, [])

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isSending])

  const handlePromptKeyDown = (event) => {
    const isEnter = event.key === 'Enter'
    const isShiftEnter = event.shiftKey
    const isComposing = event.nativeEvent.isComposing
    if (isEnter && !isShiftEnter && !isComposing) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  const sendQuestion = async (event) => {
    event.preventDefault()
    const trimmedQuestion = question.trim()
    if (!trimmedQuestion || isSending) {
      return
    }

    const conversationHistory = messages
      .filter((message) => (message.role === 'user' || message.role === 'assistant') && message.id !== 'welcome')
      .map((message) => ({ role: message.role, content: message.content }))

    const userMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmedQuestion,
    }

    setMessages((previous) => [...previous, userMessage])
    setQuestion('')
    setError('')
    setIsSending(true)

    try {
      const response = await fetch(`${API_BASE_URL}/rag/retrieve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: trimmedQuestion,
          history: conversationHistory,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        const detail = typeof data?.detail === 'string' ? data.detail : 'Request failed.'
        throw new Error(detail)
      }

      const assistantMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: data.finalAnswer ?? 'No answer returned.',
        expandedQuestion: data.expandedQuestion,
        hydePassage: data.hydePassage,
        context: data.context,
        chunks: Array.isArray(data.chunks) ? data.chunks : [],
      }
      setMessages((previous) => [...previous, assistantMessage])
    } catch (requestError) {
      const failureMessage = getSafeErrorMessage(requestError)
      setError(failureMessage)
      setMessages((previous) => [
        ...previous,
        {
          id: `e-${Date.now()}`,
          role: 'error',
          content: failureMessage,
        },
      ])
    } finally {
      setIsSending(false)
    }
  }

  if (isBooting) {
    return <FastLoadingScreen />
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#F4F6F8] text-slate-900">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(135deg, rgba(0,93,170,0.16) 0%, rgba(244,246,248,0.92) 42%, rgba(247,194,0,0.22) 100%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, #005DAA 1px, transparent 0)',
          backgroundSize: '28px 28px',
        }}
      />
      <div className="pointer-events-none absolute -left-24 top-8 h-72 w-72 rounded-full bg-[#005DAA]/14 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-0 h-80 w-80 rounded-full bg-[#F7C200]/18 blur-3xl" />
      <div className="pointer-events-none absolute bottom-12 right-10 h-56 w-56 rounded-full bg-[#2E8B3A]/14 blur-3xl" />

      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-3 pb-4 pt-3 sm:px-6 sm:pb-6 sm:pt-4">
        <main className="relative flex min-h-screen flex-1 flex-col">
          <div className="mb-4 flex items-center justify-between rounded-2xl border border-[#DCE3E8] bg-white p-3 shadow-sm">
            <div>
              <h2 className="font-display text-lg font-semibold text-[#005DAA]">Chat</h2>
              <p className="text-xs text-slate-500">Ask questions and get retrieval-grounded answers.</p>
            </div>
            <span className="rounded-full border border-[#2E8B3A]/30 bg-[#2E8B3A]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#2E8B3A]">
              Live
            </span>
          </div>

          <section className="flex-1 space-y-3 overflow-y-auto rounded-2xl border border-[#DCE3E8] bg-[#F4F6F8] p-3 shadow-inner sm:p-5">
            {messages.map((message) => (
              <article
                key={message.id}
                className={`max-w-3xl rounded-2xl border px-4 py-3 text-sm shadow-sm ${
                  message.role === 'user'
                    ? 'ml-auto border-[#005DAA] bg-[#005DAA] text-white'
                    : message.role === 'error'
                      ? 'mr-auto border-[#F7C200] bg-[#FFF9E6] text-slate-900'
                      : 'mr-auto border-[#DCE3E8] bg-white text-slate-800'
                }`}
              >
                <header className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#005DAA]">
                  {message.role === 'user' ? 'You' : message.role === 'error' ? 'Error' : 'CampusIQ'}
                </header>
                {message.role === 'assistant' ? (
                  <div className="text-sm text-slate-800">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                      {message.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                )}

                {message.role === 'assistant' && message.expandedQuestion && (
                  <details className="mt-3 rounded-lg border border-[#F7C200] bg-[#FFF9E6] p-2">
                    <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-[#005DAA]">
                      Retrieval details
                    </summary>
                    <div className="mt-2 space-y-2 text-xs text-slate-700">
                      <div>
                        <p>
                          <strong>Expanded query:</strong>
                        </p>
                        <pre className="mt-1 max-h-44 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-[#DCE3E8] bg-white p-2 font-mono-ui text-[11px]">
                          {message.expandedQuestion}
                        </pre>
                      </div>
                      <div>
                        <p>
                          <strong>HyDE passage:</strong>
                        </p>
                        <pre className="mt-1 max-h-52 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-[#DCE3E8] bg-white p-2 font-mono-ui text-[11px]">
                          {message.hydePassage}
                        </pre>
                      </div>
                      {message.context && (
                        <p className="max-h-44 overflow-y-auto rounded-md border border-[#DCE3E8] bg-white p-2 font-mono-ui text-[11px]">
                          {message.context}
                        </p>
                      )}
                      {Array.isArray(message.chunks) && message.chunks.length > 0 && (
                        <ul className="space-y-1">
                          {message.chunks.slice(0, 5).map((chunk, index) => {
                            const breadcrumb = chunk?.metadata?.breadcrumb ?? chunk?.metadata?.source ?? 'unknown'
                            const score = Number.isFinite(chunk?.score) ? chunk.score.toFixed(3) : 'n/a'
                            return (
                              <li key={`${message.id}-${index}`} className="rounded-md border border-[#DCE3E8] bg-white px-2 py-1">
                                {index + 1}. {breadcrumb} | score {score}
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>
                  </details>
                )}
              </article>
            ))}

            {isSending && (
              <div className="mr-auto inline-flex items-center gap-2 rounded-xl border border-[#2E8B3A]/40 bg-white px-4 py-2 text-sm text-[#2E8B3A]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#2E8B3A]" />
                CampusIQ is thinking...
              </div>
            )}
            <div ref={messageEndRef} />
          </section>

          <form onSubmit={sendQuestion} className="mt-4 rounded-2xl border border-[#DCE3E8] bg-white p-3 shadow-lg sm:p-4">
            <label htmlFor="prompt" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[#005DAA]">
              Your question
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <textarea
                id="prompt"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={handlePromptKeyDown}
                rows={3}
                placeholder="Example: What is the policy for course withdrawal after midterm?"
                className="min-h-20 flex-1 resize-none rounded-xl border border-[#DCE3E8] bg-white px-3 py-2 text-sm outline-none ring-[#F7C200] transition focus:ring"
              />
              <button
                type="submit"
                disabled={isSending || question.trim() === ''}
                className="rounded-xl bg-[#005DAA] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#004C8A] disabled:cursor-not-allowed disabled:opacity-50 sm:self-end"
              >
                Send
              </button>
            </div>
            {error && <p className="mt-2 text-sm text-[#8B2E2E]">{error}</p>}
          </form>
        </main>
      </div>
    </div>
  )
}

export default App
