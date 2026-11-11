"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import type { Route } from "next"
import { supabase, type Scorecard } from "@/lib/supabase"
import { ScoreRing } from "@/components/ScoreRing"
import { InsightsSections } from "@/components/InsightsSections"
import { PageSkeleton, HomeSetupCard, CoachReadingBanner, type SetupState } from "@/components/homeStates"
import { AISetupCard } from "@/components/aiSetupCard"
import { WeekPlan, type WeekPlanData } from "@/components/weekPlan"
import { useLocale } from "@/i18n/LocaleProvider"
import { userError } from "@/lib/userError"
import {
    countedCards, pickWindow, skillPerRep, lostObjections, callsWithoutNextStep,
    type WeekObjectionRow, type PlaybookStages,
} from "@/lib/weekPlan"

interface OrgInfo { id: string; name: string; visibility: string; seats_purchased: number; plan: string }
interface MemberInfo { user_id: string; email: string | null; full_name: string | null; status: string; role?: string }

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
    const [loading, setLoading]   = useState(true)
    const [error, setError]       = useState<string | null>(null)
    const [userName, setUserName] = useState<string | null>(null)
    const [isAdmin, setIsAdmin]   = useState(false)
    const [week, setWeek]         = useState<WeekPlanData | null>(null)

    const memberLabel = (m: MemberInfo | undefined) => m?.full_name || m?.email || t.common.rep

    useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

    async function load() {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) { router.replace("/login"); return }
            const meta = (user.user_metadata ?? {}) as { full_name?: string; name?: string }
            const full = meta.full_name || meta.name || ""
            setUserName(full.trim().split(/\s+/)[0] || null)

            const { data: orgData } = await supabase.rpc("get_org_context")
            if (!orgData?.org_id) {
                // No workspace yet. Two very different people land here, and
                // sending both to the same place is what made onboarding feel
                // optional: someone who just signed up needs the wizard, while
                // an invited member has no org *by design* and must use their
                // invite link — pushing them into "create a workspace" is the
                // wrong-account hazard of D-062/D-169. So ask first, and fail
                // safe to the card if the check itself errors.
                const { data: invited, error: invErr } = await supabase.rpc("has_pending_invite")
                if (invErr || invited) { setError("no_org"); setLoading(false); return }
                // Leave `loading` true: the skeleton holds until the route
                // changes, so the dashboard never flashes on the way to /start.
                router.replace("/start")
                return
            }
            const orgId = orgData.org_id
            setIsAdmin(["owner", "admin"].includes(orgData.member_role))

            const [{ data: orgInfo }, { data: scorecards }, { data: mems },
                   { count: pbCount }, { count: objCount }, { count: kbCount }, { count: invCount }] = await Promise.all([
                supabase.from("organizations").select("id, name, visibility, seats_purchased, plan").eq("id", orgId).single(),
                supabase.from("session_scorecards").select("*")
                    .eq("org_id", orgId).eq("status", "scored")
                    // Excluded calls stay visible but out of every average
                    // (D-324) — a two-second test run must not pull a rep down.
                    .is("excluded_at", null)
                    // Only sales calls (D-917). Null is a call scored before
                    // triage existed, graded as a sales call like all were.
                    .or("call_type.is.null,call_type.eq.sales")
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
                // Every row here is a deliberate add since D-627 (nothing
                // auto-seeds objections anymore — kit objections are offered
                // as suggestions), so all active rows count.
                supabase.from("org_objections").select("id", { count: "exact", head: true })
                    .eq("org_id", orgId).eq("active", true),
                supabase.from("org_knowledge").select("id", { count: "exact", head: true })
                    .eq("org_id", orgId).neq("status", "archived"),
                supabase.from("org_invites").select("id", { count: "exact", head: true })
                    .eq("org_id", orgId).is("accepted_at", null).is("revoked_at", null)
                    .gt("expires_at", new Date().toISOString()),
            ])
            setOrg(orgInfo)
            setCards((scorecards ?? []) as Scorecard[])
            const activeMems = ((mems ?? []) as MemberInfo[]).filter(m => m.status === "active" || !m.status)
            setMembers(activeMems)
            setWeek(await loadWeek((scorecards ?? []) as Scorecard[], activeMems))
            setSetup({
                activePlaybooks: pbCount ?? 0,
                objections: objCount ?? 0,
                knowledge: kbCount ?? 0,
                // The activation half (2026-08-27): scoredCalls uses the same
                // 30-day scorecard window the dashboard renders, so "first call
                // scored" and "the dashboard has data" can never disagree.
                members: activeMems.length,
                pendingInvites: invCount ?? 0,
                scoredCalls: (scorecards ?? []).length,
            })
        } catch (e) {
            setError(userError(e, t))
        } finally {
            setLoading(false)
        }
    }

    // D-929: what the manager does this week, from the window's scored sales
    // calls. A failure here must not take the rest of Home down with it.
    async function loadWeek(all: Scorecard[], mems: MemberInfo[]): Promise<WeekPlanData | null> {
        try {
            const win = pickWindow(countedCards(all))
            if (win.cards.length === 0) return null
            const ids = win.cards.map(c => c.id)
            const pbIds = Array.from(new Set(win.cards.map(c => c.playbook_id).filter((x): x is string => !!x)))
            const [{ data: objRows }, { data: pbs }] = await Promise.all([
                supabase.from("scorecard_objections")
                    .select("scorecard_id, user_id, objection_id, objection_text, grade, transcript_ts")
                    .in("scorecard_id", ids),
                pbIds.length
                    ? supabase.from("org_playbooks").select("id, stages").in("id", pbIds)
                    : Promise.resolve({ data: [] as PlaybookStages[] }),
            ])
            const rows = (objRows ?? []) as WeekObjectionRow[]
            const libIds = Array.from(new Set(rows.map(r => r.objection_id).filter((x): x is string => !!x)))
            const library = new Map<string, string>()
            if (libIds.length) {
                const { data: lib } = await supabase.from("org_objections").select("id, objection").in("id", libIds)
                for (const o of (lib ?? []) as { id: string; objection: string }[]) library.set(o.id, o.objection)
            }
            const withCalls = Array.from(new Set(win.cards.map(c => c.user_id)))
            const next = callsWithoutNextStep(win.cards, new Map(((pbs ?? []) as PlaybookStages[]).map(p => [p.id, p])))
            const label = (m: MemberInfo) => m.full_name || m.email || t.common.rep
            return {
                days: win.days,
                calls: win.cards.length,
                // Alphabetical, the order of the team list.
                skills: skillPerRep(win.cards, withCalls)
                    .sort((a, b) => label(mems.find(m => m.user_id === a.userId) ?? {} as MemberInfo)
                        .localeCompare(label(mems.find(m => m.user_id === b.userId) ?? {} as MemberInfo))),
                idleReps: mems.filter(m => m.role === "member" && !withCalls.includes(m.user_id)).map(label),
                objections: lostObjections(rows, win.cards, library),
                noNextStep: next.items,
                nextChecked: next.checked,
                breach: win.cards.find(c => (c.guardrail_breaches ?? []).length > 0) ?? null,
            }
        } catch {
            return null
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
        // Accuracy is hidden until the fact-check verifies real claims (D-917):
        // in live orgs ~99% of claims came back "unverifiable", so the tile was
        // noise at best and an accusation at worst.
    ]

    const hour = new Date().getHours()
    const dayPart: "morning" | "afternoon" | "evening" = hour < 12 ? "morning" : hour < 19 ? "afternoon" : "evening"

    return (
        <div className="space-y-5">
            {/* ── The apps' greeting header (D-586) ── */}
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-[var(--color-text)]">{t.home.greeting(dayPart, userName)}</h1>
                    <p className="text-[13px] text-[var(--color-text-secondary)] mt-1">
                        <span className="capitalize">{new Date().toLocaleDateString(intl, { weekday: "long", month: "short", day: "numeric" })}</span>
                        {org?.name ? <> · {org.name}</> : null}
                        <span className="hidden sm:inline capitalize"> · {t.home.headerMeta(org?.plan ?? "", org?.seats_purchased ?? 0, (t.data.visibility[org?.visibility ?? ""] ?? org?.visibility ?? "").toLowerCase())}</span>
                    </p>
                </div>
                <Link href={"/team?tab=members" as Route}
                    className="px-4 py-2 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] text-[var(--btn-ink)] text-sm font-semibold rounded-lg transition-colors">
                    {t.home.inviteReps}
                </Link>
            </div>

            {/* ── First-run: ONE card above the dashboard, not instead of it
                 (D-192 kept). The old shape rendered the checklist AND the
                 waiting-room card for a set-up-but-call-less org — two stacked
                 things-to-do surfaces. HomeSetupCard merges them: checklist
                 half (owner-controllable steps only, auto-retires when all
                 done) beside a status half showing zero-state value ("no
                 coaching sessions to review") until the first scorecard lands. ── */}
            {org && <CoachReadingBanner orgId={org.id} />}

            {setup && org && (
                <HomeSetupCard state={setup} orgId={org.id} hasCards={cards.length > 0} />
            )}

            {/* D-800: let their own AI write the coaching setup. Shown to owners
                 and admins until the content half of the checklist is done. */}
            {setup && org && isAdmin && !(setup.activePlaybooks >= 1 && setup.objections >= 3 && setup.knowledge >= 1) && (
                <AISetupCard surface="home" />
            )}

            {/* ── D-929: the answer to "what do I do this week?" comes first.
                 Managers used Home for setup only; the old KPI hero, trend chart
                 and attention feed told them how the team was doing but not
                 what to do about it. ── */}
            {week && <WeekPlan data={week} nameOf={id => memberLabel(byUser.get(id))} />}

            {/* ── The numbers, now below the plan ── */}
            {cards.length > 0 && (<>

            <h2 className="font-display text-[17px] font-bold text-[var(--color-text)] pt-2">{t.home.week.moreTitle}</h2>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
                <div className="space-y-4 min-w-0">
                    {/* KPI row — one card, big numbers over small labels, like
                        the apps' "This week" card (D-586). */}
                    <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            {kpis.map(k => (
                                <div key={k.field} title={k.hint} className="cursor-help">
                                    <div className="flex items-baseline gap-2">
                                        <span className="font-display text-[28px] font-bold leading-none text-[var(--color-text)]">{avgOf(cards, k.field) ?? "—"}</span>
                                        <Delta value={delta(k.field)} />
                                    </div>
                                    <p className="text-[13px] text-[var(--color-text-secondary)] mt-1.5">{k.label}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Recent calls */}
                    <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-sm font-semibold text-[var(--color-text)]">{t.home.recentCalls}</h2>
                            <Link href="/calls" className="text-xs font-semibold text-[var(--color-accent-deep)] hover:underline">{t.home.allCalls}</Link>
                        </div>
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
                </div>
            </div>

            {/* Weekly digests, folded in from the old Insights page (D-175).
                Its objection list is replaced by the plan's (D-929). */}
            <InsightsSections showObjections={false} />
            </>)}
        </div>
    )
}
