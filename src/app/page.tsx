"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import type { Route } from "next"
import { supabase, type Scorecard } from "@/lib/supabase"
import { ScoreRing } from "@/components/ScoreRing"
import { InsightsSections } from "@/components/InsightsSections"
import { PageSkeleton, SetupChecklistCard, WaitingRoomCard, type SetupState } from "@/components/homeStates"
import { useLocale } from "@/i18n/LocaleProvider"
import {
    LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts"

interface OrgInfo { id: string; name: string; visibility: string; seats_purchased: number; plan: string; voice_profile?: { tone?: string } | null }
interface MemberInfo { user_id: string; email: string | null; full_name: string | null; status: string }
interface TrendPoint { week: string; overall: number | null; adherence: number | null }

interface Attention {
    kind: "breach" | "decline" | "review"
    title: string
    sub: string
    cta: string
    href: Route
}

const avgOf = (cards: Scorecard[], field: keyof Scorecard) => {
    const vals = cards.map(c => c[field] as number | null).filter((v): v is number => v != null)
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null
}

function Delta({ value }: { value: number | null }) {
    if (value == null || value === 0) return <span className="font-mono text-[11px] text-[var(--color-muted)]">—</span>
    return value > 0
        ? <span className="font-mono text-[11px] text-emerald-600">▲ {value}</span>
        : <span className="font-mono text-[11px] text-red-600">▼ {-value}</span>
}

export default function HomePage() {
    const router = useRouter()
    const { t, intl } = useLocale()
    const [org, setOrg]           = useState<OrgInfo | null>(null)
    const [cards, setCards]       = useState<Scorecard[]>([])
    const [members, setMembers]   = useState<MemberInfo[]>([])
    const [setup, setSetup]       = useState<SetupState | null>(null)
    const [pendingInvites, setPendingInvites] = useState(0)
    const [loading, setLoading]   = useState(true)
    const [error, setError]       = useState<string | null>(null)

    const memberLabel = (m: MemberInfo | undefined) => m?.full_name || m?.email || t.common.rep

    useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

    async function load() {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) { router.replace("/login"); return }

            const { data: orgData } = await supabase.rpc("get_org_context")
            if (!orgData?.org_id) { setError("no_org"); setLoading(false); return }
            const orgId = orgData.org_id

            const [{ data: orgInfo }, { data: scorecards }, { data: mems },
                   { count: pbCount }, { count: objCount }, { count: kbCount }, { count: invCount }] = await Promise.all([
                supabase.from("organizations").select("id, name, visibility, seats_purchased, plan, voice_profile").eq("id", orgId).single(),
                supabase.from("session_scorecards").select("*")
                    .eq("org_id", orgId).eq("status", "scored")
                    .gte("started_at", new Date(Date.now() - 30 * 86400e3).toISOString())
                    .order("started_at", { ascending: false }).limit(200),
                supabase.rpc("get_org_members_with_email", { p_org: orgId }),
                // Setup + waiting-room state (D-175): Home owns the first-run
                // journey, so it needs to know whether the brain is assembled
                // and whether anyone is still en route.
                supabase.from("org_playbooks").select("id", { count: "exact", head: true })
                    .eq("org_id", orgId).eq("status", "active"),
                // active-only, matching the AppShell nav dot (D-175) — the two
                // counts disagreed and an org with only deactivated objections
                // got a permanent amber dot but no checklist.
                supabase.from("org_objections").select("id", { count: "exact", head: true })
                    .eq("org_id", orgId).eq("active", true),
                supabase.from("org_knowledge").select("id", { count: "exact", head: true })
                    .eq("org_id", orgId),
                supabase.from("org_invites").select("id", { count: "exact", head: true })
                    .eq("org_id", orgId).is("accepted_at", null).is("revoked_at", null)
                    .gt("expires_at", new Date().toISOString()),
            ])
            setOrg(orgInfo)
            setCards((scorecards ?? []) as Scorecard[])
            const activeMems = ((mems ?? []) as MemberInfo[]).filter(m => m.status === "active" || !m.status)
            setMembers(activeMems)
            setSetup({
                activePlaybooks: pbCount ?? 0,
                objections: objCount ?? 0,
                knowledge: kbCount ?? 0,
                voiceSet: !!(orgInfo?.voice_profile?.tone),
                // The activation half (2026-08-27): scoredCalls uses the same
                // 30-day scorecard window the dashboard renders, so "first call
                // scored" and "the dashboard has data" can never disagree.
                members: activeMems.length,
                pendingInvites: invCount ?? 0,
                scoredCalls: (scorecards ?? []).length,
            })
            setPendingInvites(invCount ?? 0)
        } catch (e) {
            setError((e as Error).message)
        } finally {
            setLoading(false)
        }
    }

    if (loading) return <PageSkeleton />
    if (error === "no_org") return (
        <div className="max-w-md mx-auto mt-16 bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-8 text-center shadow-sm">
            <h1 className="font-display text-xl font-bold text-[var(--color-text)]">{t.home.noWorkspaceTitle}</h1>
            <p className="text-sm text-[var(--color-text-secondary)] mt-2">
                {t.home.noWorkspaceBody}
            </p>
            <a href="/start" className="inline-block mt-5 px-5 py-2.5 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] text-[var(--btn-ink)] text-sm font-semibold rounded-lg transition-colors">
                {t.home.createWorkspace}
            </a>
            <p className="text-xs text-[var(--color-muted)] mt-4">{t.home.gotInvite}</p>
        </div>
    )
    if (error)   return <div className="text-red-600 text-sm">{error}</div>

    const byUser = new Map<string, MemberInfo>(members.map(m => [m.user_id, m]))
    const half = Date.now() - 15 * 86400e3
    const recentHalf = cards.filter(c => c.started_at && new Date(c.started_at).getTime() >= half)
    const priorHalf  = cards.filter(c => c.started_at && new Date(c.started_at).getTime() < half)
    const delta = (field: keyof Scorecard) => {
        const a = avgOf(recentHalf, field), b = avgOf(priorHalf, field)
        return a != null && b != null ? a - b : null
    }

    // ── Attention feed ──
    const attention: Attention[] = []
    const breachCard = cards.find(c => (c.guardrail_breaches ?? []).length > 0)
    if (breachCard) {
        const b = breachCard.guardrail_breaches[0]
        attention.push({
            kind: "breach",
            title: t.home.attnBreachTitle(b.rule),
            sub: `${memberLabel(byUser.get(breachCard.user_id))} · ${breachCard.session_title || t.common.scoredCall}`,
            cta: t.home.attnReviewCall, href: `/scorecard/${breachCard.id}` as Route,
        })
    }
    // Biggest adherence decline, recent half vs prior half, min 2 calls each side.
    let decline: { user: string; drop: number } | null = null
    for (const m of members) {
        const a = avgOf(recentHalf.filter(c => c.user_id === m.user_id), "adherence_score")
        const b = avgOf(priorHalf.filter(c => c.user_id === m.user_id), "adherence_score")
        const nA = recentHalf.filter(c => c.user_id === m.user_id).length
        const nB = priorHalf.filter(c => c.user_id === m.user_id).length
        if (a != null && b != null && nA >= 2 && nB >= 2 && b - a >= 8 && (!decline || b - a > decline.drop)) {
            decline = { user: m.user_id, drop: b - a }
        }
    }
    if (decline) {
        attention.push({
            kind: "decline",
            title: t.home.attnDeclineTitle(memberLabel(byUser.get(decline.user)), decline.drop),
            sub: t.home.attnDeclineSub,
            cta: t.home.attnOpenProfile, href: `/team/${decline.user}` as Route,
        })
    }
    const reviewable = cards.filter(c =>
        (c.guardrail_breaches ?? []).length > 0 || (c.adherence_score != null && c.adherence_score < 60))
    if (reviewable.length > 0) {
        attention.push({
            kind: "review",
            title: t.home.attnReviewTitle(reviewable.length),
            sub: t.home.attnReviewSub,
            cta: t.home.attnOpenQueue, href: "/coaching",
        })
    }

    // ── Trend (all 30d rows — the old page computed this from a 50-row slice) ──
    const trend: TrendPoint[] = []
    for (let w = 3; w >= 0; w--) {
        const start = Date.now() - (w + 1) * 7 * 86400e3
        const end   = Date.now() - w * 7 * 86400e3
        const week  = cards.filter(c => {
            const time = c.started_at ? new Date(c.started_at).getTime() : null
            return time != null && time >= start && time < end
        })
        trend.push({
            week: new Date(start).toLocaleDateString(intl, { month: "short", day: "numeric" }),
            overall: avgOf(week, "overall_score"),
            adherence: avgOf(week, "adherence_score"),
        })
    }

    // ── Leaderboard ──
    const leaderboard = members
        .map(m => {
            const mine = cards.filter(c => c.user_id === m.user_id)
            return { m, n: mine.length, score: avgOf(mine, "overall_score") }
        })
        .filter(r => r.score != null)
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, 5)

    const activeMembers = members.length
    const sessionsPerRepWeek = activeMembers ? Math.round((cards.length / activeMembers / (30 / 7)) * 10) / 10 : 0

    const kpis: { label: string; field: keyof Scorecard; hint: string }[] = [
        { label: t.common.overall,    field: "overall_score",   hint: t.home.kpiHints.overall },
        { label: t.common.adherence,  field: "adherence_score", hint: t.home.kpiHints.adherence },
        { label: t.common.objections, field: "objection_score", hint: t.home.kpiHints.objections },
        { label: t.common.accuracy,   field: "accuracy_score",  hint: t.home.kpiHints.accuracy },
    ]

    const attnStyle: Record<Attention["kind"], string> = {
        breach:  "border-l-red-500",
        decline: "border-l-amber-400",
        review:  "border-l-[var(--color-accent-light)]",
    }
    const attnPill: Record<Attention["kind"], { label: string; cls: string }> = {
        breach:  { label: t.home.pillCritical,     cls: "bg-red-50 text-red-700" },
        decline: { label: t.home.pillTrendingDown, cls: "bg-amber-50 text-amber-700" },
        review:  { label: t.home.pillCoaching,     cls: "bg-[var(--color-accent-subtle)] text-[var(--color-accent-deep)]" },
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-[var(--color-text)]">{org?.name}</h1>
                    <p className="text-sm text-[var(--color-text-secondary)] mt-1 capitalize">
                        {t.home.headerMeta(org?.plan ?? "", org?.seats_purchased ?? 0, (t.data.visibility[org?.visibility ?? ""] ?? org?.visibility ?? "").toLowerCase())}
                    </p>
                </div>
                <Link href={"/team?tab=members" as Route}
                    className="px-4 py-2 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] text-[var(--btn-ink)] text-sm font-semibold rounded-lg transition-colors">
                    {t.home.inviteReps}
                </Link>
            </div>

            {/* ── Unfinished setup: a card ABOVE the dashboard, not instead of it
                 (D-192, superseding D-175 on this point).
                 The checklist used to replace Home entirely, which produced the
                 e2e's exact complaint: every other tab rendered normally while
                 Home alone was "empty and broken", and the two required items
                 are already satisfied by finishing /start — so the wizard
                 handed you a second checklist for work you had just done.
                 Now it is a banner, and whatever data exists still shows.
                 It no longer vanishes when the required items are done (D-217):
                 the recommended items stay visible until the owner dismisses it
                 themselves — the X only appears once the required bar is met. ── */}
            {setup && org && (
                <SetupChecklistCard state={setup} orgId={org.id} />
            )}

            {/* ── Nobody has made a call yet ── */}
            {cards.length === 0 && (
                <WaitingRoomCard activeMembers={members.length} pendingInvites={pendingInvites} />
            )}

            {/* ── State 3: the live dashboard ── */}
            {cards.length > 0 && (<>

            {/* Attention feed */}
            {attention.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {attention.map(a => (
                        <Link key={a.kind} href={a.href}
                            className={`bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] border-l-[3px] ${attnStyle[a.kind]} p-4 shadow-sm hover:shadow transition-shadow block`}>
                            <span className={`inline-block font-mono text-[10px] tracking-wide px-2 py-0.5 rounded-full ${attnPill[a.kind].cls}`}>{attnPill[a.kind].label}</span>
                            <p className="text-[13px] font-semibold text-[var(--color-text)] mt-2 leading-snug">{a.title}</p>
                            <p className="text-xs text-[var(--color-text-secondary)] mt-1">{a.sub}</p>
                            <p className="text-xs font-semibold text-[var(--color-accent-deep)] mt-2">{a.cta}</p>
                        </Link>
                    ))}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
                <div className="space-y-4 min-w-0">
                    {/* KPI tiles */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {kpis.map(k => (
                            <div key={k.field} className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 shadow-sm">
                                <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)] cursor-help" title={k.hint}>{k.label}</p>
                                <div className="flex items-baseline gap-2 mt-1">
                                    <span className="font-mono text-2xl text-[var(--color-text)]">{avgOf(cards, k.field) ?? "—"}</span>
                                    <Delta value={delta(k.field)} />
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Trend */}
                    {trend.some(p => p.overall != null) && (
                        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm">
                            <div className="flex items-center justify-between">
                                <h2 className="text-sm font-semibold text-[var(--color-text)]">{t.home.trendTitle}</h2>
                                <div className="flex items-center gap-3 text-[11px] text-[var(--color-text-secondary)]">
                                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#0C9482]" />{t.common.overall}</span>
                                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#E69F19]" />{t.common.adherence}</span>
                                </div>
                            </div>
                            <div className="text-[var(--color-muted)] mt-3">
                                <ResponsiveContainer width="100%" height={200}>
                                    <LineChart data={trend} margin={{ left: -20 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.18} />
                                        <XAxis dataKey="week" tick={{ fontSize: 11, fill: "currentColor" }} stroke="currentColor" strokeOpacity={0.25} />
                                        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "currentColor" }} stroke="currentColor" strokeOpacity={0.25} />
                                        <Tooltip
                                            contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8 }}
                                            labelStyle={{ color: "var(--color-text)", fontSize: 12, fontWeight: 600 }}
                                            itemStyle={{ fontSize: 12 }}
                                        />
                                        <Line type="monotone" dataKey="overall"   stroke="#0C9482" strokeWidth={2.5} dot={{ r: 3 }} connectNulls name={t.common.overall}   />
                                        <Line type="monotone" dataKey="adherence" stroke="#E69F19" strokeWidth={2}   dot={{ r: 2.5 }} connectNulls name={t.common.adherence} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}

                    {/* Recent calls */}
                    <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-sm font-semibold text-[var(--color-text)]">{t.home.recentCalls}</h2>
                            <Link href="/calls" className="text-xs font-semibold text-[var(--color-accent-deep)] hover:underline">{t.home.allCalls}</Link>
                        </div>
                        {cards.length === 0 && (
                            <div className="py-8 text-center">
                                <p className="text-sm text-[var(--color-text-secondary)]">{t.home.noScoredSessions}</p>
                                <p className="text-xs text-[var(--color-muted)] mt-1">{t.home.sessionsAppear}</p>
                            </div>
                        )}
                        <div className="divide-y divide-[var(--color-line-soft)]">
                            {cards.slice(0, 6).map(c => (
                                <Link key={c.id} href={`/scorecard/${c.id}`}
                                    className="flex items-center justify-between gap-3 py-2.5 hover:bg-[var(--color-hover)] -mx-2 px-2 rounded-lg transition-colors">
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-[var(--color-text)] truncate">
                                            {c.session_title || (c.started_at ? new Date(c.started_at).toLocaleString(intl, { dateStyle: "medium", timeStyle: "short" }) : t.common.scoredCall)}
                                        </p>
                                        <p className="text-xs text-[var(--color-muted)]">
                                            {memberLabel(byUser.get(c.user_id))}
                                            {c.started_at ? ` · ${new Date(c.started_at).toLocaleDateString(intl, { month: "short", day: "numeric" })}` : ""}
                                            {c.duration_minutes ? ` · ${t.common.min(c.duration_minutes)}` : ""}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {(c.guardrail_breaches ?? []).length > 0 &&
                                            <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-700">{t.home.breach}</span>}
                                        <ScoreRing score={c.overall_score} />
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right rail */}
                <div className="space-y-4">
                    <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm">
                        <h2 className="text-sm font-semibold text-[var(--color-text)]">{t.home.adoption}</h2>
                        <div className="space-y-3 mt-3">
                            <div>
                                <div className="flex justify-between text-xs text-[var(--color-text-secondary)]">
                                    <span>{t.home.activeSeats}</span>
                                    <span className="font-mono text-[var(--color-text)]">{activeMembers} / {org?.seats_purchased ?? "—"}</span>
                                </div>
                                <div className="h-1.5 bg-[var(--color-line-soft)] rounded-full mt-1.5">
                                    <div className="h-full bg-[var(--color-accent)] rounded-full"
                                        style={{ width: `${Math.min(100, org?.seats_purchased ? (activeMembers / org.seats_purchased) * 100 : 0)}%` }} />
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between text-xs text-[var(--color-text-secondary)]">
                                    <span>{t.home.sessionsPerRepWeek}</span>
                                    <span className="font-mono text-[var(--color-text)]">{sessionsPerRepWeek}</span>
                                </div>
                                <div className="h-1.5 bg-[var(--color-line-soft)] rounded-full mt-1.5">
                                    <div className="h-full bg-[var(--color-accent-light)] rounded-full"
                                        style={{ width: `${Math.min(100, sessionsPerRepWeek * 12)}%` }} />
                                </div>
                            </div>
                            <div className="flex justify-between text-xs text-[var(--color-text-secondary)]">
                                <span>{t.home.scoredCalls30d}</span>
                                <span className="font-mono text-[var(--color-text)]">{cards.length}</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-sm font-semibold text-[var(--color-text)]">{t.home.leaderboard}</h2>
                            <Link href="/team" className="text-xs font-semibold text-[var(--color-accent-deep)] hover:underline">{t.home.allReps}</Link>
                        </div>
                        {leaderboard.length === 0 && <p className="text-xs text-[var(--color-muted)]">{t.home.scoresAppear}</p>}
                        <div className="space-y-2.5">
                            {leaderboard.map((r, i) => (
                                <Link key={r.m.user_id} href={`/team/${r.m.user_id}`} className="flex items-center gap-2.5 group">
                                    <span className="font-mono text-[11px] text-[var(--color-muted)] w-3.5">{i + 1}</span>
                                    <span className="w-7 h-7 rounded-full bg-[var(--color-accent-subtle)] text-[var(--color-accent-deep)] text-[10px] font-semibold flex items-center justify-center shrink-0">
                                        {memberLabel(r.m).split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                                    </span>
                                    <span className="text-[13px] font-medium text-[var(--color-text)] truncate group-hover:text-[var(--color-accent-deep)]">
                                        {memberLabel(r.m)}
                                        <span className="block text-[10.5px] font-normal text-[var(--color-muted)]">{t.home.nCalls(r.n)}</span>
                                    </span>
                                    <span className="font-mono text-sm ml-auto text-[var(--color-text)]">{r.score}</span>
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Deeper cuts — folded in from the old Insights page (D-175) */}
            <InsightsSections />
            </>)}
        </div>
    )
}
