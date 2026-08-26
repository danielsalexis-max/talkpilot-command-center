"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { starterKitsFor, applyStarterKit, type StarterKit } from "@/lib/starterKit"
import { isPersonalEmail } from "@/lib/workEmail"
import { useT, useLocale } from "@/i18n/LocaleProvider"
import type { Dict } from "@/i18n"

/// /start — self-serve Teams onboarding (D-163).
/// account → workspace → coaching brain → invite → live.
/// 14-day full trial, no card. The right-hand panel shows what reps actually
/// get — the product sells itself while the owner types.

type Step = "account" | "workspace" | "brain" | "invite" | "done"
const STEPS: Step[] = ["account", "workspace", "brain", "invite", "done"]

const INPUT = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3.5 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
const BTN = "w-full py-2.5 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] disabled:opacity-40 text-[var(--btn-ink)] text-sm font-semibold rounded-lg transition-colors"
const BTN_GHOST = "w-full py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-muted)] text-sm font-medium text-[var(--color-text)] rounded-lg transition-colors"

// The work-email rule and its domain list live in one place now — the login
// page needed the same check, and three copies of a list like this is how they
// drift. `create-org` keeps its own copy on purpose: it is the server-side
// backstop and must refuse regardless of what any client believes (D-171).

// The Teams plan tops out at 20 seats (mirrored in create-org and org-billing).
// Beyond that it's an Enterprise conversation — the stepper stops here and
// shows the "talk to us" pointer instead of letting the number climb.
const TEAM_SEAT_CAP = 20

/// Where "talk to us first" goes. The website's Teams button points here too
/// (D-192 #8) — teams.talkpilot.co keeps working for whoever lands on it
/// directly, but the default motion is a conversation.
const DEMO_URL = "https://talkpilot.co/demo"

/// Starter-kit content is seeded into the org's playbook in English (the
/// coaching data itself is not localized yet) — but the /start cards show the
/// localized title/tagline so a LATAM prospect reads them in their language.
function kitDisplay(t: Dict, kit: StarterKit): { title: string; tagline: string } {
    return t.start.kits[kit.key] ?? { title: kit.title, tagline: kit.tagline }
}

