"use client"

import Link from "next/link"
import type { Route } from "next"

/// The three lives of the Home page (D-175). A brand-new org spends its whole
/// trial with an empty dashboard, which is exactly when the product is being
/// judged — so Home owns three explicit states instead of rendering dead panels:
///
///   1. Setup   — required brain pieces missing → the checklist IS the page.
///   2. Waiting — set up, nobody has made a call yet → say what happens next.
///   3. Live    — scored calls exist → the real dashboard.

// ── Loading skeleton (replaces the bare "Loading…" text everywhere) ─────────

export function PageSkeleton({ rows = 3 }: { rows?: number }) {
    return (
        <div className="space-y-4 animate-pulse" aria-label="Loading" role="status">
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
}

export interface SetupCheck {
    key: string; label: string; done: boolean; required: boolean
    href: Route; hint: string
}

export function setupChecks(r: SetupState): SetupCheck[] {
    return [
        { key: "playbook",   label: "Activate a playbook",            done: r.activePlaybooks >= 1, required: true,
          href: "/playbook?tab=playbooks" as Route,  hint: "Reps are guided through its stages live and scored against it after." },
        { key: "objections", label: "Add at least 3 objections",      done: r.objections >= 3,      required: true,
          href: "/playbook?tab=objections" as Route, hint: "So the AI can hand reps your approved answer while the pushback is still in the air." },
        { key: "voice",      label: "Set your company voice",         done: r.voiceSet,             required: false,
          href: "/playbook?tab=voice" as Route,      hint: "Keeps every rep on-brand in live suggestions." },
        { key: "knowledge",  label: "Upload a knowledge document",    done: r.knowledge >= 1,      required: false,
          href: "/playbook?tab=knowledge" as Route,  hint: "Grounds answers in your real pricing, battlecards and case studies." },
    ]
}

export function setupRequiredMet(r: SetupState): boolean {
    return setupChecks(r).filter(c => c.required).every(c => c.done)
}

export function SetupChecklistCard({ state }: { state: SetupState }) {
    const checks = setupChecks(state)
    const done = checks.filter(c => c.done).length
    return (
        <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6 shadow-sm max-w-2xl">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="font-display text-lg font-bold text-[var(--color-text)]">Set up your coaching brain</h2>
                    <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                        This is what your reps get coached from on every call. Two required steps, ~3 minutes —
                        then this card gets out of your way for good.
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
                                <span className={`text-sm ${c.done ? "text-[var(--color-muted)] line-through" : "text-[var(--color-text)] font-medium"}`}>{c.label}</span>
                                {!c.done && (c.required
                                    ? <span className="text-[10px] uppercase tracking-wide text-amber-600 font-semibold">Required</span>
                                    : <span className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] font-semibold">Recommended</span>)}
                            </div>
                            {!c.done && <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{c.hint}</p>}
                        </div>
                        {!c.done && (
                            <Link href={c.href} className="flex-shrink-0 text-xs font-semibold text-[var(--color-accent-deep)] hover:underline mt-0.5">
                                Set up →
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
    const steps: [string, string, string][] = [
        ["1", "Reps install TalkPilot", "Mac, iPhone or Android — they sign in and they're in your workspace."],
        ["2", "Their next call gets coached live", "Guided through your playbook stages, with your approved objection answers on tap."],
        ["3", "The scorecard lands here", "Minutes after the call ends — this page becomes your team's live dashboard."],
    ]
    return (
        <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6 shadow-sm max-w-2xl">
            <h2 className="font-display text-lg font-bold text-[var(--color-text)]">Your brain is live — waiting on the first call</h2>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                {activeMembers} {activeMembers === 1 ? "person is" : "people are"} in your workspace
                {pendingInvites > 0 && <>, <Link href={"/team?tab=members" as Route} className="text-[var(--color-accent-deep)] font-medium hover:underline">{pendingInvites} invite{pendingInvites === 1 ? "" : "s"} still pending</Link></>}.
                Nothing is broken — scorecards simply don&apos;t exist until someone makes a call.
            </p>
            <div className="space-y-4 mt-5">
                {steps.map(([n, title, sub]) => (
                    <div key={n} className="flex gap-3">
                        <span className="w-6 h-6 rounded-full bg-[var(--color-accent-subtle)] text-[var(--color-accent-deep)] font-mono text-[11px] flex items-center justify-center shrink-0 mt-0.5">{n}</span>
                        <div>
                            <p className="text-sm font-semibold text-[var(--color-text)]">{title}</p>
                            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{sub}</p>
                        </div>
                    </div>
                ))}
            </div>
            <div className="flex gap-3 mt-6">
                <Link href={"/team?tab=members" as Route}
                    className="px-4 py-2 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] text-[var(--btn-ink)] text-sm font-semibold rounded-lg transition-colors">
                    Invite more reps
                </Link>
                <Link href={"/playbook" as Route}
                    className="px-4 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-muted)] text-sm font-medium text-[var(--color-text)] rounded-lg transition-colors">
                    Review the playbook
                </Link>
            </div>
        </div>
    )
}
