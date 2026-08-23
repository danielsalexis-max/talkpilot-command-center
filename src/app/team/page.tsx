"use client"

import { useEffect, useState } from "react"
import { Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase, askClaude, type TeamStats } from "@/lib/supabase"
import { ScoreRing } from "@/components/ScoreRing"
import { SearchBox } from "@/components/SearchBox"
import { AskPanel } from "@/components/AskPanel"
import { PageSkeleton } from "@/components/homeStates"
import { MembersTab } from "@/components/orgTabs"
import { useOrg, OrgBanners } from "@/lib/useOrg"
import { useT } from "@/i18n/LocaleProvider"
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

/// People live in ONE place now (D-175): performance and the roster/invites
/// are tabs of the same page. They used to be split between here and
/// Settings → Members, which is exactly where Alexis got lost looking for a
/// pending invite.
type TeamTab = "performance" | "members"

export default function TeamPage() {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <TeamPageInner />
        </Suspense>
    )
}

function TeamPageInner() {
    const router = useRouter()
    const params = useSearchParams()
    const t = useT()
    const { org, orgId, loading: orgLoading } = useOrg()
    const tab: TeamTab = params.get("tab") === "members" ? "members" : "performance"
    const setTab = (next: TeamTab) => router.replace(`/team?tab=${next}`, { scroll: false })

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold text-[var(--color-text)]">{t.team.title}</h1>
                <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                    {t.team.sub}
                </p>
            </div>

            {org && <OrgBanners org={org} />}

            <div className="border-b border-[var(--color-border)] flex gap-1">
                {([["performance", t.team.tabPerformance], ["members", t.team.tabMembers]] as const).map(([key, label]) => (
                    <button key={key} onClick={() => setTab(key)}
                        className={`px-4 py-2 text-sm border-b-2 transition-colors -mb-px whitespace-nowrap ${
                            tab === key
                                ? "border-[var(--color-accent)] text-[var(--color-accent-deep)] font-semibold"
                                : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                        }`}
                    >{label}</button>
                ))}
            </div>

            {tab === "performance" && <PerformanceTab onSeeMembers={() => setTab("members")} />}
            {tab === "members" && (
                orgLoading ? <PageSkeleton rows={2} />
                : orgId && org ? <MembersTab orgId={orgId} org={org} />
                : <p className="text-sm text-[var(--color-text-secondary)]">{t.team.membersManagedBy}</p>
            )}
        </div>
    )
}

