import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import FastLoadingScreen from './components/FastLoadingScreen'

const markdownComponents = {
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 list-disc pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal pl-5">{children}</ol>,
  li: ({ children }) => <li className="mb-1">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  code: ({ children }) => (
    <code className="rounded-none border border-[#333] bg-[#111] px-1.5 py-0.5 font-mono-ui text-[12px] text-[#ccc]">
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
        'Welcome to **CampusIQ**. Ask me anything about FAST university policies, rules, or handbook details — I will answer.',
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
    <div className="crt-scanlines noise-bg crt-flicker relative min-h-screen overflow-hidden bg-[#0a0a0a] text-[#e8e8e8]">
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

      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 pb-4 pt-4 sm:px-8 sm:pb-6 sm:pt-6">
        <main className="relative flex min-h-screen flex-1 flex-col gap-4">
          {/* Header */}
          <header className="flex items-center justify-between border border-[#333] bg-[#111] p-4">
            <div className="flex items-center gap-4">
              {/* Terminal icon */}
              <div className="font-mono-ui text-[18px] text-[#555] leading-none select-none">
                {'>'}_
              </div>
              <div>
                <h1 className="font-display text-lg font-bold tracking-[0.12em] text-[#e8e8e8] uppercase retro-glow">
                  CampusIQ
                </h1>
                <p className="font-mono-ui text-[10px] tracking-[0.2em] text-[#555] uppercase mt-0.5">
                  Retrieval-Augmented Chat Terminal
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono-ui text-[10px] tracking-wider text-[#555] uppercase hidden sm:inline">
                SYS:OK
              </span>
              <span className="flex items-center gap-1.5 border border-[#333] bg-[#0a0a0a] px-3 py-1">
                <span className="h-1.5 w-1.5 bg-[#e8e8e8] thinking-dot" />
                <span className="font-mono-ui text-[10px] font-semibold uppercase tracking-[0.15em] text-[#888]">
                  Live
                </span>
              </span>
            </div>
          </header>

          {/* Messages area */}
          <section className="flex-1 space-y-3 overflow-y-auto border border-[#333] bg-[#0d0d0d] p-4 sm:p-5">
            {/* Decorative header inside message area */}
            <div className="font-mono-ui text-[9px] text-[#333] tracking-widest uppercase select-none border-b border-[#1a1a1a] pb-2 mb-3">
              ══════ conversation log ══════
            </div>

            {messages.map((message) => (
              <article
                key={message.id}
                className={`max-w-3xl px-4 py-3 text-sm transition-all duration-200 ${
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
                  <div className="text-sm text-[#ccc] leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                      {message.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                )}

                {message.role === 'assistant' && message.expandedQuestion && (
                  <details className="mt-3 border border-[#282828] bg-[#0d0d0d] p-3">
                    <summary className="cursor-pointer font-mono-ui text-[10px] font-semibold uppercase tracking-[0.15em] text-[#666] hover:text-[#999] transition-colors">
                      ▸ Retrieval Details
                    </summary>
                    <div className="mt-3 space-y-3 text-xs text-[#888]">
                      <div>
                        <p className="font-mono-ui text-[10px] uppercase tracking-wider text-[#555] mb-1">
                          Expanded Query:
                        </p>
                        <pre className="max-h-44 overflow-y-auto whitespace-pre-wrap break-words border border-[#222] bg-[#0a0a0a] p-2 font-mono-ui text-[11px] text-[#777]">
                          {message.expandedQuestion}
                        </pre>
                      </div>
                      <div>
                        <p className="font-mono-ui text-[10px] uppercase tracking-wider text-[#555] mb-1">
                          HyDE Passage:
                        </p>
                        <pre className="max-h-52 overflow-y-auto whitespace-pre-wrap break-words border border-[#222] bg-[#0a0a0a] p-2 font-mono-ui text-[11px] text-[#777]">
                          {message.hydePassage}
                        </pre>
                      </div>
                      {message.context && (
                        <div>
                          <p className="font-mono-ui text-[10px] uppercase tracking-wider text-[#555] mb-1">
                            Context:
                          </p>
                          <p className="max-h-44 overflow-y-auto border border-[#222] bg-[#0a0a0a] p-2 font-mono-ui text-[11px] text-[#777]">
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
                                  className="border border-[#222] bg-[#0a0a0a] px-2 py-1 font-mono-ui text-[11px] text-[#666]"
                                >
                                  <span className="text-[#888]">{index + 1}.</span> {breadcrumb}{' '}
                                  <span className="text-[#444]">│</span> score{' '}
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
            ))}

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
          <form onSubmit={sendQuestion} className="border border-[#333] bg-[#111] p-4">
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
                className="retro-input min-h-20 flex-1 resize-none px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={isSending || question.trim() === ''}
                className="retro-btn px-6 py-3 text-[12px] sm:self-end"
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
