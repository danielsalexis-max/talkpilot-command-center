"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { supabase, askClaude, type Scorecard } from "@/lib/supabase"
import { ScoreBadge } from "@/components/ScoreRing"
import { SearchBox } from "@/components/SearchBox"
import { AskPanel } from "@/components/AskPanel"
import Link from "next/link"

function buildRepContext(cards: Scorecard[]): string {
    const lines = cards.map(c => {
        const date = c.started_at ? new Date(c.started_at).toLocaleDateString() : "?"
        const scores = `overall ${c.overall_score ?? "–"}, adherence ${c.adherence_score ?? "–"}, objections ${c.objection_score ?? "–"}, accuracy ${c.accuracy_score ?? "–"}`
        const growth = (c.growth_areas ?? []).join("; ")
        const breaches = (c.guardrail_breaches ?? []).map(b => b.rule).join("; ")
        return `- ${date} · ${c.session_title ?? "Session"} — ${scores}` +
            (growth ? ` · growth areas: ${growth}` : "") +
            (breaches ? ` · guardrail breaches: ${breaches}` : "")
    }).join("\n")
    return "You are a sales coach analyzing ONE rep's recent scored calls. Identify recurring patterns — " +
        "what they consistently do well and where they keep slipping. Ground every claim in the data below and " +
        "cite specific dates/call titles. Be concise, direct, and actionable. If the data doesn't support an " +
        "answer, say so.\n\nSCORES ARE 0–100. REP'S RECENT SCORED CALLS (newest first):\n" + lines
}

const REP_SUGGESTIONS = [
    "What does this rep keep getting wrong?",
    "What are they consistently good at?",
    "What one thing should they focus on next week?",
    "Any recurring guardrail risks?",
]

export default function RepPage() {
    const { userId } = useParams<{ userId: string }>()
    const [cards, setCards]   = useState<Scorecard[]>([])
    const [query, setQuery]   = useState("")
    const [loading, setLoading] = useState(true)

    useEffect(() => { if (userId) load() }, [userId])

    async function load() {
        try {
            const { data: ctx } = await supabase.rpc("get_org_context")
            if (!ctx?.org_id) { setLoading(false); return }

            const { data } = await supabase
                .from("session_scorecards")
                .select("*")
                .eq("org_id", ctx.org_id)
                .eq("user_id", userId)
                .eq("status", "scored")
                .order("started_at", { ascending: false })
                .limit(30)

            setCards((data ?? []) as Scorecard[])
        } finally {
            setLoading(false)
        }
    }

    if (loading) return <div className="text-gray-500 text-sm">Loading…</div>

    const s = query.trim().toLowerCase()
    const shown = s
        ? cards.filter(c => (c.session_title ?? "").toLowerCase().includes(s))
        : cards

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <Link href="/team" className="text-gray-500 hover:text-gray-900 text-sm transition-colors">← Team</Link>
                    <h1 className="text-2xl font-semibold text-gray-900">Rep History</h1>
                </div>
                {cards.length > 5 && <SearchBox value={query} onChange={setQuery} placeholder="Search sessions…" className="w-56" />}
            </div>

            {cards.length > 0 && (
                <AskPanel
                    heading="Ask about this rep"
                    placeholder="Ask about this rep's patterns across their calls…"
                    suggestions={REP_SUGGESTIONS}
                    onAsk={(q, h) => askClaude(buildRepContext(cards), q, h)}
                />
            )}

            {shown.length === 0 && (
                <p className="text-sm text-gray-500">{s ? `No sessions match “${query}”.` : "No scored sessions found for this rep."}</p>
            )}

            <div className="space-y-2">
                {shown.map(card => (
                    <Link
                        key={card.id}
                        href={`/scorecard/${card.id}`}
                        className="flex items-center justify-between bg-[var(--color-surface)] hover:bg-gray-50 transition-colors rounded-lg border border-[var(--color-border)] px-4 py-3"
                    >
                        <div className="flex flex-col min-w-0">
                            <span className="text-sm font-medium text-gray-900 truncate">
                                {card.session_title
                                    ?? (card.started_at
                                        ? new Date(card.started_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
                                        : "Session")}
                            </span>
                            <span className="text-xs text-gray-500">
                                {card.started_at ? new Date(card.started_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Unknown time"}
                                {card.duration_minutes ? ` · ${card.duration_minutes} min` : ""}
                                {card.talk_ratio != null ? ` · ${Math.round(card.talk_ratio * 100)}% talk ratio` : ""}
                                {card.guardrail_breaches?.length ? ` · ⚠ ${card.guardrail_breaches.length} guardrail breach${card.guardrail_breaches.length > 1 ? "es" : ""}` : ""}
                            </span>
                        </div>
                        <div className="flex items-center gap-4">
                            <ScoreBadge label="Overall"   score={card.overall_score}   />
                            <ScoreBadge label="Adherence" score={card.adherence_score} />
                            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    )
}