async function callFn(name: string, body: unknown) {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${name}`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json?.error?.message ?? `Request failed (${res.status})`)
    return json
}

// ─── The right-hand showcase: what your reps actually see ────────────────────

function HudSlide({ t }: { t: Dict }) {
    return (
        <div className="w-full max-w-[360px] rounded-2xl bg-[#1A263D] border border-white/10 p-4 shadow-2xl">
            <div className="flex items-center gap-2 font-mono text-[9.5px] tracking-[0.12em] text-[#94A2AB]">
                <span className="w-2 h-2 rounded-full bg-[#3EA48F] animate-pulse" />
                {t.start.hud.liveLine}
                <span className="ml-auto">12:41</span>
            </div>
            <p className="mt-3 text-[15px] leading-snug text-[#EDF2F1] font-medium">
                {t.start.hud.cueMain}<span className="text-[#9CD9C6]">{t.start.hud.cueAccent}</span>
            </p>
            <p className="mt-2 text-[11px] text-[#94A2AB]">{t.start.hud.cueSource}</p>
            <div className="mt-3 flex gap-1.5">
                {t.start.hud.stages.map((s, i) => (
                    <span key={s} className={`h-1 flex-1 rounded-full ${i < 2 ? "bg-[#3EA48F]" : "bg-white/10"}`} />
                ))}
            </div>
        </div>
    )
}

function ScorecardSlide({ t }: { t: Dict }) {
    const rows: [string, number, string][] = [
        [t.start.scorecardSlide.rows.discovery, 92, "#3EA48F"],
        [t.start.scorecardSlide.rows.objections, 84, "#3EA48F"],
        [t.start.scorecardSlide.rows.nextSteps, 61, "#E69F19"],
    ]
    return (
        <div className="w-full max-w-[360px] rounded-2xl bg-[#1A263D] border border-white/10 p-4 shadow-2xl">
            <div className="flex items-center gap-3">
                <span className="w-12 h-12 rounded-full border-[3px] border-[#3EA48F] flex items-center justify-center font-mono text-lg text-[#EDF2F1]">86</span>
                <div>
                    <p className="text-[13px] font-semibold text-[#EDF2F1]">{t.start.scorecardSlide.title}</p>
                    <p className="font-mono text-[9.5px] tracking-wide text-[#94A2AB]">{t.start.scorecardSlide.scoredAgainst}</p>
                </div>
            </div>
            <div className="mt-3 space-y-1.5">
                {rows.map(([label, v, c]) => (
                    <div key={label} className="flex items-center gap-2">
                        <span className="text-[11px] text-[#94A2AB] w-20">{label}</span>
                        <span className="h-1.5 flex-1 rounded-full bg-white/10 overflow-hidden">
                            <span className="block h-full rounded-full" style={{ width: `${v}%`, background: c }} />
                        </span>
                        <span className="font-mono text-[11px] text-[#EDF2F1]">{v}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}

function AuditSlide({ t }: { t: Dict }) {
    return (
        <div className="w-full max-w-[360px] rounded-2xl bg-[#1A263D] border border-white/10 p-4 shadow-2xl space-y-2.5">
            <p className="font-mono text-[9.5px] tracking-[0.12em] text-[#94A2AB]">{t.start.auditSlide.header}</p>
            <div className="flex items-start gap-2">
                <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-[#14311F] text-[#6FCB84] mt-0.5">{t.start.auditSlide.verified}</span>
                <p className="text-[12.5px] text-[#EDF2F1]">{t.start.auditSlide.claim1} <span className="text-[#94A2AB]">{t.start.auditSlide.claim1Src}</span></p>
            </div>
            <div className="flex items-start gap-2">
                <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-[#3A1818] text-[#F08A8A] mt-0.5">{t.start.auditSlide.contradicts}</span>
                <p className="text-[12.5px] text-[#EDF2F1]">{t.start.auditSlide.claim2} <span className="text-[#94A2AB]">{t.start.auditSlide.claim2Src}</span></p>
            </div>
        </div>
    )
}

function Showcase() {
    const t = useT()
    const [idx, setIdx] = useState(0)
    const slides = [
        { ...t.start.slides[0], node: <HudSlide t={t} /> },
        { ...t.start.slides[1], node: <ScorecardSlide t={t} /> },
        { ...t.start.slides[2], node: <AuditSlide t={t} /> },
    ]
    useEffect(() => {
        if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
        const timer = setInterval(() => setIdx(i => (i + 1) % 3), 6000)
        return () => clearInterval(timer)
    }, [])
    const slide = slides[idx]
    return (
        <div className="hidden lg:flex flex-col items-center justify-center flex-1 bg-[#0A1220] px-10 py-12 relative overflow-hidden">
            <div className="absolute inset-0 opacity-40" style={{ background: "radial-gradient(ellipse 60% 50% at 50% 40%, rgba(12,148,130,0.25), transparent)" }} />
            <div className="relative flex flex-col items-center text-center max-w-md">
                {slide.node}
                <h2 className="font-display text-[22px] font-bold text-[#EDF2F1] mt-8 leading-tight" style={{ textWrap: "balance" }}>{slide.caption}</h2>
                <p className="text-[13.5px] text-[#94A2AB] mt-2 leading-relaxed">{slide.sub}</p>
                <div className="flex gap-2 mt-6">
                    {slides.map((_, i) => (
                        <button key={i} onClick={() => setIdx(i)} aria-label={t.start.slideAria(i + 1)}
                            className={`w-2 h-2 rounded-full transition-colors ${i === idx ? "bg-[#3EA48F]" : "bg-white/20 hover:bg-white/40"}`} />
                    ))}
                </div>
            </div>
            <div className="relative mt-10 flex flex-col items-center gap-1.5">
                <p className="font-mono text-[11px] tracking-[0.16em] text-[#9CD9C6] border border-[#2FB39E]/40 rounded-full px-4 py-1.5">{t.start.coachUp}</p>
                <p className="font-mono text-[9.5px] tracking-[0.12em] text-[#5A6B7D]">{t.start.repsSeeOwn}</p>
            </div>
        </div>
    )
}

// ─── The wizard ──────────────────────────────────────────────────────────────

export default function StartPage() {
    const router = useRouter()
    const { locale, t } = useLocale()
    // The kit BODY (stage text, guardrail keywords, objections) is inserted
    // into the org's database as their real playbook, so it follows the
    // locale the owner is signing up in — not just the labels on screen.
    // An English guardrail keyword can never match a Spanish call (D-177).
    const kits = starterKitsFor(locale)
    const [step, setStep]         = useState<Step>("account")
    const [checking, setChecking] = useState(true)
    const [busy, setBusy]         = useState(false)
    const [error, setError]       = useState<string | null>(null)

    const [mode, setMode]         = useState<"signup" | "signin">("signup")
    const [email, setEmail]       = useState("")
    const [password, setPassword] = useState("")

    const [orgName, setOrgName]   = useState("")
    const [seats, setSeats]       = useState(5)
    const [orgId, setOrgId]       = useState<string | null>(null)
    /// Whether a sales-granted trial was claimed at workspace creation (D-192).
    /// False is the normal path now: the wizard ends at checkout.
    const [hasTrial, setHasTrial] = useState(false)
    const [checkoutBusy, setCheckoutBusy] = useState(false)

    const [teamType, setTeamType]     = useState<"sales" | "support">("sales")
    const [kitApplied, setKitApplied] = useState<string | null>(null)
    const [wantsDna, setWantsDna]     = useState(false)
    const [invites, setInvites]       = useState<string[]>(["", "", ""])
    const [inviteNote, setInviteNote] = useState<string | null>(null)
    const doneRef = useRef(false)

    // Signed-in users skip the account step; users already in an org go home.
    const routeForUser = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setChecking(false); return }
        const { data: member } = await supabase.from("org_members")
            .select("org_id").eq("user_id", user.id).eq("status", "active").maybeSingle()
        if (member && !doneRef.current) { router.replace("/"); return }
        setEmail(user.email ?? "")
        setStep(s => (s === "account" ? "workspace" : s))
        setChecking(false)
    }, [router])

    useEffect(() => { routeForUser() }, [routeForUser])

    async function handleAccount(e: React.FormEvent) {
        e.preventDefault(); setError(null)
        // The account that will OWN the workspace must be a company address
        // (D-171). Saying so here — before the account even exists — instead of
        // one screen later, after signup already went through (P0, e2e 2026-08-25).
        if (mode === "signup" && isPersonalEmail(email)) {
            setError(t.start.personalEmailError)
            return
        }
        setBusy(true)
        try {
            if (mode === "signup") {
                const { error: err } = await supabase.auth.signUp({ email, password })
                if (err) throw err
            } else {
                const { error: err } = await supabase.auth.signInWithPassword({ email, password })
                if (err) throw err
            }
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) { setError(t.start.confirmEmailFirst); return }
            const { data: member } = await supabase.from("org_members")
                .select("org_id").eq("user_id", user.id).eq("status", "active").maybeSingle()
            if (member) { router.replace("/"); return }
            setStep("workspace")
        } catch (e) {
            setError((e as Error).message)
        } finally {
            setBusy(false)
        }
    }

    async function handleGoogle() {
        setError(null)
        await supabase.auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo: `${window.location.origin}/start` },
        })
    }

    // No Calendars.Read here on purpose — the panel is an admin surface that
    // never reads a calendar; that scope belongs to the rep apps (D-187).
    async function handleMicrosoft() {
        setError(null)
        await supabase.auth.signInWithOAuth({
            provider: "azure",
            options: { scopes: "openid profile email", redirectTo: `${window.location.origin}/start` },
        })
    }

    // OAuth identities land back here already signed in, so the personal-domain
    // check can't run before the account exists the way it does for the email
    // form. The recovery path is a real one: sign out and start over.
    async function switchAccount() {
        await supabase.auth.signOut()
        setEmail(""); setPassword(""); setError(null)
        setStep("account")
    }

    async function handleWorkspace(e: React.FormEvent) {
        e.preventDefault(); setError(null)
        if (isPersonalEmail(email)) {
            setError(t.start.personalEmailError)
            return
        }
        setBusy(true)
        try {
            const res = await callFn("create-org", { name: orgName, seats })
            setOrgId(res.org_id)
            // A null trial_ends_at means no grant matched, which since D-192 is
            // the DEFAULT: this workspace pays before it is used. Keep building
            // the brain either way — a half-configured workspace is worthless
            // to them and to us — but the final step becomes checkout.
            setHasTrial(!!res.trial_ends_at)
            setStep("brain")
        } catch (e) {
            const msg = (e as Error).message
            if (msg.includes("already part")) { router.replace("/"); return }
            setError(msg)
        } finally {
            setBusy(false)
        }
    }

    async function startCheckout() {
        if (!orgId) return
        setCheckoutBusy(true); setError(null)
        try {
            const res = await callFn("org-billing", { org_id: orgId, action: "checkout", interval: "month" })
            if (res?.url) { window.location.href = res.url as string; return }
            setError(t.start.checkoutFailed)
        } catch (e) {
            setError((e as Error).message)
        } finally {
            setCheckoutBusy(false)
        }
    }

    async function handleKit(kit: StarterKit) {
        if (!orgId) return
        setError(null); setBusy(true)
        const err = await applyStarterKit(orgId, kit)
        setBusy(false)
        if (err) { setError(err); return }
        setKitApplied(kitDisplay(t, kit).title)
        setStep("invite")
    }

    async function handleInvites(e: React.FormEvent) {
        e.preventDefault(); setError(null); setBusy(true)
        const emails = invites.map(v => v.trim()).filter(Boolean)
        let sent = 0, failed = 0
        for (const em of emails) {
            try { await callFn("invite-member", { org_id: orgId, email: em, role: "member" }); sent++ }
            catch { failed++ }
        }
        setBusy(false)
        setInviteNote(sent ? t.start.inviteNote(sent, failed) : null)
        doneRef.current = true
        setStep("done")
    }

    const stepIdx = STEPS.indexOf(step)

    if (checking) return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] text-sm text-[var(--color-muted)]">{t.common.loading}</div>
    )

    return (
        <div className="min-h-screen flex bg-[var(--color-bg)]">
            {/* ── Left: the wizard ── */}
            <div className="flex-1 flex justify-center px-6 sm:px-10 lg:px-14 py-8 lg:py-12">
                <div className="w-full max-w-[440px] flex flex-col">
                <div className="flex items-center gap-2.5 mb-10">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/brand-mark.png" alt="" className="w-8 h-8 object-contain" />
                    <span className="font-display font-bold text-[15px] text-[var(--color-text)]">TalkPilot <span className="text-[var(--color-accent)]">Teams</span></span>
                </div>

                {/* Progress */}
                <div className="flex items-center gap-1.5 mb-8" aria-label={t.start.stepOf(stepIdx + 1, STEPS.length)}>
                    {STEPS.map((s, i) => (
                        <div key={s} className="flex-1">
                            <div className={`h-1 rounded-full ${i <= stepIdx ? "bg-[var(--color-accent)]" : "bg-[var(--color-line-soft)]"}`} />
                            <p className={`mt-1.5 text-[10px] font-medium hidden sm:block ${i === stepIdx ? "text-[var(--color-accent-deep)]" : "text-[var(--color-muted)]"}`}>{t.start.stepLabels[s]}</p>
                        </div>
                    ))}
                </div>

                <div className="flex-1 flex flex-col justify-center">
                    {step === "account" && (
                        <div>
                            <h1 className="font-display text-[26px] font-extrabold text-[var(--color-text)] leading-tight" style={{ textWrap: "balance" }}>
                                {t.start.accountTitle}
                            </h1>
                            <p className="text-sm text-[var(--color-text-secondary)] mt-2">
                                {t.start.accountSub}
                                <span className="font-semibold text-[var(--color-text)] whitespace-nowrap"> {t.start.accountFree}</span>
                            </p>
                            <form onSubmit={handleAccount} className="space-y-3 mt-7">
                                <input type="email" required placeholder={t.common.workEmail} className={INPUT}
                                    value={email} onChange={e => setEmail(e.target.value)} />
                                {mode === "signup" && isPersonalEmail(email) && (
                                    <p className="text-xs text-amber-700">{t.start.personalEmailError}</p>
                                )}
                                <input type="password" required minLength={8} placeholder={mode === "signup" ? t.start.choosePassword : t.common.password}
                                    className={INPUT} value={password} onChange={e => setPassword(e.target.value)} />
                                {error && <p className="text-xs text-red-600">{error}</p>}
                                <button type="submit" disabled={busy} className={BTN}>
                                    {busy ? t.common.oneMoment : mode === "signup" ? t.start.createAndContinue : t.start.signInAndContinue}
                                </button>
                            </form>
                            <div className="flex items-center gap-3 my-4">
                                <span className="h-px flex-1 bg-[var(--color-border)]" /><span className="text-[11px] text-[var(--color-muted)]">{t.common.or}</span><span className="h-px flex-1 bg-[var(--color-border)]" />
                            </div>
                            <button onClick={handleGoogle} className={BTN_GHOST + " flex items-center justify-center gap-2.5"}>
                                <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.4 28.7a14.5 14.5 0 0 1 0-9.4l-7.8-6.1a24 24 0 0 0 0 21.6l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.5-5.8c-2.1 1.4-4.7 2.3-7.7 2.3-6.3 0-11.7-3.7-13.6-9l-7.8 6.1C6.6 42.6 14.6 48 24 48z"/></svg>
                                {t.common.continueWithGoogle}
                            </button>
                            <button onClick={handleMicrosoft} className={BTN_GHOST + " flex items-center justify-center gap-2.5 mt-2"}>
                                <svg width="16" height="16" viewBox="0 0 23 23" aria-hidden="true"><path fill="#F25022" d="M0 0h11v11H0z"/><path fill="#7FBA00" d="M12 0h11v11H12z"/><path fill="#00A4EF" d="M0 12h11v11H0z"/><path fill="#FFB900" d="M12 12h11v11H12z"/></svg>
                                {t.common.continueWithMicrosoft}
                            </button>
                            <p className="text-center text-xs text-[var(--color-muted)] mt-4">
                                {mode === "signup" ? t.start.alreadyHaveAccount : t.start.newHere}
                                <button onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(null) }}
                                    className="text-[var(--color-accent-deep)] font-medium hover:underline">
                                    {mode === "signup" ? t.common.signIn : t.common.createOne}
                                </button>
                            </p>
                        </div>
                    )}

                    {step === "workspace" && (
                        <div>
                            <h1 className="font-display text-[26px] font-extrabold text-[var(--color-text)] leading-tight">{t.start.workspaceTitle}</h1>
                            <p className="text-sm text-[var(--color-text-secondary)] mt-2">{t.start.workspaceSub}</p>
                            {/* OAuth arrivals skip the account form, so a personal Google/
                                Microsoft identity is only catchable here — say it now, with
                                a way out, instead of on submit. */}
                            {isPersonalEmail(email) && (
                                <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
                                    <p className="text-xs text-amber-900">{t.start.personalEmailError}</p>
                                    <button onClick={switchAccount} className="mt-1.5 text-xs font-semibold text-amber-900 underline">
                                        {t.start.useAnotherAccount}
                                    </button>
                                </div>
                            )}
                            <form onSubmit={handleWorkspace} className="space-y-4 mt-7">
                                <div>
                                    <label className="text-xs font-medium text-[var(--color-text-secondary)]">{t.start.companyName}</label>
                                    <input required minLength={2} maxLength={80} placeholder={t.start.companyPlaceholder} className={INPUT + " mt-1.5"}
                                        value={orgName} onChange={e => setOrgName(e.target.value)} />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-[var(--color-text-secondary)]">{t.start.seatsLabel}</label>
                                    <div className="flex items-center gap-3 mt-1.5">
                                        <button type="button" aria-label={t.start.fewerSeats} onClick={() => setSeats(s => Math.max(3, s - 1))}
                                            className="w-9 h-9 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-muted)]">−</button>
                                        <span className="font-mono text-lg text-[var(--color-text)] w-10 text-center">{seats}</span>
                                        <button type="button" aria-label={t.start.moreSeats} onClick={() => setSeats(s => Math.min(TEAM_SEAT_CAP, s + 1))}
                                            className="w-9 h-9 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-muted)]">+</button>
                                        <span className="text-xs text-[var(--color-muted)]">{t.start.minSeats}</span>
                                    </div>
                                    {seats >= TEAM_SEAT_CAP && (
                                        <p className="text-xs text-[var(--color-text-secondary)] mt-2">
                                            {t.start.seatCapNote}{" "}
                                            <a href="mailto:hello@talkpilot.co?subject=TalkPilot%20Enterprise" className="font-semibold text-[var(--color-accent-deep)] hover:underline">
                                                {t.start.seatCapCta}
                                            </a>
                                        </p>
                                    )}
                                </div>
                                {/* This used to promise "14 days free, no card"
                                    to everyone. Trials are granted by sales now
                                    (D-192 #8), so promising one here would be a
                                    lie for most people who read it. */}
                                <div className="bg-[var(--color-accent-subtle)] rounded-lg px-4 py-3 text-xs text-[var(--color-accent-deep)] leading-relaxed">
                                    <strong>{t.start.pricingBoxTitle}</strong><br />
                                    {t.start.trialBoxSub}
                                </div>
                                {error && <p className="text-xs text-red-600">{error}</p>}
                                <button type="submit" disabled={busy} className={BTN}>{busy ? t.start.creating : t.start.startFreeTrial}</button>
                            </form>
                        </div>
                    )}

                    {step === "brain" && (
                        <div className="max-w-md">
                            <h1 className="font-display text-[26px] font-extrabold text-[var(--color-text)] leading-tight">{t.start.brainTitle}</h1>
                            <p className="text-sm text-[var(--color-text-secondary)] mt-2">
                                {t.start.brainSub1}<em>{t.start.brainSubEm}</em>{t.start.brainSub2}
                            </p>
                            {/* One question, then two compact cards — the per-stage chips made
                                this step read as a wall (D-171). Details live in a single meta
                                line; everything is editable under Playbook afterwards. */}
                            <div className="flex rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] p-1 mt-6 max-w-xs">
                                {([["sales", t.start.teamSales], ["support", t.start.teamSupport]] as const).map(([key, label]) => (
                                    <button key={key} type="button" onClick={() => setTeamType(key)}
                                        className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${
                                            teamType === key
                                                ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent-deep)] font-semibold"
                                                : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                                        }`}>{label}</button>
                                ))}
                            </div>
                            <div className="space-y-3 mt-3">
                                {kits.filter(kit => kit.team === teamType).map(kit => (
                                    <button key={kit.key} disabled={busy} onClick={() => handleKit(kit)}
                                        className="w-full text-left bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-accent-light)] rounded-xl px-4 py-3.5 transition-colors disabled:opacity-50 group">
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm font-semibold text-[var(--color-text)]">{kitDisplay(t, kit).title}</p>
                                            <span className="text-xs font-semibold text-[var(--color-accent-deep)] opacity-0 group-hover:opacity-100 transition-opacity">{t.start.useThis}</span>
                                        </div>
                                        <p className="text-xs text-[var(--color-text-secondary)] mt-1">{kitDisplay(t, kit).tagline}</p>
                                        <p className="text-[10.5px] text-[var(--color-muted)] mt-1.5">
                                            {t.start.kitMeta(kit.stages.length, kit.objections.length)}
                                        </p>
                                    </button>
                                ))}
                                <button disabled={busy} onClick={() => { setWantsDna(true); setStep("invite") }}
                                    className="w-full text-left bg-[var(--color-surface)] border border-dashed border-[var(--color-accent-light)] rounded-xl p-4 transition-colors hover:bg-[var(--color-accent-subtle)] disabled:opacity-50">
                                    <p className="text-sm font-semibold text-[var(--color-accent-deep)] inline-flex items-center gap-1.5">
                                        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] shrink-0" />
                                        {t.start.dnaCard}
                                    </p>
                                    <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                                        {t.start.dnaCardSub}
                                    </p>
                                </button>
                            </div>
                            {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
                            <button onClick={() => setStep("invite")} className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] mt-4">
                                {t.start.skipBrain}
                            </button>
                        </div>
                    )}

                    {step === "invite" && (
                        <div>
                            <h1 className="font-display text-[26px] font-extrabold text-[var(--color-text)] leading-tight">{t.start.inviteTitle}</h1>
                            <p className="text-sm text-[var(--color-text-secondary)] mt-2">
                                {kitApplied
                                    ? <>{t.start.inviteSubWithKit1}<strong>{kitApplied}</strong>{t.start.inviteSubWithKit2}</>
                                    : t.start.inviteSubNoKit}
                            </p>
                            <form onSubmit={handleInvites} className="space-y-3 mt-7">
                                {invites.map((v, i) => (
                                    <input key={i} type="email" placeholder={t.start.invitePlaceholder(i + 1)} className={INPUT}
                                        value={v} onChange={e => setInvites(prev => prev.map((p, j) => j === i ? e.target.value : p))} />
                                ))}
                                <button type="button" onClick={() => setInvites(p => [...p, ""])}
                                    className="text-xs font-medium text-[var(--color-accent-deep)] hover:underline">{t.start.addAnother}</button>
                                {error && <p className="text-xs text-red-600">{error}</p>}
                                <button type="submit" disabled={busy} className={BTN}>
                                    {busy ? t.start.sending : invites.some(v => v.trim()) ? t.start.sendInvitesFinish : t.start.finishSetup}
                                </button>
                            </form>
                            <div className="flex items-center gap-4 mt-4">
                                <button onClick={() => setStep("brain")} className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]">
                                    {t.common.back}
                                </button>
                                <button onClick={() => { doneRef.current = true; setStep("done") }} className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]">
                                    {t.start.skipInvites}
                                </button>
                            </div>
                        </div>
                    )}

                    {step === "done" && (
                        <div className="max-w-md">
                            <div className="w-12 h-12 rounded-full bg-[var(--color-accent-subtle)] flex items-center justify-center">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12.5 10 18 20 6" /></svg>
                            </div>
                            <h1 className="font-display text-[26px] font-extrabold text-[var(--color-text)] leading-tight mt-4">{t.start.doneTitle(orgName || t.start.doneFallbackOrg)}</h1>
                            {inviteNote && <p className="text-xs text-[var(--color-accent-deep)] font-medium mt-1">{inviteNote}</p>}
                            <div className="space-y-4 mt-6">
                                {t.start.doneSteps.map((s, i) => (
                                    <div key={i} className="flex gap-3">
                                        <span className="w-6 h-6 rounded-full bg-[var(--color-accent-subtle)] text-[var(--color-accent-deep)] font-mono text-[11px] flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                                        <div>
                                            <p className="text-sm font-semibold text-[var(--color-text)]">{s.title}</p>
                                            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                                                {i === 1
                                                    ? (kitApplied ? t.start.doneStep2WithKit(kitApplied) : t.start.doneStep2NoKit)
                                                    : s.sub}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {/* No grant, no trial (D-192 #8): the workspace and
                                its playbook are built, and the last step is
                                paying. The demo route stays one click away for
                                anyone who would rather talk first. */}
                            {!hasTrial && (
                                <div className="mt-7 rounded-lg border border-[var(--color-accent-light)] bg-[var(--color-accent-subtle)] px-4 py-3.5 space-y-2">
                                    <p className="text-sm font-semibold text-[var(--color-accent-deep)]">{t.start.payTitle}</p>
                                    <p className="text-xs text-[var(--color-accent-deep)]">{t.start.paySub(seats)}</p>
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        <button onClick={startCheckout} disabled={checkoutBusy} className={BTN + " sm:w-auto px-5"}>
                                            {checkoutBusy ? t.start.openingCheckout : t.start.goToCheckout}
                                        </button>
                                        <a href={DEMO_URL} className={BTN_GHOST + " sm:w-auto px-5 text-center"}>{t.start.bookDemoInstead}</a>
                                    </div>
                                </div>
                            )}

                            <div className="flex flex-col sm:flex-row gap-3 mt-8">
                                <button onClick={() => { window.location.href = wantsDna ? "/playbook?tab=dna" : "/" }} className={BTN + " sm:flex-1"}>
                                    {wantsDna ? t.start.setUpDna : t.start.openCommandCenter}
                                </button>
                                {wantsDna && (
                                    <button onClick={() => { window.location.href = "/" }} className={BTN_GHOST + " sm:flex-1"}>{t.start.commandCenter}</button>
                                )}
                            </div>
                            <p className="text-[11px] text-[var(--color-muted)] mt-5">
                                {t.start.doneFooter1}{" "}
                                <a className="underline" href="https://apps.apple.com/app/id6763953639" target="_blank" rel="noreferrer">{t.start.iphone}</a> · <a className="underline" href="https://talkpilot.co" target="_blank" rel="noreferrer">{t.start.mac}</a>
                            </p>
                        </div>
                    )}
                </div>

                <p className="text-[11px] text-[var(--color-muted)] mt-10">
                    {t.start.alreadyUsing} <Link href="/login" className="text-[var(--color-accent-deep)] hover:underline">{t.common.signIn}</Link>
                    <span className="mx-2">·</span>
                    {t.start.questions} <a href="mailto:alexis@talkpilot.co" className="text-[var(--color-accent-deep)] hover:underline">{t.start.talkToUs}</a>
                </p>
                </div>
            </div>

            <Showcase />
        </div>
    )
}
