"use client"

import Link from "next/link"
import type { Route } from "next"
import { useState } from "react"
import { useT } from "@/i18n/LocaleProvider"

/// The first-run life of the Home page (D-175, reshaped). A brand-new org
/// spends its whole trial with an empty dashboard, which is exactly when the
/// product is being judged. The old shape stacked TWO task-looking cards
/// (checklist + waiting room) whenever an org was set up but call-less — it
/// read as "here's more homework" twice over. Now Home has ONE first-run
/// surface, HomeSetupCard, with two halves:
///
///   - the checklist  — only steps the owner can do with their own hands;
///     rep-side outcomes (joining, making the first call) are NOT tasks here.
///   - a status strip — the value the dashboard already provides at zero:
///     "no coaching sessions to review", "no guardrail breaches", who's in.
///
/// The checklist half retires itself the moment every item is done; the
/// status half retires itself the moment real scorecards exist.

// ── Loading skeleton (replaces the bare "Loading…" text everywhere) ─────────

export function PageSkeleton({ rows = 3 }: { rows?: number }) {
    const t = useT()
    return (
        <div className="space-y-4 animate-pulse" aria-label={t.homeStates.loadingAria} role="status">
            <div className="h-7 w-48 rounded-lg bg-[var(--color-line-soft)]" />
            <div className="h-4 w-72 rounded bg-[var(--color-line-soft)]" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-20 rounded-xl bg-[var(--color-line-soft)]" />
                ))}
            </div>
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="h-32 rounded-xl bg-[var(--color-line-soft)]" />
            ))}
        </div>
    )
}

// ── State 1: setup checklist ────────────────────────────────────────────────

export interface SetupState {
    activePlaybooks: number
    objections: number
    knowledge: number
    voiceSet: boolean
    /// Activation, as distinct from configuration. The content half of this
    /// checklist self-satisfies the moment the /start wizard applies a starter
    /// kit, so an owner who finished the wizard saw a checklist that was
    /// already done and no next step at all — while the workspace still had
    /// nobody in it and no call ever scored.
    members: number
    pendingInvites: number
    scoredCalls: number
}

export type SetupCheckKey =
    | "playbook" | "objections" | "voice" | "knowledge" | "invite"

export interface SetupCheck {
    key: SetupCheckKey; done: boolean; required: boolean
    href: Route
}

/// Label/hint copy lives in the dictionaries (t.homeStates.checks[key]) so
/// this stays a pure-logic helper usable outside React render.
/// Every check must be something the owner can complete alone — a checkbox
/// nobody at the keyboard can tick ("a rep joins", "first call scored") is a
/// permanent reproach, not a task, so those live in the status strip instead.
export function setupChecks(r: SetupState): SetupCheck[] {
    return [
        { key: "playbook",   done: r.activePlaybooks >= 1, required: true,  href: "/playbook?tab=playbooks" as Route },
        { key: "objections", done: r.objections >= 3,      required: true,  href: "/playbook?tab=objections" as Route },
        { key: "voice",      done: r.voiceSet,             required: false, href: "/playbook?tab=voice" as Route },
        { key: "knowledge",  done: r.knowledge >= 1,       required: false, href: "/playbook?tab=knowledge" as Route },
        // A sent invite counts: the owner did their part, and the rest is the
        // invitee's move.
        { key: "invite",     done: r.members > 1 || r.pendingInvites > 0, required: true, href: "/team?tab=members" as Route },
    ]
}

export function setupRequiredMet(r: SetupState): boolean {
    return setupChecks(r).filter(c => c.required).every(c => c.done)
}

