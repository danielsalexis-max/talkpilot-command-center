"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { isPersonalEmail } from "@/lib/workEmail"
import { starterKitsFor, type Vertical } from "@/lib/starterKit"
import { loadGoogleAdsTag, trackWorkspaceCreated } from "@/lib/googleAds"
import { EmailLink } from "@/components/EmailLink"
import { ToolIcon } from "@/components/toolIcons"
import { useT, useLocale } from "@/i18n/LocaleProvider"
import type { Dict } from "@/i18n"

/// /start — self-serve Teams onboarding (D-163; one question per screen since
/// D-610, in the Khu B2C onboarding's language: one big question, large option
/// cards, auto-advance, a thin progress bar). The flow is a persuasion
/// mechanism as much as a form: every answer configures the workspace
/// (vertical + recommended starter kit land on organizations.settings so
/// Playbook starts preselected) AND shows the product answering it — the HUD
/// preview re-cuts to the pain they picked. Tools and knowledge screens ask
/// for commitment before the card; real connects and uploads happen right
/// after setup (the dashboard checklist carries them), so nothing here
/// promises an OAuth or upload this page can't do.
///
/// The card comes last (D-605): checkout opens a Stripe trial — $0 today,
/// first charge on day 30 — for pilots of up to 5 seats (D-609). Bigger
/// workspaces are told, on the seats screen, that billing starts today.

type Screen =
    | "account" | "team" | "pain" | "methodology"
    | "workspace" | "tools" | "knowledge" | "invite" | "done"

type ProfileVertical = "sales" | "customer_care" | "contact_center" | "real_estate" | "consultants" | "other"
type ProfilePain = "objections" | "discovery" | "process" | "closing" | "ramp" | "inconsistent" | "unknown"
type ProfileMethodology =
    | "none" | "spiced" | "bant" | "sandler" | "meddic"
    | "challenger" | "spin" | "solution" | "gap" | "own"

/// Consultants/coaches and "something else" run on the sales kits — closest
/// stages, and the flexible discovery-led kit is the recommendation anyway.
const settingsVertical = (v: ProfileVertical): Vertical =>
    v === "customer_care" || v === "contact_center" || v === "real_estate" ? v : "sales"

/// Which methodology question applies: only team types that sell.
const asksMethodology = (v: ProfileVertical | null) =>
    v === "sales" || v === "consultants" || v === "other"

/// The methodology options, ordered per team type: sales people scan for the
/// framework they already run; consultants, coaches and "something else" most
/// often follow their own way (or none), so those lead for them.
const METHOD_ORDER_SALES: ProfileMethodology[] =
    ["spiced", "bant", "sandler", "meddic", "challenger", "spin", "solution", "gap", "own", "none"]
const METHOD_ORDER_GENERIC: ProfileMethodology[] =
    ["own", "none", "spiced", "bant", "sandler", "meddic", "challenger", "spin", "solution", "gap"]

/// Which starter kit the profile answers point at (keys from lib/starterKit).
/// Methodologies without a kit of their own (Challenger, SPIN, Solution, Gap)
/// start from discovery-led — the stages are edited after setup anyway.
function recommendedKitKey(vertical: ProfileVertical, methodology: ProfileMethodology): string {
    if (vertical === "customer_care") return "support-success"
    if (vertical === "contact_center") return "contact-center"
    if (vertical === "real_estate") return "real-estate"
    switch (methodology) {
        case "spiced": return "spiced"
        case "bant": return "bant"
        case "sandler": return "sandler"
        case "meddic": return "meddic-lite"
        default: return "discovery-led"
    }
}

/// How this signup reached /start (?src=…&v=… from the /teams CTA experiment,
/// D-606). Stashed in sessionStorage because the OAuth round-trip comes back
/// to /start without the query string.
const SOURCE_KEY = "tp.start.source"
function captureSource(): { src: string; variant: string } | null {
    try {
        const params = new URLSearchParams(window.location.search)
        const src = params.get("src"), v = params.get("v")
        if (src || v) {
            const source = { src: src ?? "", variant: v ?? "" }
            sessionStorage.setItem(SOURCE_KEY, JSON.stringify(source))
            return source
        }
        const stored = sessionStorage.getItem(SOURCE_KEY)
        return stored ? JSON.parse(stored) : null
    } catch { return null }
}

const INPUT = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl px-4 py-3 text-[15px] text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
const BTN = "w-full py-3 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] disabled:opacity-40 text-[var(--btn-ink)] text-[15px] font-semibold rounded-xl transition-colors"
const BTN_GHOST = "w-full py-3 bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-muted)] text-[15px] font-medium text-[var(--color-text)] rounded-xl transition-colors"

