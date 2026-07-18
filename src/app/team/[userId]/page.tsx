"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { supabase, type Scorecard } from "@/lib/supabase"
import { ScoreBadge } from "@/components/ScoreRing"
import Link from "next/link"

export default function RepPage() {
    const { userId } = useParams<{ userId: string }>()
    const [cards, setCards]   = useState<Scorecard[]>([])
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

    if (loading) return <div className="text-slate-400 text-sm">Loading…</div>

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <Link href="/team" className="text-slate-500 hover:text-white text-sm transition-colors">← Team</Link>
                <h1 className="text-2xl font-semibold text-white">Rep History</h1>
            </div>

            {cards.length === 0 && (
                <p className="text-sm text-slate-500">No scored sessions found for this rep.</p>
            )}

            <div className="space-y-2">
                {cards.map(card => (
                    <Link
                        key={card.id}
                        href={`/scorecard/${card.id}`}
                        className="flex items-center justify-between bg-[var(--color-surface)] hover:bg-white/5 transition-colors rounded-lg border border-[var(--color-border)] px-4 py-3"
                    >
                        <div className="flex flex-col">
                            <span className="text-sm text-white">
                                {card.started_at
                                    ? new Date(card.started_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
                                    : "Unknown time"
                                }
                            </span>
                            <span className="text-xs text-slate-500">
                                {card.duration_minutes ? `${card.duration_minutes} min` : "—"}
                                {card.talk_ratio != null ? ` · ${Math.round(card.talk_ratio * 100)}% talk ratio` : ""}
                                {card.guardrail_breaches?.length ? ` · ⚠ ${card.guardrail_breaches.length} guardrail breach${card.guardrail_breaches.length > 1 ? "es" : ""}` : ""}
                            </span>
                        </div>
                        <div className="flex items-center gap-4">
                            <ScoreBadge label="Overall"   score={card.overall_score}   />
                            <ScoreBadge label="Adherence" score={card.adherence_score} />
                            <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    )
}
