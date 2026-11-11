"use client"

import Link from "next/link"
import type { Route } from "next"
import type { Scorecard } from "@/lib/supabase"
import { useLocale } from "@/i18n/LocaleProvider"
import {
    momentHref, practiceHref,
    type SkillPick, type LostObjection, type NoNextStep,
} from "@/lib/weekPlan"

/// Home's "What to do this week" (D-929). Three lists a manager can act on
/// on Monday morning, each item with a way into the call and a way to assign
/// practice from it. Data is computed in lib/weekPlan.ts.

export interface WeekPlanData {
    days: 7 | 30
    calls: number
    skills: SkillPick[]
    idleReps: string[]
    objections: LostObjection[]
    noNextStep: NoNextStep[]
    nextChecked: number
    breach: Scorecard | null
}

const CARD = "bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm"
const LINK = "inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-accent-deep)] hover:underline"
const BTN  = "inline-flex items-center h-7 px-2.5 rounded-lg text-xs font-semibold border border-[var(--color-border-strong)] text-[var(--color-text)] bg-[var(--color-surface)] hover:border-[var(--color-accent)] transition-colors"

function Initials({ name }: { name: string }) {
    return (
        <span className="w-8 h-8 rounded-full bg-[var(--color-accent-subtle)] text-[var(--color-accent-deep)] text-[11px] font-semibold flex items-center justify-center shrink-0">
            {name.split(/[\s@.]+/).filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase()}
        </span>
    )
}

function SectionHead({ title, sub }: { title: string; sub: string }) {
    return (
        <div className="mb-3">
            <h3 className="font-display text-[15px] font-bold text-[var(--color-text)]">{title}</h3>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{sub}</p>
        </div>
    )
}