function PerformanceTab({ onSeeMembers }: { onSeeMembers: () => void }) {
    const t = useT()
    const [members, setMembers]   = useState<TeamStats[]>([])
    const [loading, setLoading]   = useState(true)
    const [sortKey, setSortKey]   = useState<keyof TeamStats>("avg_overall")
    const [sortDesc, setSortDesc] = useState(true)
    const [query, setQuery]       = useState("")
    const [topGrowth, setTopGrowth] = useState<[string, number][]>([])
    const [pendingInvites, setPendingInvites] = useState(0)

    useEffect(() => { load() }, [])

    async function load() {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) { window.location.replace("/login"); return }
            const { data: ctx } = await supabase.rpc("get_org_context")
            if (!ctx?.org_id) { setLoading(false); return }

            // Invited-but-not-yet-joined people are invisible on this page, which
            // reads as "the invite didn't work" (D-171). RLS scopes org_invites to
            // admins, so for managers this just stays 0.
            supabase.from("org_invites")
                .select("id", { count: "exact", head: true })
                .eq("org_id", ctx.org_id).is("accepted_at", null)
                .gt("expires_at", new Date().toISOString())
                .then(({ count }) => setPendingInvites(count ?? 0))

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

    const ColHeader = ({ field, label, className = "" }: { field: keyof TeamStats; label: string; className?: string }) => (
        <button
            onClick={() => { if (sortKey === field) setSortDesc(!sortDesc); else { setSortKey(field); setSortDesc(true) } }}
            className={`text-xs font-medium text-center whitespace-nowrap justify-self-center transition-colors ${className} ${sortKey === field ? "text-[var(--color-accent)]" : "text-[var(--color-muted)] hover:text-[var(--color-text)]"}`}
        >
            {label}{sortKey === field ? (sortDesc ? " ↓" : " ↑") : ""}
        </button>
    )

    if (loading) return <PageSkeleton rows={2} />

    // Rep + Sessions + Overall always show; Adherence/Objections/Accuracy are
    // reachable on a rep's own page, so they're progressively revealed as
    // room allows rather than forcing horizontal scroll on phones.
    const gridCols = "grid-cols-[minmax(0,1fr)_56px_56px_16px] sm:grid-cols-[minmax(0,1fr)_64px_64px_64px_16px] md:grid-cols-[minmax(0,1fr)_repeat(5,64px)_16px] lg:grid-cols-[minmax(0,1fr)_repeat(5,76px)_16px]"

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <p className="text-sm text-[var(--color-text-secondary)]">
                    {t.team.thirtyDayAvg}
                    {pendingInvites > 0 && (
                        <>{" "}<button onClick={onSeeMembers} className="text-[var(--color-accent-deep)] font-medium hover:underline">
                            {t.team.invitesPending(pendingInvites)}
                        </button></>
                    )}
                </p>
                <SearchBox value={query} onChange={setQuery} placeholder={t.team.searchReps} />
            </div>

            {members.length > 0 && (
                <AskPanel
                    heading={t.team.askHeading}
                    placeholder={t.team.askPlaceholder}
                    suggestions={t.team.suggestions}
                    onAsk={(q, h) => askClaude(buildTeamContext(members, topGrowth), q, h)}
                />
            )}

            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden shadow-sm overflow-x-auto">
                <div className={`grid ${gridCols} items-center gap-2 px-4 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-bg)] min-w-[360px]`}>
                    <span className="text-xs font-medium text-[var(--color-text-secondary)]">{t.common.rep}</span>
                    <ColHeader field="session_count" label={t.team.colSessions}   />
                    <ColHeader field="avg_overall"   label={t.common.overall}     />
                    <ColHeader field="avg_adherence" label={t.common.adherence}   className="hidden sm:block" />
                    <ColHeader field="avg_objection" label={t.common.objections}  className="hidden md:block" />
                    <ColHeader field="avg_accuracy"  label={t.common.accuracy}    className="hidden md:block" />
                    <span />
                </div>
                {sorted.length === 0 && (
                    <div className="px-4 py-8 text-sm text-[var(--color-text-secondary)] text-center">
                        {q ? t.team.noRepsMatch(query) : t.team.noActiveMembers}
                    </div>
                )}
                {sorted.map(m => (
                    <Link
                        key={m.user_id}
                        href={`/team/${m.user_id}`}
                        className={`grid ${gridCols} items-center gap-2 px-4 py-3 border-b border-[var(--color-border)] hover:bg-[var(--color-hover)] transition-colors last:border-0 min-w-[360px]`}
                    >
                        <div className="flex flex-col min-w-0">
                            <span className="text-sm text-[var(--color-text)] font-medium truncate">
                                {m.user_name ?? m.user_email ?? m.user_id.slice(0, 8) + "…"}
                            </span>
                            {m.team_name && <span className="text-xs text-[var(--color-muted)]">{m.team_name}</span>}
                        </div>
                        <span className="text-sm text-[var(--color-text-secondary)] text-center tabular-nums justify-self-center">{m.session_count}</span>
                        <div className="justify-self-center"><ScoreRing score={m.avg_overall}   size="sm" /></div>
                        <div className="hidden sm:block justify-self-center"><ScoreRing score={m.avg_adherence} size="sm" /></div>
                        <div className="hidden md:block justify-self-center"><ScoreRing score={m.avg_objection} size="sm" /></div>
                        <div className="hidden md:block justify-self-center"><ScoreRing score={m.avg_accuracy}  size="sm" /></div>
                        <svg className="w-4 h-4 text-[var(--color-muted)] justify-self-center" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </Link>
                ))}
            </div>
        </div>
    )
}