// The work-email rule and its domain list live in one place now — the login
// page needed the same check, and three copies of a list like this is how they
// drift. `create-org` keeps its own copy on purpose: it is the server-side
// backstop and must refuse regardless of what any client believes (D-171).

// Teams has a 3-seat minimum and no plan maximum (D-603). 500 is only a
// fat-finger ceiling, mirrored in create-org and org-billing. The FREE PILOT
// covers up to 5 seats (D-609) — the seats screen says so the moment the
// count crosses it, and create-org makes a bigger workspace pay from day one.
const MIN_SEATS = 3
const MAX_SEATS = 500
const MAX_PILOT_SEATS = 5
const SEAT_PRICE_MONTHLY = 40
const clampSeats = (n: number) => Math.max(MIN_SEATS, Math.min(MAX_SEATS, Math.round(n) || MIN_SEATS))

/// Where "talk to us first" goes — one click away on every screen.
const DEMO_URL = "https://talkpilot.co/demo"

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

/// The pain screen's live payoff: the HUD card re-cut to the pain the owner
/// just picked, so the answer configures the product AND shows it working.
function ProfilePreview({ t, pain }: { t: Dict; pain: ProfilePain }) {
    const cue = t.start.profile.previewCues[pain]
    return (
        <div className="tp-screen">
            <p className="font-mono text-[9.5px] tracking-[0.12em] text-[var(--color-muted)] mb-2">{t.start.profile.previewLabel}</p>
            <div className="w-full rounded-2xl bg-[#1A263D] border border-white/10 p-4 shadow-xl">
                <div className="flex items-center gap-2 font-mono text-[9.5px] tracking-[0.12em] text-[#94A2AB]">
                    <span className="w-2 h-2 rounded-full bg-[#3EA48F] animate-pulse" />
                    {t.start.hud.liveLine}
                    <span className="ml-auto">12:41</span>
                </div>
                <p className="mt-3 text-[14px] leading-snug text-[#EDF2F1] font-medium">
                    {cue.main}<span className="text-[#9CD9C6]">{cue.accent}</span>
                </p>
                <p className="mt-2 text-[11px] text-[#94A2AB]">{cue.source}</p>
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
        <div className="hidden lg:flex flex-col items-center justify-center flex-1 bg-[#0A1220] border-l border-white/10 px-10 py-12 relative overflow-hidden">
            <div className="absolute inset-0 opacity-40" style={{ background: "radial-gradient(ellipse 60% 50% at 50% 40%, rgba(12,148,130,0.25), transparent)" }} />
            {/* Says out loud what this column is — in dark mode both halves are
                dark, and without the tag the showcase read as more questions
                (D-615). */}
            <p className="absolute top-6 left-10 font-mono text-[9.5px] tracking-[0.16em] text-[#5A6B7D]">{t.start.showcaseTag}</p>
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

// ─── Khu-style building blocks ──────────────────────────────────────────────

/// One large option card: title, optional sub, selected ring. The B2C
/// onboarding's card, translated into the Boardroom tokens.
function OptionCard({ title, sub, selected, onClick, icon }: {
    title: string; sub?: string; selected: boolean; onClick: () => void; icon?: React.ReactNode
}) {
    return (
        <button type="button" onClick={onClick} aria-pressed={selected}
            className={`w-full text-left rounded-xl border px-4 py-3.5 transition-all duration-150 ${
                selected
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-subtle)] ring-1 ring-[var(--color-accent)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-muted)] hover:-translate-y-px"
            }`}>
            <span className="flex items-center gap-2.5">
                {icon}
                <span className="min-w-0">
                    <span className={`block text-[15px] font-semibold ${selected ? "text-[var(--color-accent-deep)]" : "text-[var(--color-text)]"}`}>{title}</span>
                    {sub && <span className="block text-xs text-[var(--color-text-secondary)] mt-0.5 leading-relaxed">{sub}</span>}
                </span>
            </span>
        </button>
    )
}

/// Screen scaffold: the big question, one line under it, then the body.
function ScreenShell({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
    return (
        <div className="tp-screen">
            <h1 className="font-display text-[28px] sm:text-[32px] font-extrabold text-[var(--color-text)] leading-[1.15]" style={{ textWrap: "balance" }}>
                {title}
            </h1>
            {sub && <p className="text-[15px] text-[var(--color-text-secondary)] mt-2.5 leading-relaxed">{sub}</p>}
            <div className="mt-7">{children}</div>
        </div>
    )
}

// ─── The wizard ──────────────────────────────────────────────────────────────

export default function StartPage() {
    const router = useRouter()
    const { t, locale } = useLocale()
    const [screen, setScreen]     = useState<Screen>("account")
    useEffect(() => { loadGoogleAdsTag() }, [])
    const [checking, setChecking] = useState(true)
    const [busy, setBusy]         = useState(false)
    const [error, setError]       = useState<string | null>(null)

    const [mode, setMode]         = useState<"signup" | "signin">("signup")
    const [email, setEmail]       = useState("")
    const [password, setPassword] = useState("")

    // Profile answers (D-607/D-610). Pains are multi-select since D-615 —
    // "where do calls go wrong" is rarely one thing; lastPain drives the
    // preview card (the most recent pick is the one on their mind).
    const [pVertical, setPVertical]       = useState<ProfileVertical | null>(null)
    const [pPains, setPPains]             = useState<ProfilePain[]>([])
    const [lastPain, setLastPain]         = useState<ProfilePain | null>(null)
    const [pMethodology, setPMethodology] = useState<ProfileMethodology | null>(null)
    const [pTools, setPTools]             = useState<string[]>([])
    const [pKnow, setPKnow]               = useState<string[]>([])

    const [orgName, setOrgName]   = useState("")
    const [seats, setSeats]       = useState(3)
    const [orgId, setOrgId]       = useState<string | null>(null)
    /// Whether a sales-granted trial was claimed at workspace creation (D-192).
    const [hasTrial, setHasTrial] = useState(false)
    /// D-575/D-605: the checkout opens a Stripe trial of this many days
    /// ($0 today). Null = pay from day one (no grant and over the pilot cap).
    const [cardTrialDays, setCardTrialDays] = useState<number | null>(null)
    const [checkoutBusy, setCheckoutBusy] = useState(false)

    const [invites, setInvites]       = useState<string[]>(["", "", ""])
    const [inviteNote, setInviteNote] = useState<string | null>(null)
    const doneRef = useRef(false)
    const advanceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    /// The flow, in order. Methodology only shows for team types that sell;
    /// the progress counter stays honest either way. Tools and knowledge come
    /// BEFORE the workspace is created (D-615): by the time the owner names
    /// the workspace they've already invested answers — and everything saves
    /// in one write at creation.
    const flow: Screen[] = asksMethodology(pVertical)
        ? ["account", "team", "pain", "methodology", "tools", "knowledge", "workspace", "invite", "done"]
        : ["account", "team", "pain", "tools", "knowledge", "workspace", "invite", "done"]
    const screenIdx = Math.max(0, flow.indexOf(screen))
    const progress = (screenIdx + 1) / flow.length

    /// Single-select screens advance on their own, like the B2C onboarding —
    /// pick, see it light up, move on. Short enough to feel instant, long
    /// enough that the selection reads.
    function pickAndAdvance(apply: () => void, next: Screen) {
        apply()
        if (advanceRef.current) clearTimeout(advanceRef.current)
        advanceRef.current = setTimeout(() => setScreen(next), 260)
    }
    useEffect(() => () => { if (advanceRef.current) clearTimeout(advanceRef.current) }, [])

    function goBack() {
        if (screenIdx > 1) setScreen(flow[screenIdx - 1])
    }

    // Signed-in users skip the account screen. Users already in an org: if the
    // workspace is entitled, onboarding is over — go home. If it is NOT paid
    // yet and this is the payer, resume the wizard at its final screen — this
    // is where Stripe's back button and stale tabs land, and bouncing those
    // users to the dashboard's billing gate lost the wizard forever.
    const routeForUser = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setChecking(false); return }
        const { data: member } = await supabase.from("org_members")
            .select("org_id, role").eq("user_id", user.id).eq("status", "active").maybeSingle()
        if (member && !doneRef.current) {
            const { data: o } = await supabase.from("organizations")
                .select("name, plan, seats_purchased, trial_ends_at, stripe_subscription_id, card_trial_days")
                .eq("id", member.org_id).single()
            const entitled = !!o && (
                !!o.stripe_subscription_id
                || (!!o.trial_ends_at && new Date(o.trial_ends_at) > new Date())
                || ["business", "enterprise"].includes(o.plan ?? "")
            )
            const canPay = member.role === "owner" || member.role === "admin"
            if (!o || entitled || !canPay) { router.replace("/"); return }
            setOrgId(member.org_id)
            setOrgName(o.name ?? "")
            setSeats(o.seats_purchased ?? 3)
            setHasTrial(false)
            setCardTrialDays(o.card_trial_days ?? null)
            setEmail(user.email ?? "")
            if (new URLSearchParams(window.location.search).get("checkout") === "canceled") {
                setError(t.start.checkoutCanceledNote)
            }
            doneRef.current = true
            setScreen("done")
            setChecking(false)
            return
        }
        setEmail(user.email ?? "")
        setScreen(s => (s === "account" ? "team" : s))
        setChecking(false)
    }, [router, t])

    useEffect(() => { routeForUser() }, [routeForUser])

    // Stash ?src&v (the /teams CTA experiment, D-606) before any OAuth
    // round-trip strips the query string.
    useEffect(() => { captureSource() }, [])

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
            setScreen("team")
        } catch (e) {
            setError((e as Error).message)
        } finally {
            setBusy(false)
        }
    }

    /// Sign out first — see the note on the login page's `oauth()`. With manual
    /// identity linking enabled (needed for calendar connect, D-062), starting
    /// OAuth on top of an existing session LINKS the new identity to that
    /// account instead of switching to it.
    async function handleGoogle() {
        setError(null)
        await supabase.auth.signOut({ scope: "local" })
        await supabase.auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo: `${window.location.origin}/start` },
        })
    }

    // No Calendars.Read here on purpose — the panel is an admin surface that
    // never reads a calendar; that scope belongs to the rep apps (D-187).
    async function handleMicrosoft() {
        setError(null)
        await supabase.auth.signOut({ scope: "local" })
        await supabase.auth.signInWithOAuth({
            provider: "azure",
            options: {
                scopes: "openid profile email",
                redirectTo: `${window.location.origin}/start`,
                queryParams: { prompt: "select_account" },
            },
        })
    }

    // OAuth identities land back here already signed in, so the personal-domain
    // check can't run before the account exists the way it does for the email
    // form. The recovery path is a real one: sign out and start over.
    async function switchAccount() {
        await supabase.auth.signOut({ scope: "local" })
        setEmail(""); setPassword(""); setError(null)
        setScreen("account")
    }

    /// Best-effort settings write (same write the StarterKitPicker does): the
    /// Playbook tab preselects the kit family from settings.vertical, and the
    /// dashboard reads onboarding_profile for recommendations. Never blocks
    /// the flow.
    async function saveProfileSettings(id: string) {
        if (!pVertical) return
        try {
            await supabase.from("organizations").update({
                settings: {
                    vertical: settingsVertical(pVertical),
                    onboarding_profile: {
                        vertical: pVertical,
                        pains: pPains,
                        methodology: asksMethodology(pVertical) ? pMethodology : null,
                        recommended_kit: recommendedKitKey(pVertical, pMethodology ?? "none"),
                        tools: pTools,
                        knowledge: pKnow,
                    },
                },
            }).eq("id", id)
        } catch { /* non-blocking */ }
    }

    async function handleWorkspace(e: React.FormEvent) {
        e.preventDefault(); setError(null)
        if (isPersonalEmail(email)) {
            setError(t.start.personalEmailError)
            return
        }
        // Enter can submit while the seat field still holds a half-typed value.
        const seatCount = clampSeats(seats)
        setSeats(seatCount)
        setBusy(true)
        try {
            // Profile answers and the CTA-experiment source ride along for the
            // audit trail (D-606/D-607); create-org sanitizes and stores them.
            const profile = pVertical ? {
                vertical: pVertical,
                pain: pPains.join(",") || null,
                methodology: asksMethodology(pVertical) ? pMethodology : null,
            } : null
            const source = captureSource()
            const res = await callFn("create-org", {
                name: orgName, seats: seatCount,
                ...(source ? { source } : {}),
                ...(profile ? { profile } : {}),
            })
            setOrgId(res.org_id)
            trackWorkspaceCreated()
            await saveProfileSettings(res.org_id)
            setHasTrial(!!res.trial_ends_at)
            setCardTrialDays(typeof res.card_trial_days === "number" ? res.card_trial_days : null)
            setScreen("invite")
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
            const res = await callFn("org-billing", { org_id: orgId, action: "checkout", interval: "month", context: "onboarding" })
            if (res?.url) { window.location.href = res.url as string; return }
            setError(t.start.checkoutFailed)
        } catch (e) {
            setError((e as Error).message)
        } finally {
            setCheckoutBusy(false)
        }
    }

    async function handleInvites(e: React.FormEvent) {
        e.preventDefault(); setError(null); setBusy(true)
        const emails = invites.map(v => v.trim()).filter(Boolean)
        let sent = 0, queued = 0, failed = 0
        for (const em of emails) {
            try {
                const r = await callFn("invite-member", { org_id: orgId, email: em, role: "member" })
                if (r?.queued) queued++; else sent++
            }
            catch { failed++ }
        }
        setBusy(false)
        // Pre-billing, invites queue rather than send — say that, or
        // "1 invitación enviada" is false and the owner waits for an email
        // that will not arrive until they pay.
        setInviteNote(queued ? t.start.inviteQueuedNote(queued)
                    : sent   ? t.start.inviteNote(sent, failed)
                    : null)
        doneRef.current = true
        setScreen("done")
    }

    /// Toggle for the multi-select screens. The exclusive key ("none"/
    /// "nothing") clears the rest, and picking anything clears it.
    function toggleMulti(list: string[], set: (v: string[]) => void, key: string, exclusiveKey: string) {
        if (key === exclusiveKey) { set(list.includes(key) ? [] : [key]); return }
        const base = list.filter(k => k !== exclusiveKey)
        set(base.includes(key) ? base.filter(k => k !== key) : [...base, key])
    }

    if (checking) return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] text-sm text-[var(--color-muted)]">{t.common.loading}</div>
    )

    const kitTitle = pVertical
        ? starterKitsFor(locale).find(k => k.key === recommendedKitKey(pVertical, pMethodology ?? "none"))?.title
        : null
    const overPilotCap = seats > MAX_PILOT_SEATS

    return (
        <div className="min-h-screen flex bg-[var(--color-bg)]">
            {/* ── Left: the wizard ── */}
            <div className="flex-1 flex justify-center px-6 sm:px-10 lg:px-14 py-8 lg:py-12">
                <div className="w-full max-w-[460px] flex flex-col">
                <div className="flex items-center gap-2.5 mb-8">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/brand-mark.png" alt="" className="w-8 h-8 object-contain" />
                    <span className="font-display font-bold text-[15px] text-[var(--color-text)]">TalkPilot <span className="text-[var(--color-accent)]">Teams</span></span>
                </div>

                {/* Progress: back chevron, one thin bar, n of N. */}
                {screen !== "done" && (
                    <div className="flex items-center gap-3 mb-2">
                        <button type="button" onClick={goBack} aria-label={t.start.back}
                            disabled={screenIdx <= 1}
                            className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                                screenIdx > 1 ? "text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)]" : "opacity-0 pointer-events-none"
                            }`}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                        </button>
                        <div className="flex-1 h-1 rounded-full bg-[var(--color-line-soft)] overflow-hidden">
                            <div className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-300" style={{ width: `${Math.round(progress * 100)}%` }} />
                        </div>
                        <span className="font-mono text-[11px] text-[var(--color-muted)]">{t.start.stepOfN(screenIdx + 1, flow.length)}</span>
                    </div>
                )}

                {/* The demo escape hatch stays one click away on every screen —
                    self-serve is the default motion, not the only one. */}
                {screen !== "done" && (
                    <p className="mb-7 text-[11px] pl-10">
                        <a href={DEMO_URL} target="_blank" rel="noopener noreferrer" className="text-[var(--color-muted)] hover:text-[var(--color-accent-deep)]">
                            {t.start.questionsBookDemo}
                        </a>
                    </p>
                )}

                <div className="flex-1 flex flex-col justify-center" key={screen}>
                    {screen === "account" && (
                        <div className="tp-screen">
                            <h1 className="font-display text-[28px] sm:text-[32px] font-extrabold text-[var(--color-text)] leading-[1.15]" style={{ textWrap: "balance" }}>
                                {t.start.accountTitle}
                            </h1>
                            <p className="text-[15px] text-[var(--color-text-secondary)] mt-2.5">
                                {t.start.accountSub}
                                <span className="font-semibold text-[var(--color-text)] whitespace-nowrap"> {t.start.accountFree}</span>
                            </p>
                            <form onSubmit={handleAccount} className="space-y-3 mt-7">
                                <input type="email" required placeholder={t.common.workEmail} className={INPUT}
                                    autoComplete="email" autoFocus
                                    value={email} onChange={e => setEmail(e.target.value)} />
                                {mode === "signup" && isPersonalEmail(email) && (
                                    <p className="text-xs text-amber-700">{t.start.personalEmailError}</p>
                                )}
                                <input type="password" required minLength={8} placeholder={mode === "signup" ? t.start.choosePassword : t.common.password}
                                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
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

                    {screen === "team" && (
                        <ScreenShell title={t.start.profile.teamQ} sub={t.start.profile.teamSub}>
                            <div className="grid sm:grid-cols-2 gap-2.5">
                                {(Object.keys(t.start.profile.teams) as ProfileVertical[]).map(v => (
                                    <OptionCard key={v} title={t.start.profile.teams[v]} sub={t.start.profile.teamSubs[v]}
                                        selected={pVertical === v}
                                        onClick={() => pickAndAdvance(() => setPVertical(v), "pain")} />
                                ))}
                            </div>
                        </ScreenShell>
                    )}

                    {screen === "pain" && (
                        <ScreenShell title={t.start.profile.painQ} sub={t.start.profile.painSub}>
                            <div className="grid gap-2.5">
                                {(Object.keys(t.start.profile.pains) as ProfilePain[]).map(p => (
                                    <OptionCard key={p} title={t.start.profile.pains[p]}
                                        selected={pPains.includes(p)}
                                        onClick={() => {
                                            // "we don't know" stands alone; anything else clears it.
                                            const next = p === "unknown"
                                                ? (pPains.includes("unknown") ? [] : ["unknown" as ProfilePain])
                                                : pPains.includes(p)
                                                    ? pPains.filter(x => x !== p)
                                                    : [...pPains.filter(x => x !== "unknown"), p]
                                            setPPains(next)
                                            setLastPain(next.includes(p) ? p : next[next.length - 1] ?? null)
                                        }} />
                                ))}
                            </div>
                            {lastPain && <div className="mt-5"><ProfilePreview t={t} pain={lastPain} /></div>}
                            <button disabled={pPains.length === 0}
                                onClick={() => setScreen(asksMethodology(pVertical) ? "methodology" : "tools")}
                                className={BTN + " mt-5"}>
                                {t.start.profile.continueBtn}
                            </button>
                        </ScreenShell>
                    )}

                    {screen === "methodology" && (
                        <ScreenShell title={t.start.profile.methodologyQ} sub={t.start.profile.methodologySub}>
                            <div className="flex flex-wrap gap-2.5">
                                {(pVertical === "sales" ? METHOD_ORDER_SALES : METHOD_ORDER_GENERIC).map(m => (
                                    <button key={m} type="button" aria-pressed={pMethodology === m}
                                        onClick={() => pickAndAdvance(() => setPMethodology(m), "tools")}
                                        className={`px-4 py-2.5 rounded-xl border text-[14px] font-semibold transition-all duration-150 ${
                                            pMethodology === m
                                                ? "border-[var(--color-accent)] bg-[var(--color-accent-subtle)] text-[var(--color-accent-deep)] ring-1 ring-[var(--color-accent)]"
                                                : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:border-[var(--color-muted)]"
                                        }`}>
                                        {t.start.profile.methodologies[m]}
                                    </button>
                                ))}
                            </div>
                            {kitTitle && pMethodology && (
                                <p className="text-xs text-[var(--color-accent-deep)] bg-[var(--color-accent-subtle)] rounded-xl px-4 py-3 mt-5">
                                    {t.start.profile.recommendedKit(kitTitle)}
                                </p>
                            )}
                        </ScreenShell>
                    )}

                    {screen === "workspace" && (
                        <ScreenShell title={t.start.workspaceTitle} sub={t.start.workspaceSub}>
                            {/* OAuth arrivals skip the account form, so a personal Google/
                                Microsoft identity is only catchable here — say it now, with
                                a way out, instead of on submit. */}
                            {isPersonalEmail(email) && (
                                <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
                                    <p className="text-xs text-amber-900">{t.start.personalEmailError}</p>
                                    <button onClick={switchAccount} className="mt-1.5 text-xs font-semibold text-amber-900 underline">
                                        {t.start.useAnotherAccount}
                                    </button>
                                </div>
                            )}
                            <form onSubmit={handleWorkspace} className="space-y-5">
                                <div>
                                    <label className="text-xs font-medium text-[var(--color-text-secondary)]">{t.start.companyName}</label>
                                    <input required minLength={2} maxLength={80} placeholder={t.start.companyPlaceholder} className={INPUT + " mt-1.5"}
                                        value={orgName} onChange={e => setOrgName(e.target.value)} />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-[var(--color-text-secondary)]">{t.start.seatsLabel}</label>
                                    <div className="flex items-center gap-3 mt-1.5">
                                        <button type="button" aria-label={t.start.fewerSeats} onClick={() => setSeats(s => clampSeats(s - 1))}
                                            className="w-10 h-10 rounded-xl border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-muted)]">−</button>
                                        {/* Typable, not just a stepper: with no plan
                                            maximum (D-603) a 60-person team
                                            shouldn't have to click + 55 times. */}
                                        <input type="number" inputMode="numeric" aria-label={t.start.seatsLabel}
                                            min={MIN_SEATS} max={MAX_SEATS} value={seats}
                                            onChange={e => setSeats(Math.max(0, Math.min(MAX_SEATS, Math.round(Number(e.target.value)) || 0)))}
                                            onBlur={() => setSeats(clampSeats)}
                                            className="font-mono text-lg text-[var(--color-text)] w-16 text-center bg-transparent border border-[var(--color-border)] rounded-xl py-1.5 focus:outline-none focus:border-[var(--color-accent)]" />
                                        <button type="button" aria-label={t.start.moreSeats} onClick={() => setSeats(s => clampSeats(s + 1))}
                                            className="w-10 h-10 rounded-xl border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-muted)]">+</button>
                                        <span className="text-xs text-[var(--color-muted)]">{t.start.minSeats}</span>
                                    </div>
                                    <p className="text-xs text-[var(--color-text-secondary)] mt-2">
                                        {t.start.enterpriseNote}{" "}
                                        <a href={DEMO_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--color-accent-deep)] hover:underline">
                                            {t.start.enterpriseCta}
                                        </a>
                                    </p>
                                </div>
                                {/* The pilot promise flips with the count (D-609): up to 5
                                    seats pilots free; above that, billing starts today and
                                    the box says so before any card is asked for. */}
                                {overPilotCap ? (
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-900 leading-relaxed">
                                        <strong>{t.start.pricingBoxTitle}</strong><br />
                                        {t.start.pilotBoxBig(seats, seats * SEAT_PRICE_MONTHLY)}
                                    </div>
                                ) : (
                                    <div className="bg-[var(--color-accent-subtle)] rounded-xl px-4 py-3 text-xs text-[var(--color-accent-deep)] leading-relaxed">
                                        <strong>{t.start.pricingBoxTitle}</strong><br />
                                        {t.start.pilotBoxSmall}
                                    </div>
                                )}
                                {error && <p className="text-xs text-red-600">{error}</p>}
                                <button type="submit" disabled={busy} className={BTN}>{busy ? t.start.creating : t.start.startFreeTrial}</button>
                            </form>
                        </ScreenShell>
                    )}

                    {screen === "tools" && (
                        <ScreenShell title={t.start.tools.title} sub={t.start.tools.sub}>
                            <div className="grid sm:grid-cols-2 gap-2.5">
                                {(Object.keys(t.start.tools.options) as (keyof Dict["start"]["tools"]["options"])[]).map(k => (
                                    <OptionCard key={k} title={t.start.tools.options[k]}
                                        icon={<ToolIcon tool={k} />}
                                        selected={pTools.includes(k)}
                                        onClick={() => toggleMulti(pTools, setPTools, k, "none")} />
                                ))}
                            </div>
                            <p className="text-xs text-[var(--color-muted)] mt-4 leading-relaxed">{t.start.tools.note}</p>
                            <button onClick={() => setScreen("knowledge")} className={BTN + " mt-5"}>
                                {t.start.profile.continueBtn}
                            </button>
                            <button onClick={() => { setPTools([]); setScreen("knowledge") }} className="block mx-auto text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] mt-3">
                                {t.start.profile.skip}
                            </button>
                        </ScreenShell>
                    )}

                    {screen === "knowledge" && (
                        <ScreenShell title={t.start.knowledge.title} sub={t.start.knowledge.sub}>
                            <div className="grid gap-2.5">
                                {(Object.keys(t.start.knowledge.options) as (keyof Dict["start"]["knowledge"]["options"])[]).map(k => (
                                    <OptionCard key={k} title={t.start.knowledge.options[k]}
                                        selected={pKnow.includes(k)}
                                        onClick={() => toggleMulti(pKnow, setPKnow, k, "nothing")} />
                                ))}
                            </div>
                            <p className="text-xs text-[var(--color-muted)] mt-4 leading-relaxed">{t.start.knowledge.note}</p>
                            <button onClick={() => setScreen("workspace")} className={BTN + " mt-5"}>
                                {t.start.profile.continueBtn}
                            </button>
                            <button onClick={() => { setPKnow([]); setScreen("workspace") }} className="block mx-auto text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] mt-3">
                                {t.start.profile.skip}
                            </button>
                        </ScreenShell>
                    )}

                    {screen === "invite" && (
                        <ScreenShell title={t.start.inviteTitle} sub={t.start.inviteSubNoKit}>
                            <form onSubmit={handleInvites} className="space-y-3">
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
                                <button onClick={() => { doneRef.current = true; setScreen("done") }} className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]">
                                    {t.start.skipInvites}
                                </button>
                            </div>
                        </ScreenShell>
                    )}

                    {screen === "done" && (
                        <div className="max-w-md tp-screen">
                            <div className="w-12 h-12 rounded-full bg-[var(--color-accent-subtle)] flex items-center justify-center">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12.5 10 18 20 6" /></svg>
                            </div>
                            <h1 className="font-display text-[28px] font-extrabold text-[var(--color-text)] leading-tight mt-4">{t.start.doneTitle(orgName || t.start.doneFallbackOrg)}</h1>
                            {inviteNote && <p className="text-xs text-[var(--color-accent-deep)] font-medium mt-1">{inviteNote}</p>}
                            <div className="space-y-4 mt-6">
                                {t.start.doneSteps.map((s, i) => (
                                    <div key={i} className="flex gap-3">
                                        <span className="w-6 h-6 rounded-full bg-[var(--color-accent-subtle)] text-[var(--color-accent-deep)] font-mono text-[11px] flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                                        <div>
                                            <p className="text-sm font-semibold text-[var(--color-text)]">{s.title}</p>
                                            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                                                {/* The live-coaching step's sub depends on playbook state (D-215);
                                                    it sits at index 2 since the knowledge step was prepended. */}
                                                {i === 2 ? t.start.doneStep2NoKit : s.sub}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {/* The card comes last: the pilot checkout for up to 5 seats
                                ($0 today, D-605/D-609), the pay-today checkout above that.
                                The demo route stays one click away either way. */}
                            {!hasTrial && (
                                <div className="mt-7 rounded-xl border border-[var(--color-accent-light)] bg-[var(--color-accent-subtle)] px-4 py-3.5 space-y-2">
                                    <p className="text-sm font-semibold text-[var(--color-accent-deep)]">
                                        {cardTrialDays ? t.start.cardTrialTitle(cardTrialDays) : t.start.payTitle}
                                    </p>
                                    <p className="text-xs text-[var(--color-accent-deep)]">
                                        {cardTrialDays ? t.start.cardTrialSub(cardTrialDays, seats) : t.start.paySub(seats)}
                                    </p>
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        <button onClick={startCheckout} disabled={checkoutBusy} className={BTN + " sm:w-auto px-5"}>
                                            {checkoutBusy ? t.start.openingCheckout : cardTrialDays ? t.start.cardTrialCta : t.start.goToCheckout}
                                        </button>
                                        <a href={DEMO_URL} target="_blank" rel="noopener noreferrer" className={BTN_GHOST + " sm:w-auto px-5 text-center"}>{t.start.bookDemoInstead}</a>
                                    </div>
                                    {error && <p className="text-xs text-amber-700">{error}</p>}
                                </div>
                            )}

                            {/* Only an entitled workspace gets a door into the
                                Command Center — without a trial or sub the app
                                shell is one big billing gate, so the primary
                                CTA above (checkout / demo) must stay the only
                                primary action. */}
                            {/* One primary action: into the Command Center. The app
                                download lives there ("Get the app" in the sidebar,
                                D-230) — a second CTA here just competed with it
                                (D-615). */}
                            {hasTrial && (
                                <div className="flex flex-col sm:flex-row gap-3 mt-8">
                                    <button onClick={() => { window.location.href = "/" }} className={BTN + " sm:flex-1"}>
                                        {t.start.openCommandCenter}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <p className="text-[11px] text-[var(--color-muted)] mt-10">
                    {t.start.alreadyUsing} <Link href="/login" className="text-[var(--color-accent-deep)] hover:underline">{t.common.signIn}</Link>
                    <span className="mx-2">·</span>
                    {t.start.questions} <EmailLink email="alexis@talkpilot.co" className="text-[var(--color-accent-deep)] hover:underline">{t.start.talkToUs}</EmailLink>
                </p>
                </div>
            </div>

            <Showcase />
        </div>
    )
}
