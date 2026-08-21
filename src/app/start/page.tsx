"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { STARTER_KITS, applyStarterKit, type StarterKit } from "@/lib/starterKit"

/// /start — self-serve Teams onboarding (D-163).
/// account → workspace → coaching brain → invite → live.
/// 14-day full trial, no card. The right-hand panel shows what reps actually
/// get — the product sells itself while the owner types.

type Step = "account" | "workspace" | "brain" | "invite" | "done"
const STEPS: Step[] = ["account", "workspace", "brain", "invite", "done"]
const STEP_LABELS: Record<Step, string> = {
    account: "Account", workspace: "Workspace", brain: "Coaching brain", invite: "Your team", done: "Live",
}

const INPUT = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3.5 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
const BTN = "w-full py-2.5 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] disabled:opacity-40 text-[var(--btn-ink)] text-sm font-semibold rounded-lg transition-colors"
const BTN_GHOST = "w-full py-2.5 bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-muted)] text-sm font-medium text-[var(--color-text)] rounded-lg transition-colors"

// Workspace creation wants a company identity behind it (D-171). Sign-IN with a
// personal address stays fine — invited members are whatever address the org
// invited — but the account that OWNS an org should be reachable at the company.
const PERSONAL_DOMAINS = new Set([
    "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com",
    "hotmail.co.uk", "outlook.com", "live.com", "msn.com", "icloud.com", "me.com",
    "mac.com", "aol.com", "proton.me", "protonmail.com", "pm.me", "gmx.com",
    "gmx.de", "mail.com", "yandex.com", "yandex.ru", "zoho.com", "web.de",
])
function isPersonalEmail(email: string): boolean {
    const domain = email.trim().toLowerCase().split("@").pop() ?? ""
    return PERSONAL_DOMAINS.has(domain)
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

function HudSlide() {
    return (
        <div className="w-full max-w-[360px] rounded-2xl bg-[#1A263D] border border-white/10 p-4 shadow-2xl">
            <div className="flex items-center gap-2 font-mono text-[9.5px] tracking-[0.12em] text-[#94A2AB]">
                <span className="w-2 h-2 rounded-full bg-[#3EA48F] animate-pulse" />
                LIVE · DISCOVERY STAGE 2/5
                <span className="ml-auto">12:41</span>
            </div>
            <p className="mt-3 text-[15px] leading-snug text-[#EDF2F1] font-medium">
                They just said budget is tight — anchor on the payback model, <span className="text-[#9CD9C6]">not a discount.</span>
            </p>
            <p className="mt-2 text-[11px] text-[#94A2AB]">From your objection library · “It’s too expensive”</p>
            <div className="mt-3 flex gap-1.5">
                {["Open", "Discovery", "Value", "Objections", "Close"].map((s, i) => (
                    <span key={s} className={`h-1 flex-1 rounded-full ${i < 2 ? "bg-[#3EA48F]" : "bg-white/10"}`} />
                ))}
            </div>
        </div>
    )
}

function ScorecardSlide() {
    return (
        <div className="w-full max-w-[360px] rounded-2xl bg-[#1A263D] border border-white/10 p-4 shadow-2xl">
            <div className="flex items-center gap-3">
                <span className="w-12 h-12 rounded-full border-[3px] border-[#3EA48F] flex items-center justify-center font-mono text-lg text-[#EDF2F1]">86</span>
                <div>
                    <p className="text-[13px] font-semibold text-[#EDF2F1]">Acme Corp — discovery</p>
                    <p className="font-mono text-[9.5px] tracking-wide text-[#94A2AB]">SCORED AGAINST YOUR PLAYBOOK</p>
                </div>
            </div>
            <div className="mt-3 space-y-1.5">
                {[["Discovery", 92, "#3EA48F"], ["Objections", 84, "#3EA48F"], ["Next steps", 61, "#E69F19"]].map(([label, v, c]) => (
                    <div key={label as string} className="flex items-center gap-2">
                        <span className="text-[11px] text-[#94A2AB] w-20">{label}</span>
                        <span className="h-1.5 flex-1 rounded-full bg-white/10 overflow-hidden">
                            <span className="block h-full rounded-full" style={{ width: `${v}%`, background: c as string }} />
                        </span>
                        <span className="font-mono text-[11px] text-[#EDF2F1]">{v}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}

function AuditSlide() {
    return (
        <div className="w-full max-w-[360px] rounded-2xl bg-[#1A263D] border border-white/10 p-4 shadow-2xl space-y-2.5">
            <p className="font-mono text-[9.5px] tracking-[0.12em] text-[#94A2AB]">TRUTH AUDIT · 5 CLAIMS CHECKED</p>
            <div className="flex items-start gap-2">
                <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-[#14311F] text-[#6FCB84] mt-0.5">VERIFIED</span>
                <p className="text-[12.5px] text-[#EDF2F1]">“SOC 2 certified since 2024” <span className="text-[#94A2AB]">· your security doc</span></p>
            </div>
            <div className="flex items-start gap-2">
                <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-[#3A1818] text-[#F08A8A] mt-0.5">CONTRADICTS</span>
                <p className="text-[12.5px] text-[#EDF2F1]">“Guaranteed 40% ROI” <span className="text-[#94A2AB]">· flagged for coaching</span></p>
            </div>
        </div>
    )
}

const SLIDES = [
    { caption: "Your playbook, whispered at the right moment", sub: "Reps hear the approved answer while the objection is still hanging in the air — not in next week's call review.", node: <HudSlide /> },
    { caption: "Every call scored against your playbook", sub: "Not generic AI notes — graded on the stages, questions and guardrails you defined.", node: <ScorecardSlide /> },
    { caption: "Catch drift before your customers do", sub: "Every factual claim is checked against your own docs. What can't be verified gets flagged, not repeated.", node: <AuditSlide /> },
]

function Showcase() {
    const [idx, setIdx] = useState(0)
    useEffect(() => {
        if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
        const t = setInterval(() => setIdx(i => (i + 1) % SLIDES.length), 6000)
        return () => clearInterval(t)
    }, [])
    const slide = SLIDES[idx]
    return (
        <div className="hidden lg:flex flex-col items-center justify-center flex-1 bg-[#0A1220] px-10 py-12 relative overflow-hidden">
            <div className="absolute inset-0 opacity-40" style={{ background: "radial-gradient(ellipse 60% 50% at 50% 40%, rgba(12,148,130,0.25), transparent)" }} />
            <div className="relative flex flex-col items-center text-center max-w-md">
                {slide.node}
                <h2 className="font-display text-[22px] font-bold text-[#EDF2F1] mt-8 leading-tight" style={{ textWrap: "balance" }}>{slide.caption}</h2>
                <p className="text-[13.5px] text-[#94A2AB] mt-2 leading-relaxed">{slide.sub}</p>
                <div className="flex gap-2 mt-6">
                    {SLIDES.map((_, i) => (
                        <button key={i} onClick={() => setIdx(i)} aria-label={`Slide ${i + 1}`}
                            className={`w-2 h-2 rounded-full transition-colors ${i === idx ? "bg-[#3EA48F]" : "bg-white/20 hover:bg-white/40"}`} />
                    ))}
                </div>
            </div>
            <div className="relative mt-10 flex flex-col items-center gap-1.5">
                <p className="font-mono text-[11px] tracking-[0.16em] text-[#9CD9C6] border border-[#2FB39E]/40 rounded-full px-4 py-1.5">COACH UP, NOT SURVEIL DOWN</p>
                <p className="font-mono text-[9.5px] tracking-[0.12em] text-[#5A6B7D]">REPS ALWAYS SEE THEIR OWN SCORECARDS</p>
            </div>
        </div>
    )
}

// ─── The wizard ──────────────────────────────────────────────────────────────

export default function StartPage() {
    const router = useRouter()
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
        e.preventDefault(); setError(null); setBusy(true)
        try {
            if (mode === "signup") {
                const { error: err } = await supabase.auth.signUp({ email, password })
                if (err) throw err
            } else {
                const { error: err } = await supabase.auth.signInWithPassword({ email, password })
                if (err) throw err
            }
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) { setError("Check your email to confirm your account, then come back here."); return }
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

    async function handleWorkspace(e: React.FormEvent) {
        e.preventDefault(); setError(null)
        if (isPersonalEmail(email)) {
            setError("Workspaces need a work email. Sign up with your company address — your reps' invites and billing all hang off it.")
            return
        }
        setBusy(true)
        try {
            const res = await callFn("create-org", { name: orgName, seats })
            setOrgId(res.org_id)
            setStep("brain")
        } catch (e) {
            const msg = (e as Error).message
            if (msg.includes("already part")) { router.replace("/"); return }
            setError(msg)
        } finally {
            setBusy(false)
        }
    }

    async function handleKit(kit: StarterKit) {
        if (!orgId) return
        setError(null); setBusy(true)
        const err = await applyStarterKit(orgId, kit)
        setBusy(false)
        if (err) { setError(err); return }
        setKitApplied(kit.title)
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
        setInviteNote(sent ? `${sent} invite${sent === 1 ? "" : "s"} sent${failed ? ` · ${failed} failed — retry from Settings → Members` : ""}` : null)
        doneRef.current = true
        setStep("done")
    }

    const stepIdx = STEPS.indexOf(step)

    if (checking) return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] text-sm text-[var(--color-muted)]">Loading…</div>
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
                <div className="flex items-center gap-1.5 mb-8" aria-label={`Step ${stepIdx + 1} of ${STEPS.length}`}>
                    {STEPS.map((s, i) => (
                        <div key={s} className="flex-1">
                            <div className={`h-1 rounded-full ${i <= stepIdx ? "bg-[var(--color-accent)]" : "bg-[var(--color-line-soft)]"}`} />
                            <p className={`mt-1.5 text-[10px] font-medium hidden sm:block ${i === stepIdx ? "text-[var(--color-accent-deep)]" : "text-[var(--color-muted)]"}`}>{STEP_LABELS[s]}</p>
                        </div>
                    ))}
                </div>

                <div className="flex-1 flex flex-col justify-center">
                    {step === "account" && (
                        <div>
                            <h1 className="font-display text-[26px] font-extrabold text-[var(--color-text)] leading-tight" style={{ textWrap: "balance" }}>
                                Give your whole team your best rep’s instincts
                            </h1>
                            <p className="text-sm text-[var(--color-text-secondary)] mt-2">
                                Live coaching on every call, scored against your playbook.
                                <span className="font-semibold text-[var(--color-text)] whitespace-nowrap"> 14 days free — no card.</span>
                            </p>
                            <form onSubmit={handleAccount} className="space-y-3 mt-7">
                                <input type="email" required placeholder="Work email" className={INPUT}
                                    value={email} onChange={e => setEmail(e.target.value)} />
                                <input type="password" required minLength={8} placeholder={mode === "signup" ? "Choose a password (8+ characters)" : "Password"}
                                    className={INPUT} value={password} onChange={e => setPassword(e.target.value)} />
                                {error && <p className="text-xs text-red-600">{error}</p>}
                                <button type="submit" disabled={busy} className={BTN}>
                                    {busy ? "One moment…" : mode === "signup" ? "Create account & continue" : "Sign in & continue"}
                                </button>
                            </form>
                            <div className="flex items-center gap-3 my-4">
                                <span className="h-px flex-1 bg-[var(--color-border)]" /><span className="text-[11px] text-[var(--color-muted)]">or</span><span className="h-px flex-1 bg-[var(--color-border)]" />
                            </div>
                            <button onClick={handleGoogle} className={BTN_GHOST + " flex items-center justify-center gap-2.5"}>
                                <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.4 28.7a14.5 14.5 0 0 1 0-9.4l-7.8-6.1a24 24 0 0 0 0 21.6l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.5-5.8c-2.1 1.4-4.7 2.3-7.7 2.3-6.3 0-11.7-3.7-13.6-9l-7.8 6.1C6.6 42.6 14.6 48 24 48z"/></svg>
                                Continue with Google
                            </button>
                            <p className="text-center text-xs text-[var(--color-muted)] mt-4">
                                {mode === "signup" ? "Already have a TalkPilot account? " : "New here? "}
                                <button onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(null) }}
                                    className="text-[var(--color-accent-deep)] font-medium hover:underline">
                                    {mode === "signup" ? "Sign in" : "Create one"}
                                </button>
                            </p>
                        </div>
                    )}

                    {step === "workspace" && (
                        <div>
                            <h1 className="font-display text-[26px] font-extrabold text-[var(--color-text)] leading-tight">Name your workspace</h1>
                            <p className="text-sm text-[var(--color-text-secondary)] mt-2">This is what your team sees when they join.</p>
                            <form onSubmit={handleWorkspace} className="space-y-4 mt-7">
                                <div>
                                    <label className="text-xs font-medium text-[var(--color-text-secondary)]">Company or team name</label>
                                    <input required minLength={2} maxLength={80} placeholder="Acme Sales" className={INPUT + " mt-1.5"}
                                        value={orgName} onChange={e => setOrgName(e.target.value)} />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-[var(--color-text-secondary)]">Seats (you can change this anytime)</label>
                                    <div className="flex items-center gap-3 mt-1.5">
                                        <button type="button" aria-label="Fewer seats" onClick={() => setSeats(s => Math.max(3, s - 1))}
                                            className="w-9 h-9 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-muted)]">−</button>
                                        <span className="font-mono text-lg text-[var(--color-text)] w-10 text-center">{seats}</span>
                                        <button type="button" aria-label="More seats" onClick={() => setSeats(s => Math.min(500, s + 1))}
                                            className="w-9 h-9 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-muted)]">+</button>
                                        <span className="text-xs text-[var(--color-muted)]">minimum 3</span>
                                    </div>
                                </div>
                                <div className="bg-[var(--color-accent-subtle)] rounded-lg px-4 py-3 text-xs text-[var(--color-accent-deep)] leading-relaxed">
                                    <strong>14 days free, every feature, no card.</strong><br />
                                    After the trial: $40/seat/mo, or $32/seat/mo billed annually.
                                </div>
                                {error && <p className="text-xs text-red-600">{error}</p>}
                                <button type="submit" disabled={busy} className={BTN}>{busy ? "Creating…" : "Start free trial"}</button>
                            </form>
                        </div>
                    )}

                    {step === "brain" && (
                        <div className="max-w-md">
                            <h1 className="font-display text-[26px] font-extrabold text-[var(--color-text)] leading-tight">Give your reps a playbook</h1>
                            <p className="text-sm text-[var(--color-text-secondary)] mt-2">
                                This is what makes coaching <em>yours</em> — reps get guided through these stages live, and every call is scored against them. Pick a starting point; edit everything later.
                            </p>
                            {/* One question, then two compact cards — the per-stage chips made
                                this step read as a wall (D-171). Details live in a single meta
                                line; everything is editable under Playbook afterwards. */}
                            <div className="flex rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] p-1 mt-6 max-w-xs">
                                {([["sales", "Sales"], ["support", "Support & success"]] as const).map(([key, label]) => (
                                    <button key={key} type="button" onClick={() => setTeamType(key)}
                                        className={`flex-1 py-1.5 text-xs rounded-md transition-colors ${
                                            teamType === key
                                                ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent-deep)] font-semibold"
                                                : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                                        }`}>{label}</button>
                                ))}
                            </div>
                            <div className="space-y-3 mt-3">
                                {STARTER_KITS.filter(kit => kit.team === teamType).map(kit => (
                                    <button key={kit.key} disabled={busy} onClick={() => handleKit(kit)}
                                        className="w-full text-left bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-accent-light)] rounded-xl px-4 py-3.5 transition-colors disabled:opacity-50 group">
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm font-semibold text-[var(--color-text)]">{kit.title}</p>
                                            <span className="text-xs font-semibold text-[var(--color-accent-deep)] opacity-0 group-hover:opacity-100 transition-opacity">Use this →</span>
                                        </div>
                                        <p className="text-xs text-[var(--color-text-secondary)] mt-1">{kit.tagline}</p>
                                        <p className="text-[10.5px] text-[var(--color-muted)] mt-1.5">
                                            {kit.stages.length} stages · {kit.objections.length} objections with approved responses · edit anything later
                                        </p>
                                    </button>
                                ))}
                                <button disabled={busy} onClick={() => { setWantsDna(true); setStep("invite") }}
                                    className="w-full text-left bg-[var(--color-surface)] border border-dashed border-[var(--color-accent-light)] rounded-xl p-4 transition-colors hover:bg-[var(--color-accent-subtle)] disabled:opacity-50">
                                    <p className="text-sm font-semibold text-[var(--color-accent-deep)] inline-flex items-center gap-1.5">
                                        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] shrink-0" />
                                        Clone your best rep instead (Team DNA)
                                    </p>
                                    <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                                        Upload 3–5 transcripts of your top performer — we extract their tone, phrases, objection responses and flow into a playbook. Takes ~5 minutes; we’ll take you there after setup.
                                    </p>
                                </button>
                            </div>
                            {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
                            <button onClick={() => setStep("invite")} className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] mt-4">
                                Skip for now — I’ll build my own under Playbook
                            </button>
                        </div>
                    )}

                    {step === "invite" && (
                        <div>
                            <h1 className="font-display text-[26px] font-extrabold text-[var(--color-text)] leading-tight">Invite your first reps</h1>
                            <p className="text-sm text-[var(--color-text-secondary)] mt-2">
                                {kitApplied
                                    ? <>The <strong>{kitApplied}</strong> playbook is live — anyone who joins gets coached from it on their very first call.</>
                                    : "They install TalkPilot on Mac, iPhone or Android and get coached live on their calls."}
                            </p>
                            <form onSubmit={handleInvites} className="space-y-3 mt-7">
                                {invites.map((v, i) => (
                                    <input key={i} type="email" placeholder={`teammate${i + 1}@company.com`} className={INPUT}
                                        value={v} onChange={e => setInvites(prev => prev.map((p, j) => j === i ? e.target.value : p))} />
                                ))}
                                <button type="button" onClick={() => setInvites(p => [...p, ""])}
                                    className="text-xs font-medium text-[var(--color-accent-deep)] hover:underline">+ Add another</button>
                                {error && <p className="text-xs text-red-600">{error}</p>}
                                <button type="submit" disabled={busy} className={BTN}>
                                    {busy ? "Sending…" : invites.some(v => v.trim()) ? "Send invites & finish" : "Finish setup"}
                                </button>
                            </form>
                            <div className="flex items-center gap-4 mt-4">
                                <button onClick={() => setStep("brain")} className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]">
                                    ← Back
                                </button>
                                <button onClick={() => { doneRef.current = true; setStep("done") }} className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]">
                                    Skip — I’ll invite them later
                                </button>
                            </div>
                        </div>
                    )}

                    {step === "done" && (
                        <div className="max-w-md">
                            <div className="w-12 h-12 rounded-full bg-[var(--color-accent-subtle)] flex items-center justify-center">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12.5 10 18 20 6" /></svg>
                            </div>
                            <h1 className="font-display text-[26px] font-extrabold text-[var(--color-text)] leading-tight mt-4">{orgName || "Your workspace"} is live</h1>
                            {inviteNote && <p className="text-xs text-[var(--color-accent-deep)] font-medium mt-1">{inviteNote}</p>}
                            <div className="space-y-4 mt-6">
                                {[
                                    ["1", "Reps install TalkPilot", "Mac, iPhone or Android — they sign in with their invite and they're in your workspace."],
                                    ["2", "Their next call gets coached live", kitApplied ? `Guided through the ${kitApplied} stages, with your approved objection responses on tap.` : "Once your playbook is active, they're guided through your stages live."],
                                    ["3", "The scorecard lands here", "Stage adherence, objection grades and coaching moments — in your Command Center minutes after the call ends."],
                                ].map(([n, title, sub]) => (
                                    <div key={n} className="flex gap-3">
                                        <span className="w-6 h-6 rounded-full bg-[var(--color-accent-subtle)] text-[var(--color-accent-deep)] font-mono text-[11px] flex items-center justify-center shrink-0 mt-0.5">{n}</span>
                                        <div>
                                            <p className="text-sm font-semibold text-[var(--color-text)]">{title}</p>
                                            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{sub}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="flex flex-col sm:flex-row gap-3 mt-8">
                                <button onClick={() => { window.location.href = wantsDna ? "/playbook?tab=dna" : "/" }} className={BTN + " sm:flex-1"}>
                                    {wantsDna ? "Set up Team DNA →" : "Open your Command Center →"}
                                </button>
                                {wantsDna && (
                                    <button onClick={() => { window.location.href = "/" }} className={BTN_GHOST + " sm:flex-1"}>Command Center</button>
                                )}
                            </div>
                            <p className="text-[11px] text-[var(--color-muted)] mt-5">
                                Trial: 14 days, every feature. Add billing anytime in Settings → Billing.
                                Apps: <a className="underline" href="https://apps.apple.com/app/id6763953639" target="_blank" rel="noreferrer">iPhone</a> · <a className="underline" href="https://talkpilot.co" target="_blank" rel="noreferrer">Mac</a>
                            </p>
                        </div>
                    )}
                </div>

                <p className="text-[11px] text-[var(--color-muted)] mt-10">
                    Already using TalkPilot Teams? <Link href="/login" className="text-[var(--color-accent-deep)] hover:underline">Sign in</Link>
                    <span className="mx-2">·</span>
                    Questions? <a href="mailto:alexis@talkpilot.co" className="text-[var(--color-accent-deep)] hover:underline">Talk to us</a>
                </p>
                </div>
            </div>

            <Showcase />
        </div>
    )
}
