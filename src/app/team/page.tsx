"use client"

import { useEffect, useState } from "react"
import { supabase, type TeamStats } from "@/lib/supabase"
import { ScoreRing } from "@/components/ScoreRing"
import Link from "next/link"

export default function TeamPage() {
    const [members, setMembers]   = useState<TeamStats[]>([])
    const [loading, setLoading]   = useState(true)
    const [sortKey, setSortKey]   = useState<keyof TeamStats>("avg_overall")
    const [sortDesc, setSortDesc] = useState(true)

    useEffect(() => { load() }, [])

    async function load() {
        try {
            const { data: ctx } = await supabase.rpc("get_org_context")
            if (!ctx?.org_id) { setLoading(false); return }

            const { data: memberRows } = await supabase
                .from("org_members")
                .select("user_id, role, team_id, org_teams(name)")
                .eq("org_id", ctx.org_id)
                .eq("status", "active")

            // Names/emails can't be read from user_profiles directly (RLS locks
            // them to the owner) — resolve them via the SECURITY DEFINER RPC.
            const { data: dir } = await supabase.rpc("get_org_members_with_email", { p_org: ctx.org_id })
            const identityById = new Map<string, { email?: string; full_name?: string }>()
            for (const d of (dir ?? []) as Array<{ user_id: string; email?: string; full_name?: string }>) {
                identityById.set(d.user_id, { email: d.email ?? undefined, full_name: d.full_name ?? undefined })
            }

            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
            const { data: cards } = await supabase
                .from("session_scorecards")
                .select("user_id, overall_score, adherence_score, objection_score, accuracy_score")
                .eq("org_id", ctx.org_id)
                .eq("status", "scored")
                .gte("started_at", thirtyDaysAgo)

            const byUser: Record<string, NonNullable<typeof cards>> = {}
            for (const card of cards ?? []) {
                if (!byUser[card.user_id]) byUser[card.user_id] = []
                byUser[card.user_id].push(card)
            }

            const avg = (arr: Array<Record<string, unknown>>, field: string) => {
                const vals = arr.map(r => r[field] as number | null).filter((v): v is number => v != null)
                return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null
            }

            const stats: TeamStats[] = (memberRows ?? []).map(m => {
                const userCards = byUser[m.user_id] ?? []
                const identity = identityById.get(m.user_id)
                return {
                    user_id: m.user_id,
                    user_name: identity?.full_name,
                    user_email: identity?.email,
                    team_name: (m.org_teams as { name?: string } | null)?.name,
                    session_count: userCards.length,
                    avg_overall:   avg(userCards, "overall_score"),
                    avg_adherence: avg(userCards, "adherence_score"),
                    avg_objection: avg(userCards, "objection_score"),
                    avg_accuracy:  avg(userCards, "accuracy_score"),
                }
            })

            setMembers(stats)
        } finally {
            setLoading(false)
        }
    }

    const sorted = [...members].sort((a, b) => {
        const av = a[sortKey] as number | null ?? -1
        const bv = b[sortKey] as number | null ?? -1
        return sortDesc ? bv - av : av - bv
    })

    const ColHeader = ({ field, label }: { field: keyof TeamStats; label: string }) => (
        <button
            onClick={() => { if (sortKey === field) setSortDesc(!sortDesc); else { setSortKey(field); setSortDesc(true) } }}
            className={`text-xs font-medium text-right transition-colors ${sortKey === field ? "text-[var(--color-accent)]" : "text-gray-400 hover:text-gray-700"}`}
        >
            {label} {sortKey === field ? (sortDesc ? "↓" : "↑") : ""}
        </button>
    )

    if (loading) return <div className="text-gray-400 text-sm">Loading…</div>

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold text-gray-900">Team</h1>
                <p className="text-sm text-gray-500 mt-1">30-day performance averages. Click a rep to see their full scorecard history.</p>
            </div>

            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden shadow-sm">
                <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] items-center gap-4 px-4 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                    <span className="text-xs font-medium text-gray-500">Rep</span>
                    <ColHeader field="session_count" label="Sessions"   />
                    <ColHeader field="avg_overall"   label="Overall"    />
                    <ColHeader field="avg_adherence" label="Adherence"  />
                    <ColHeader field="avg_objection" label="Objections" />
                    <ColHeader field="avg_accuracy"  label="Accuracy"   />
                    <span />
                </div>
                {sorted.length === 0 && (
                    <div className="px-4 py-8 text-sm text-gray-500 text-center">No active members with scored sessions.</div>
                )}
                {sorted.map(m => (
                    <Link
                        key={m.user_id}
                        href={`/team/${m.user_id}`}
                        className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] items-center gap-4 px-4 py-3 border-b border-[var(--color-border)] hover:bg-gray-50 transition-colors last:border-0"
                    >
                        <div className="flex flex-col min-w-0">
                            <span className="text-sm text-gray-900 font-medium truncate">
                                {m.user_name ?? m.user_email ?? m.user_id.slice(0, 8) + "…"}
                            </span>
                            {m.team_name && <span className="text-xs text-gray-400">{m.team_name}</span>}
                        </div>
                        <span className="text-sm text-gray-500 text-right tabular-nums">{m.session_count}</span>
                        <ScoreRing score={m.avg_overall}   size="sm" />
                        <ScoreRing score={m.avg_adherence} size="sm" />
                        <ScoreRing score={m.avg_objection} size="sm" />
                        <ScoreRing score={m.avg_accuracy}  size="sm" />
                        <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </Link>
                ))}
            </div>
        </div>
    )
}
