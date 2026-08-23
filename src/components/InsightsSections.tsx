"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { VerdictPill, GradePill } from "@/components/ScoreRing"
import { useLocale } from "@/i18n/LocaleProvider"

interface ObjectionPattern {
    objection_text: string
    grade: "excellent" | "adequate" | "off_script" | "missed"
    count: number
}

interface ClaimSummary {
    verdict: "verified" | "unverifiable" | "contradicts"
    count: number
}

interface DigestRow {
    id: string; period_start: string; period_end: string
    summary: string; stats: Record<string, unknown>; created_at: string
}

/// Formerly the standalone Insights page (D-162); folded into Home (D-175) —
/// accuracy slippage and objection patterns are exactly what the attention
/// surface is for, and a separate nav item made owners hunt for them.
export function InsightsSections() {
    const { t, intl } = useLocale()
    const [objectionPatterns, setObjectionPatterns] = useState<ObjectionPattern[]>([])
    const [claimSummary, setClaimSummary]           = useState<ClaimSummary[]>([])
    const [digests, setDigests]                     = useState<DigestRow[]>([])
    const [loading, setLoading]                     = useState(true)
    const [generating, setGenerating]               = useState(false)

    useEffect(() => { load() }, [])

    async function load() {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) { window.location.replace("/login"); return }
            const { data: ctx } = await supabase.rpc("get_org_context")
            if (!ctx?.org_id) { setLoading(false); return }
            const orgId = ctx.org_id

            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

            const { data: cards } = await supabase
                .from("session_scorecards")
                .select("id")
                .eq("org_id", orgId)
                .eq("status", "scored")
                .gte("started_at", thirtyDaysAgo)
            const cardIds = (cards ?? []).map(c => c.id)

            if (cardIds.length) {
                const [objRes, claimRes] = await Promise.all([
                    supabase.from("scorecard_objections")
                        .select("objection_text, grade")
                        .eq("org_id", orgId)
                        .in("scorecard_id", cardIds),
                    supabase.from("scorecard_claims")
                        .select("verdict")
                        .eq("org_id", orgId)
                        .in("scorecard_id", cardIds),
                ])

                const objMap: Record<string, ObjectionPattern> = {}
                for (const o of objRes.data ?? []) {
                    const key = `${o.objection_text.slice(0, 60)}__${o.grade}`
                    if (!objMap[key]) objMap[key] = { objection_text: o.objection_text, grade: o.grade, count: 0 }
                    objMap[key].count++
                }
                setObjectionPatterns(Object.values(objMap).sort((a, b) => b.count - a.count).slice(0, 20))

                const verdictMap: Record<string, number> = {}
                for (const c of claimRes.data ?? []) {
                    verdictMap[c.verdict] = (verdictMap[c.verdict] ?? 0) + 1
                }
                setClaimSummary(
                    Object.entries(verdictMap)
                        .map(([verdict, count]) => ({ verdict: verdict as ClaimSummary["verdict"], count }))
                        .sort((a, b) => b.count - a.count)
                )
            }

            const { data: digestRows } = await supabase
                .from("org_digests")
                .select("id, period_start, period_end, summary, stats, created_at")
                .eq("org_id", orgId)
                .order("period_end", { ascending: false })
                .limit(8)
            setDigests((digestRows ?? []) as DigestRow[])
        } finally {
            setLoading(false)
        }
    }

    async function generateDigest() {
        setGenerating(true)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/org-digest`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
                body: JSON.stringify({}),
            })
            await load()
        } finally {
            setGenerating(false)
        }
    }

    const totalClaims = claimSummary.reduce((a, b) => a + b.count, 0)

    if (loading) return null
    return (
        <div className="space-y-6">

            {/* Claim accuracy */}
            {totalClaims > 0 && (
                <div>
                    <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">{t.insights.accuracyTitle(totalClaims)}</h2>
                    <div className="flex flex-wrap gap-3">
                        {claimSummary.map(c => (
                            <div key={c.verdict} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 flex flex-col items-center gap-2 min-w-[100px] flex-1 sm:flex-none sm:min-w-[120px] shadow-sm">
                                <span className="text-2xl font-semibold text-[var(--color-text)]">
                                    {Math.round((c.count / totalClaims) * 100)}%
                                </span>
                                <VerdictPill verdict={c.verdict} />
                                <span className="text-xs text-[var(--color-muted)]">{t.insights.nClaims(c.count)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Objection patterns */}
            {objectionPatterns.length > 0 && (
                <div>
                    <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">{t.insights.objectionPatterns}</h2>
                    <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border)] shadow-sm">
                        {objectionPatterns.map((o, i) => (
                            <div key={i} className="flex items-center justify-between px-4 py-3 gap-4">
                                <p className="text-sm text-[var(--color-text-secondary)] flex-1 min-w-0 truncate">
                                    &ldquo;{o.objection_text.slice(0, 80)}&rdquo;
                                </p>
                                <div className="flex items-center gap-3 flex-shrink-0">
                                    <GradePill grade={o.grade} />
                                    <span className="text-xs text-[var(--color-muted)] tabular-nums w-8 text-right">×{o.count}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Digests */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-[var(--color-text)]">{t.insights.weeklyDigests}</h2>
                    <button
                        onClick={generateDigest}
                        disabled={generating}
                        className="text-xs px-3 py-1.5 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] disabled:opacity-40 text-[var(--btn-ink)] rounded-lg transition-colors font-medium"
                    >
                        {generating ? t.insights.generating : t.insights.generateNow}
                    </button>
                </div>

                {digests.length === 0 && (
                    <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] px-6 py-8 text-center shadow-sm">
                        <p className="text-sm text-[var(--color-text-secondary)]">{t.insights.noDigests}</p>
                        <p className="text-xs text-[var(--color-muted)] mt-1">{t.insights.noDigestsSub}</p>
                    </div>
                )}

                <div className="space-y-3">
                    {digests.map(d => (
                        <div key={d.id} className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-sm font-semibold text-[var(--color-text)]">
                                    {new Date(d.period_start + "T00:00:00").toLocaleDateString(intl, { month: "short", day: "numeric" })}
                                    {" – "}
                                    {new Date(d.period_end + "T00:00:00").toLocaleDateString(intl, { month: "short", day: "numeric", year: "numeric" })}
                                </span>
                                <span className="text-xs text-[var(--color-muted)]">
                                    {t.insights.nSessions((d.stats as Record<string, number>)?.session_count ?? 0)}
                                </span>
                            </div>
                            <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-wrap">{d.summary}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