export function WeekPlan({ data, nameOf }: { data: WeekPlanData; nameOf: (userId: string) => string }) {
    const { t, intl } = useLocale()
    const W = t.home.week
    const day = (iso: string | null) => iso ? new Date(iso).toLocaleDateString(intl, { month: "short", day: "numeric" }) : ""
    const callName = (c: Scorecard) => c.session_title || (c.started_at ? new Date(c.started_at).toLocaleString(intl, { dateStyle: "medium", timeStyle: "short" }) : t.common.scoredCall)
    const reps = data.skills.filter(s => s.calls > 0)

    return (
        <section className="space-y-4">
            <div>
                <h2 className="font-display text-[20px] font-bold text-[var(--color-text)]">{W.title}</h2>
                <p className="text-[13px] text-[var(--color-text-secondary)] mt-0.5">
                    {data.days === 7 ? W.basis7(data.calls) : W.basis30(data.calls)}
                </p>
            </div>

            {/* A broken rule outranks everything else on the list. */}
            {data.breach && (data.breach.guardrail_breaches ?? [])[0] && (
                <Link href={momentHref(data.breach.id, null) as Route}
                    className="block bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] border-l-[3px] border-l-red-500 p-4 shadow-sm hover:shadow transition-shadow">
                    <p className="text-[13.5px] font-semibold text-[var(--color-text)]">{W.breachTitle(data.breach.guardrail_breaches[0].rule)}</p>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-1">{nameOf(data.breach.user_id)} · {callName(data.breach)} · {day(data.breach.started_at)}</p>
                    <p className="text-xs font-semibold text-[var(--color-accent-deep)] mt-2">{W.reviewCall}</p>
                </Link>
            )}

            {/* ── 1. One skill per rep ── */}
            <div className={CARD}>
                <SectionHead title={W.skillsTitle} sub={W.skillsSub} />
                <div className="divide-y divide-[var(--color-line-soft)]">
                    {reps.map(s => {
                        const name = nameOf(s.userId)
                        return (
                            <div key={s.userId} className="flex flex-col sm:flex-row sm:items-start gap-3 py-3.5 first:pt-0 last:pb-0">
                                <div className="flex items-center gap-2.5 sm:w-44 shrink-0 min-w-0">
                                    <Initials name={name} />
                                    <span className="min-w-0">
                                        <Link href={`/team/${s.userId}` as Route} className="block text-[13px] font-semibold text-[var(--color-text)] truncate hover:text-[var(--color-accent-deep)]">{name}</Link>
                                        <span className="block text-[11px] text-[var(--color-muted)]">{t.home.nCalls(s.calls)}</span>
                                    </span>
                                </div>
                                <div className="min-w-0 flex-1">
                                    {s.card && s.headline ? (<>
                                        <p className="text-[14px] font-semibold text-[var(--color-text)] leading-snug">{s.headline}</p>
                                        {s.detail && <p className="text-[12.5px] text-[var(--color-text-secondary)] mt-1 line-clamp-2" title={s.detail}>{s.detail}</p>}
                                        <p className="text-[11.5px] text-[var(--color-muted)] mt-1.5 truncate">{W.fromCall(callName(s.card), day(s.card.started_at))}</p>
                                        <div className="flex flex-wrap items-center gap-3 mt-2">
                                            <Link href={momentHref(s.card.id, s.moment) as Route} className={LINK}>
                                                {s.moment ? W.seeMoment : W.openCall}
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" /></svg>
                                            </Link>
                                            <Link href={practiceHref({ assignee: s.userId, note: s.headline, from: s.card.id }) as Route} className={BTN}>
                                                {W.assignPractice}
                                            </Link>
                                        </div>
                                    </>) : (
                                        <p className="text-[13px] text-[var(--color-text-secondary)]">{W.noGrowth}</p>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
                {data.idleReps.length > 0 && (
                    <p className="text-xs text-[var(--color-muted)] mt-3 pt-3 border-t border-[var(--color-line-soft)]">
                        {W.noCallsReps(data.idleReps.join(", "))}
                    </p>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                {/* ── 2. Objections the team loses most ── */}
                <div className={CARD}>
                    <SectionHead title={W.objTitle} sub={W.objSub} />
                    {data.objections.length === 0 ? (
                        <p className="text-[13px] text-[var(--color-text-secondary)]">{W.objNone}</p>
                    ) : (
                        <ul className="divide-y divide-[var(--color-line-soft)]">
                            {data.objections.slice(0, 5).map(o => {
                                // One rep lost it every time: the practice is theirs.
                                const onlyRep = o.reps.size === 1 ? Array.from(o.reps)[0] : null
                                return (
                                    <li key={o.key} className="py-3 first:pt-0 last:pb-0">
                                        <p className="text-[13.5px] font-semibold text-[var(--color-text)] leading-snug">&ldquo;{o.text}&rdquo;</p>
                                        <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                                            {W.objLost(o.lost, o.raised)}
                                            {onlyRep ? ` · ${nameOf(onlyRep)}` : ""}
                                            {o.fromLibrary && <span className="ml-1.5 text-[10.5px] font-medium px-1.5 py-0.5 rounded-md bg-[var(--color-accent-subtle)] text-[var(--color-accent-deep)]">{W.objLibrary}</span>}
                                        </p>
                                        <div className="flex flex-wrap items-center gap-3 mt-2">
                                            <Link href={momentHref(o.latest.scorecardId, o.latest.ts) as Route} className={LINK}>
                                                {W.seeLatest}
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" /></svg>
                                            </Link>
                                            <Link href={practiceHref({ assignee: onlyRep, note: W.objPracticeNote(o.text), from: o.latest.scorecardId }) as Route} className={BTN}>
                                                {W.assignPractice}
                                            </Link>
                                        </div>
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </div>

                {/* ── 3. Calls with no next step ── */}
                <div className={CARD}>
                    <SectionHead title={W.nextTitle} sub={W.nextSub} />
                    {data.noNextStep.length === 0 ? (
                        <p className="text-[13px] text-[var(--color-text-secondary)]">
                            {data.nextChecked > 0 ? W.nextNone(data.nextChecked) : W.nextNoneChecked}
                        </p>
                    ) : (
                        <ul className="divide-y divide-[var(--color-line-soft)]">
                            {data.noNextStep.slice(0, 6).map(n => (
                                <li key={n.card.id} className="py-3 first:pt-0 last:pb-0">
                                    <p className="text-[13.5px] font-semibold text-[var(--color-text)] leading-snug truncate" title={callName(n.card)}>{callName(n.card)}</p>
                                    <p className="text-xs text-[var(--color-muted)] mt-0.5">{nameOf(n.card.user_id)} · {day(n.card.started_at)} · {W.nextStage(n.stageName)}</p>
                                    {n.missed.length > 0 && (
                                        <p className="text-xs text-amber-700 mt-1 line-clamp-2">{W.nextMissing(n.missed.slice(0, 3).join(", "))}</p>
                                    )}
                                    <div className="flex flex-wrap items-center gap-3 mt-2">
                                        <Link href={momentHref(n.card.id, n.moment) as Route} className={LINK}>
                                            {n.moment === "end" ? W.seeEnding : W.seeMoment}
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" /></svg>
                                        </Link>
                                        <Link href={practiceHref({ assignee: n.card.user_id, note: W.nextPracticeNote, from: n.card.id }) as Route} className={BTN}>
                                            {W.assignPractice}
                                        </Link>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </section>
    )
}