/// One card, two halves. The checklist half auto-retires once EVERY item is
/// done (no dismissal needed — a finished list has nothing left to say); the
/// X, which appears once the required bar is met, lets an owner hide it
/// earlier, per browser, via localStorage keyed by org (D-217's escape hatch
/// kept, its "stays until dismissed" rule dropped). The status half shows
/// what the dashboard is already doing at zero — a clear coaching queue and a
/// clean guardrail record are findings, not absences — and retires once real
/// scorecards exist and the live dashboard takes over.
export function HomeSetupCard({ state, orgId, hasCards }: { state: SetupState; orgId: string; hasCards: boolean }) {
    const t = useT()
    const storageKey = `tp-setup-checklist-dismissed-${orgId}`
    const [dismissed, setDismissed] = useState(() => {
        try { return localStorage.getItem(storageKey) === "1" } catch { return false }
    })
    const checks = setupChecks(state)
    const done = checks.filter(c => c.done).length
    const allDone = done === checks.length
    const requiredMet = setupRequiredMet(state)
    const showChecklist = !allDone && !dismissed
    const showStatus = !hasCards
    if (!showChecklist && !showStatus) return null

    const status: { ok: boolean; label: string; sub: string }[] = [
        { ok: true, label: t.homeStates.statusCoachingClear, sub: t.homeStates.statusCoachingClearSub },
        { ok: true, label: t.homeStates.statusNoBreaches,    sub: t.homeStates.statusNoBreachesSub },
        { ok: state.members > 1,
          label: t.homeStates.statusTeam(state.members, state.pendingInvites),
          sub: t.homeStates.statusTeamSub },
    ]

    return (
        <div className={`bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6 shadow-sm ${showChecklist && showStatus ? "max-w-4xl" : "max-w-2xl"}`}>
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="font-display text-lg font-bold text-[var(--color-text)]">
                        {showChecklist ? t.homeStates.setupTitle : t.homeStates.readyTitle}
                    </h2>
                    <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                        {showChecklist ? t.homeStates.setupSub : t.homeStates.readySub}
                    </p>
                </div>
                {showChecklist && (
                    <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-xs text-[var(--color-accent-deep)] bg-[var(--color-accent-subtle)] rounded-full px-2.5 py-1">{done}/{checks.length}</span>
                        {requiredMet && (
                            <button
                                onClick={() => { try { localStorage.setItem(storageKey, "1") } catch {} ; setDismissed(true) }}
                                aria-label={t.homeStates.dismissChecklist}
                                title={t.homeStates.dismissChecklist}
                                className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-hover)] transition-colors"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>
                )}
            </div>

            <div className={`mt-5 grid gap-8 ${showChecklist && showStatus ? "md:grid-cols-2" : "grid-cols-1"}`}>
                {showChecklist && (
                    <div className="space-y-3">
                        {checks.map(c => (
                            <div key={c.key} className="flex items-start gap-3">
                                <span className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                    c.done ? "bg-emerald-500 text-white"
                                           : c.required ? "bg-amber-100 text-amber-600 border border-amber-300"
                                                        : "bg-[var(--color-line-soft)] text-[var(--color-muted)] border border-[var(--color-border)]"
                                }`}>{c.done ? "✓" : ""}</span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-sm ${c.done ? "text-[var(--color-muted)] line-through" : "text-[var(--color-text)] font-medium"}`}>{t.homeStates.checks[c.key].label}</span>
                                        {!c.done && (c.required
                                            ? <span className="text-[10px] uppercase tracking-wide text-amber-600 font-semibold">{t.homeStates.required}</span>
                                            : <span className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] font-semibold">{t.homeStates.recommended}</span>)}
                                    </div>
                                    {!c.done && <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{t.homeStates.checks[c.key].hint}</p>}
                                </div>
                                {!c.done && (
                                    <Link href={c.href} className="flex-shrink-0 text-xs font-semibold text-[var(--color-accent-deep)] hover:underline mt-0.5">
                                        {t.homeStates.setUp}
                                    </Link>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {showStatus && (
                    <div className={showChecklist ? "md:border-l md:border-[var(--color-line-soft)] md:pl-8" : ""}>
                        {showChecklist && (
                            <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)] font-semibold mb-3">{t.homeStates.statusToday}</p>
                        )}
                        <div className="space-y-3.5">
                            {status.map((s, i) => (
                                <div key={i} className="flex items-start gap-3">
                                    <span className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                        s.ok ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                                             : "bg-[var(--color-line-soft)] text-[var(--color-muted)] border border-[var(--color-border)]"
                                    }`}>{s.ok ? "✓" : "·"}</span>
                                    <div>
                                        <p className="text-sm font-medium text-[var(--color-text)]">{s.label}</p>
                                        <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{s.sub}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-[var(--color-muted)] mt-4">{t.homeStates.statusScorecardsSub}</p>
                        {!showChecklist && (
                            <div className="flex gap-3 mt-5">
                                <Link href={"/team?tab=members" as Route}
                                    className="px-4 py-2 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] text-[var(--btn-ink)] text-sm font-semibold rounded-lg transition-colors">
                                    {t.homeStates.inviteMoreReps}
                                </Link>
                                <Link href={"/playbook" as Route}
                                    className="px-4 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-muted)] text-sm font-medium text-[var(--color-text)] rounded-lg transition-colors">
                                    {t.homeStates.reviewPlaybook}
                                </Link>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
