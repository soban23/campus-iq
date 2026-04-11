import { useEffect, useRef, useState } from 'react'

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
  const [error, setError] = useState('')
  const messageEndRef = useRef(null)

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isSending])

  const sendQuestion = async (event) => {
    event.preventDefault()
    const trimmedQuestion = question.trim()
    if (!trimmedQuestion || isSending) {
      return
    }

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
      const failureMessage = requestError instanceof Error ? requestError.message : 'Failed to reach API.'
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

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_#fef3c7_0%,_#fffbeb_35%,_#ecfeff_100%)] text-slate-900">
      <div className="pointer-events-none absolute -left-20 top-16 h-72 w-72 rounded-full bg-cyan-200/40 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-0 h-80 w-80 rounded-full bg-amber-200/40 blur-3xl" />

      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-3 pb-4 pt-3 sm:px-6 sm:pb-6 sm:pt-4">
        <main className="relative flex min-h-screen flex-1 flex-col">
          <div className="mb-4 flex items-center justify-between rounded-2xl border border-white/70 bg-white/80 p-3 shadow-sm backdrop-blur">
            <div>
              <h2 className="font-display text-lg font-semibold">Chat</h2>
              <p className="text-xs text-slate-500">Ask questions and get retrieval-grounded answers.</p>
            </div>
            {/* <p className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-900">API: {API_BASE_URL}</p> */}
          </div>

          <section className="flex-1 space-y-3 overflow-y-auto rounded-2xl border border-white/70 bg-white/60 p-3 shadow-inner backdrop-blur sm:p-5">
            {messages.map((message) => (
              <article
                key={message.id}
                className={`max-w-3xl rounded-2xl border px-4 py-3 text-sm shadow-sm ${
                  message.role === 'user'
                    ? 'ml-auto border-cyan-200 bg-cyan-100/90 text-slate-900'
                    : message.role === 'error'
                      ? 'mr-auto border-rose-200 bg-rose-50 text-rose-900'
                      : 'mr-auto border-slate-200 bg-white text-slate-800'
                }`}
              >
                <header className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {message.role === 'user' ? 'You' : message.role === 'error' ? 'Error' : 'CampusIQ'}
                </header>
                <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>

                {message.role === 'assistant' && message.expandedQuestion && (
                  <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Retrieval details
                    </summary>
                    <div className="mt-2 space-y-2 text-xs text-slate-700">
                      <p>
                        <strong>Expanded query:</strong> {message.expandedQuestion}
                      </p>
                      <p>
                        <strong>HyDE passage:</strong> {message.hydePassage}
                      </p>
                      {message.context && (
                        <p className="max-h-44 overflow-y-auto rounded-md bg-white p-2 font-mono-ui text-[11px]">
                          {message.context}
                        </p>
                      )}
                      {Array.isArray(message.chunks) && message.chunks.length > 0 && (
                        <ul className="space-y-1">
                          {message.chunks.slice(0, 5).map((chunk, index) => {
                            const breadcrumb = chunk?.metadata?.breadcrumb ?? chunk?.metadata?.source ?? 'unknown'
                            const score = Number.isFinite(chunk?.score) ? chunk.score.toFixed(3) : 'n/a'
                            return (
                              <li key={`${message.id}-${index}`} className="rounded-md bg-white px-2 py-1">
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
              <div className="mr-auto inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm">
                <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-500" />
                CampusIQ is thinking...
              </div>
            )}
            <div ref={messageEndRef} />
          </section>

          <form onSubmit={sendQuestion} className="mt-4 rounded-2xl border border-white/80 bg-white/90 p-3 shadow-lg backdrop-blur sm:p-4">
            <label htmlFor="prompt" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Your question
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <textarea
                id="prompt"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                rows={3}
                placeholder="Example: What is the policy for course withdrawal after midterm?"
                className="min-h-20 flex-1 resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-cyan-300 transition focus:ring"
              />
              <button
                type="submit"
                disabled={isSending || question.trim() === ''}
                className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 sm:self-end"
              >
                Send
              </button>
            </div>
            {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
          </form>
        </main>
      </div>
    </div>
  )
}

export default App
