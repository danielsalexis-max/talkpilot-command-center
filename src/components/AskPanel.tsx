"use client"

import { useState } from "react"
import type { ChatTurn } from "@/lib/supabase"

/** Shared "ask AI" chat panel. `onAsk` receives the question + prior turns and
 *  returns the assistant's answer. Context/grounding lives in the caller. */
export function AskPanel({
    heading, placeholder, suggestions, onAsk,
}: {
    heading: string
    placeholder: string
    suggestions: string[]
    onAsk: (question: string, history: ChatTurn[]) => Promise<string>
}) {
    const [thread, setThread] = useState<ChatTurn[]>([])
    const [input, setInput]   = useState("")
    const [busy, setBusy]     = useState(false)
    const [error, setError]   = useState<string | null>(null)

    async function ask(q: string) {
        const question = q.trim()
        if (!question || busy) return
        setError(null)
        setInput("")
        const history = thread
        setThread([...history, { role: "user", content: question }])
        setBusy(true)
        try {
            const answer = await onAsk(question, history)
            setThread(t => [...t, { role: "assistant", content: answer }])
        } catch (e) {
            setError((e as Error).message || "Something went wrong.")
            setThread(t => t.slice(0, -1))
            setInput(question)
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">{heading}</span>
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--color-accent-subtle)] text-[var(--color-accent)]">AI</span>
            </div>

            {thread.length === 0 && (
                <div className="flex flex-wrap gap-2">
                    {suggestions.map(s => (
                        <button key={s} onClick={() => ask(s)} disabled={busy}
                            className="text-xs px-2.5 py-1 rounded-full border border-[var(--color-border)] text-gray-600 hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-40 transition-colors">
                            {s}
                        </button>
                    ))}
                </div>
            )}

            {thread.length > 0 && (
                <div className="space-y-2.5 max-h-96 overflow-y-auto">
                    {thread.map((t, i) => (
                        <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap ${
                                t.role === "user"
                                    ? "bg-[var(--color-accent)] text-white"
                                    : "bg-[var(--color-bg)] border border-[var(--color-border)] text-gray-800"
                            }`}>
                                {t.content}
                            </div>
                        </div>
                    ))}
                    {busy && <div className="text-xs text-gray-400 px-1">Thinking…</div>}
                </div>
            )}

            {error && <p className="text-xs text-red-600">{error}</p>}

            <form onSubmit={e => { e.preventDefault(); ask(input) }} className="flex gap-2">
                <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder={placeholder}
                    className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[var(--color-accent)]"
                />
                <button type="submit" disabled={busy || !input.trim()}
                    className="px-4 py-2 bg-[var(--color-accent)] hover:bg-[var(--color-accent-light)] disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors">
                    {busy ? "…" : "Ask"}
                </button>
            </form>
        </div>
    )
}
