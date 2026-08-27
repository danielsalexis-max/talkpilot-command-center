"use client"

import Link from "next/link"
import type { Route } from "next"
import { useT } from "@/i18n/LocaleProvider"

/// The three lives of the Home page (D-175). A brand-new org spends its whole
/// trial with an empty dashboard, which is exactly when the product is being
/// judged — so Home owns three explicit states instead of rendering dead panels:
///
///   1. Setup   — required brain pieces missing → the checklist IS the page.
///   2. Waiting — set up, nobody has made a call yet → say what happens next.
///   3. Live    — scored calls exist → the real dashboard.

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
    | "playbook" | "objections" | "voice" | "knowledge"
    | "invite" | "repJoined" | "firstCall"

export interface SetupCheck {
    key: SetupCheckKey; done: boolean; required: boolean
    href: Route
}

/// Label/hint copy lives in the dictionaries (t.homeStates.checks[key]) so
/// this stays a pure-logic helper usable outside React render.
export function setupChecks(r: SetupState): SetupCheck[] {
    return [
        { key: "playbook",   done: r.activePlaybooks >= 1, required: true,  href: "/playbook?tab=playbooks" as Route },
        { key: "objections", done: r.objections >= 3,      required: true,  href: "/playbook?tab=objections" as Route },
        { key: "voice",      done: r.voiceSet,             required: false, href: "/playbook?tab=voice" as Route },
        { key: "knowledge",  done: r.knowledge >= 1,       required: false, href: "/playbook?tab=knowledge" as Route },
        // A sent invite counts: the owner did their part, and the rest is the
        // invitee's move.
        { key: "invite",     done: r.members > 1 || r.pendingInvites > 0, required: true, href: "/team?tab=members" as Route },
        { key: "repJoined",  done: r.members > 1,          required: false, href: "/team?tab=members" as Route },
        { key: "firstCall",  done: r.scoredCalls > 0,      required: false, href: "/calls" as Route },
    ]
}

export function setupRequiredMet(r: SetupState): boolean {
    return setupChecks(r).filter(c => c.required).every(c => c.done)
}

export function SetupChecklistCard({ state }: { state: SetupState }) {
    const t = useT()
    const checks = setupChecks(state)
    const done = checks.filter(c => c.done).length
    return (
        <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6 shadow-sm max-w-2xl">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="font-display text-lg font-bold text-[var(--color-text)]">{t.homeStates.setupTitle}</h2>
                    <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                        {t.homeStates.setupSub}
                    </p>
                </div>
                <span className="font-mono text-xs text-[var(--color-accent-deep)] bg-[var(--color-accent-subtle)] rounded-full px-2.5 py-1 shrink-0">{done}/{checks.length}</span>
            </div>
            <div className="mt-5 space-y-3">
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
        </div>
    )
}

// ── State 2: waiting room ───────────────────────────────────────────────────

export function WaitingRoomCard({ activeMembers, pendingInvites }: { activeMembers: number; pendingInvites: number }) {
    const t = useT()
    return (
        <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6 shadow-sm max-w-2xl">
            <h2 className="font-display text-lg font-bold text-[var(--color-text)]">{t.homeStates.waitingTitle}</h2>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                {t.homeStates.waitingPeople(activeMembers)}
                {pendingInvites > 0 && <>, <Link href={"/team?tab=members" as Route} className="text-[var(--color-accent-deep)] font-medium hover:underline">{t.homeStates.waitingInvites(pendingInvites)}</Link></>}.{" "}
                {t.homeStates.waitingNothingBroken}
            </p>
            <div className="space-y-4 mt-5">
                {t.homeStates.waitingSteps.map((s, i) => (
                    <div key={i} className="flex gap-3">
                        <span className="w-6 h-6 rounded-full bg-[var(--color-accent-subtle)] text-[var(--color-accent-deep)] font-mono text-[11px] flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                        <div>
                            <p className="text-sm font-semibold text-[var(--color-text)]">{s.title}</p>
                            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{s.sub}</p>
                        </div>
                    </div>
                ))}
            </div>
            <div className="flex gap-3 mt-6">
                <Link href={"/team?tab=members" as Route}
                    className="px-4 py-2 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] text-[var(--btn-ink)] text-sm font-semibold rounded-lg transition-colors">
                    {t.homeStates.inviteMoreReps}
                </Link>
                <Link href={"/playbook" as Route}
                    className="px-4 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-muted)] text-sm font-medium text-[var(--color-text)] rounded-lg transition-colors">
                    {t.homeStates.reviewPlaybook}
                </Link>
            </div>
        </div>
    )
}
