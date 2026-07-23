"use client"

import { useEffect, useState } from "react"
import { supabase, askClaude, type TeamStats } from "@/lib/supabase"
import { ScoreRing } from "@/components/ScoreRing"
import { SearchBox } from "@/components/SearchBox"
import { AskPanel } from "@/components/AskPanel"
import Link from "next/link"

function buildTeamContext(members: TeamStats[], topGrowth: [string, number][]): string {
    const rows = members.map(m =>
        `- ${m.user_name ?? m.user_email ?? m.user_id.slice(0, 8)} (${m.team_name ?? "no team"}): ` +
        `${m.session_count} calls; avg overall ${m.avg_overall ?? "–"}, adherence ${m.avg_adherence ?? "–"}, ` +
        `objections ${m.avg_objection ?? "–"}, accuracy ${m.avg_accuracy ?? "–"}`
    ).join("\n")
    const growth = topGrowth.map(([g, n]) => `${g} (${n})`).join("; ")
    return "You are a sales coach analyzing a team's last 30 days of scored calls. Identify who needs attention, " +
        "the team's biggest weaknesses, and where a manager should focus. Ground every claim in the data below and " +
        "name specific reps/teams. Be concise and actionable.\n\nSCORES ARE 0–100. PER-REP 30-DAY AVERAGES:\n" + rows +
        (growth ? "\n\nMOST COMMON GROWTH AREAS FLAGGED ACROSS THE TEAM (with counts):\n" + growth : "")
}

const TEAM_SUGGESTIONS = [
    "Who needs coaching attention most?",
    "What's the team's biggest weakness?",
    "Which team is strongest, and why?",
    "Where should I focus this week?",
]

export default function TeamPage() {
    const [members, setMembers]   = useState<TeamStats[]>([])
    const [loading, setLoading]   = useState(true)
    const [sortKey, setSortKey]   = useState<keyof TeamStats>("avg_overall")
    const [sortDesc, setSortDesc] = useState(true)
    const [query, setQuery]       = useState("")
    const [topGrowth, setTopGrowth] = useState<[string, number][]>([])

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
                .select("user_id, overall_score, adherence_score, objection_score, accuracy_score, growth_areas")
                .eq("org_id", ctx.org_id)
                .eq("status", "scored")
                .gte("started_at", thirtyDaysAgo)

            // Aggregate the most frequently flagged growth areas across the team.
            const growthTally: Record<string, number> = {}
            for (const c of cards ?? []) {
                for (const g of ((c as { growth_areas?: string[] }).growth_areas ?? [])) {
                    growthTally[g] = (growthTally[g] ?? 0) + 1
                }
            }
            setTopGrowth(Object.entries(growthTally).sort((a, b) => b[1] - a[1]).slice(0, 10))

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

    const q = query.trim().toLowerCase()
    const filtered = q
        ? members.filter(m =>
            (m.user_name ?? "").toLowerCase().includes(q) ||
            (m.user_email ?? "").toLowerCase().includes(q) ||
            (m.team_name ?? "").toLowerCase().includes(q) ||
            m.user_id.toLowerCase().includes(q))
        : members
    const sorted = [...filtered].sort((a, b) => {
        const av = a[sortKey] as number | null ?? -1
        const bv = b[sortKey] as number | null ?? -1
        return sortDesc ? bv - av : av - bv
    })

    const ColHeader = ({ field, label }: { field: keyof TeamStats; label: string }) => (
        <button
            onClick={() => { if (sortKey === field) setSortDesc(!sortDesc); else { setSortKey(field); setSortDesc(true) } }}
            className={`text-xs font-medium text-center whitespace-nowrap justify-self-center transition-colors ${sortKey === field ? "text-[var(--color-accent)]" : "text-gray-400 hover:text-gray-700"}`}
        >
            {label}{sortKey === field ? (sortDesc ? " ↓" : " ↑") : ""}
        </button>
    )

    if (loading) return <div className="text-gray-400 text-sm">Loading…</div>

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900">Team</h1>
                    <p className="text-sm text-gray-500 mt-1">30-day performance averages. Click a rep to see their full scorecard history.</p>
                </div>
                <SearchBox value={query} onChange={setQuery} placeholder="Search reps…" />
            </div>

            {members.length > 0 && (
                <AskPanel
                    heading="Ask about the team"
                    placeholder="Ask about team patterns, who needs coaching, weak spots…"
                    suggestions={TEAM_SUGGESTIONS}
                    onAsk={(q, h) => askClaude(buildTeamContext(members, topGrowth), q, h)}
                />
            )}

            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden shadow-sm">
                <div className="grid grid-cols-[minmax(0,1fr)_repeat(5,76px)_16px] items-center gap-2 px-4 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                    <span className="text-xs font-medium text-gray-500">Rep</span>
                    <ColHeader field="session_count" label="Sessions"   />
                    <ColHeader field="avg_overall"   label="Overall"    />
                    <ColHeader field="avg_adherence" label="Adherence"  />
                    <ColHeader field="avg_objection" label="Objections" />
                    <ColHeader field="avg_accuracy"  label="Accuracy"   />
                    <span />
                </div>
                {sorted.length === 0 && (
                    <div className="px-4 py-8 text-sm text-gray-500 text-center">
                        {q ? `No reps match “${query}”.` : "No active members with scored sessions."}
                    </div>
                )}
                {sorted.map(m => (
                    <Link
                        key={m.user_id}
                        href={`/team/${m.user_id}`}
                        className="grid grid-cols-[minmax(0,1fr)_repeat(5,76px)_16px] items-center gap-2 px-4 py-3 border-b border-[var(--color-border)] hover:bg-gray-50 transition-colors last:border-0"
                    >
                        <div className="flex flex-col min-w-0">
                            <span className="text-sm text-gray-900 font-medium truncate">
                                {m.user_name ?? m.user_email ?? m.user_id.slice(0, 8) + "…"}
                            </span>
                            {m.team_name && <span className="text-xs text-gray-400">{m.team_name}</span>}
                        </div>
                        <span className="text-sm text-gray-500 text-center tabular-nums justify-self-center">{m.session_count}</span>
                        <div className="justify-self-center"><ScoreRing score={m.avg_overall}   size="sm" /></div>
                        <div className="justify-self-center"><ScoreRing score={m.avg_adherence} size="sm" /></div>
                        <div className="justify-self-center"><ScoreRing score={m.avg_objection} size="sm" /></div>
                        <div className="justify-self-center"><ScoreRing score={m.avg_accuracy}  size="sm" /></div>
                        <svg className="w-4 h-4 text-gray-300 justify-self-center" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </Link>
                ))}
            </div>
        </div>
    )
}
