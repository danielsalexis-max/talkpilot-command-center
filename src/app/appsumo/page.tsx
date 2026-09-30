"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useT } from "@/i18n/LocaleProvider"
import { GetTheApp } from "@/components/GetTheApp"

/// D-474/D-475: AppSumo activation. Served at https://talkpilot-appsumo.vercel.app/
/// (its own host, so its sign-in never touches the Command Center's — see
/// src/middleware.ts). That URL is the OAuth redirect registered with AppSumo,
/// so a buyer arrives as /?code=… after "Activate now".
///
///   1. The single-use code goes straight to appsumo-oauth, which trades it
///      for the buyer's license key and returns a claim token. Spending the
///      code first matters: sign-up can involve an email confirmation, and the
///      code would not survive that round trip.
///   2. The claim token waits in localStorage (it must survive the Google /
///      Microsoft redirect and the confirmation link, which may open in a new
///      tab) while the buyer signs up or in.
///   3. appsumo-claim links the license to the account and grants the
///      lifetime plan; the page ends on the download screen.
///
/// AppSumo validates this URL with a bare GET, which renders the "start from
/// AppSumo" state with a 200.

const INPUT = "w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
const BTN   = "w-full py-2.5 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] text-[var(--btn-ink)] text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
const CLAIM_KEY = "tp_appsumo_claim"

type Status = "loading" | "no_code" | "auth_required" | "confirm_email" | "activating" | "done" | "error"

function readClaim(): string | null {
    try { return localStorage.getItem(CLAIM_KEY) } catch { return null }
}
function writeClaim(v: string | null) {
    try { if (v) localStorage.setItem(CLAIM_KEY, v); else localStorage.removeItem(CLAIM_KEY) } catch { /* private mode: the in-memory copy still works for this tab */ }
}

export default function AppSumoPage() {
    return (
        <Suspense fallback={null}>
            <AppSumoContent />
        </Suspense>
    )
}

function AppSumoContent() {
    const params = useSearchParams()
    const t = useT()
    const code = params.get("code") ?? ""
    const [status, setStatus]   = useState<Status>("loading")
    const [message, setMessage] = useState("")
    const [claim, setClaim]     = useState<string | null>(null)
    const [mode, setMode]       = useState<"signup" | "signin">("signup")
    const [email, setEmail]     = useState("")
    const [password, setPassword] = useState("")
    const [busy, setBusy]       = useState(false)
    const [plan, setPlan]       = useState<{ tier: number; minutes: number } | null>(null)
    const [currentEmail, setCurrentEmail] = useState<string | null>(null)

    const fnUrl = (name: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${name}`

    function errorText(code?: string): string {
        switch (code) {
            case "code_invalid":           return t.appsumo.codeInvalid
            case "license_deactivated":    return t.appsumo.deactivated
            case "license_already_linked": return t.appsumo.alreadyLinked
            case "claim_invalid":
            case "claim_expired":          return t.appsumo.codeInvalid
            default:                       return t.appsumo.genericError
        }
    }

    useEffect(() => {
        let cancelled = false
        async function boot() {
            let token = readClaim()
            if (code) {
                try {
                    const res = await fetch(fnUrl("appsumo-oauth"), {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ code }),
                    })
                    const body = await res.json().catch(() => ({}))
                    if (cancelled) return
                    if (res.ok && body.claim_token) {
                        token = body.claim_token
                        writeClaim(token)
                    } else if (!token) {
                        setStatus("error"); setMessage(errorText(body.error)); return
                    }
                } catch {
                    if (!token) { setStatus("error"); setMessage(t.appsumo.genericError); return }
                }
                // The code is spent — drop it so a reload doesn't try again.
                window.history.replaceState(null, "", window.location.pathname)
            }
            if (!token) { setStatus("no_code"); return }
            setClaim(token)

            const { data: { user } } = await supabase.auth.getUser()
            if (cancelled) return
            if (!user) { setStatus("auth_required"); return }
            setCurrentEmail(user.email ?? null)
            await activate(token)
        }
        boot()
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [code])

    async function activate(token = claim) {
        if (!token) { setStatus("no_code"); return }
        setStatus("activating")
        try {
            const { data: { session } } = await supabase.auth.getSession()
            const res = await fetch(fnUrl("appsumo-claim"), {
                method: "POST",
                headers: { "Authorization": `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ claim_token: token }),
            })
            const body = await res.json().catch(() => ({}))
            if (res.ok) {
                writeClaim(null)
                // The sign-in existed only to claim the license — drop it so
                // nothing stays signed in on this host (D-475).
                await supabase.auth.signOut({ scope: "local" })
                setPlan({ tier: Number(body.tier ?? 1), minutes: Number(body.minutes_cap ?? 600) })
                setStatus("done")
            } else {
                if (body.error !== "license_already_linked") writeClaim(null)
                setStatus("error")
                setMessage(errorText(body.error))
            }
        } catch {
            setStatus("error"); setMessage(t.appsumo.genericError)
        }
    }

    /// Same rule as /login and /accept-invite: sign out first, or OAuth on top
    /// of a leftover session LINKS the new identity instead of switching (D-062).
    async function oauth(provider: "google" | "azure") {
        setMessage("")
        await supabase.auth.signOut({ scope: "local" })
        const redirectTo = `${window.location.origin}${window.location.pathname}`
        await supabase.auth.signInWithOAuth({
            provider,
            options: provider === "azure" ? { scopes: "openid profile email", redirectTo } : { redirectTo },
        })
    }

    async function useOtherAccount() {
        await supabase.auth.signOut({ scope: "local" })
        setCurrentEmail(null); setPassword(""); setMessage("")
        setStatus("auth_required")
    }

    async function submitAuth(e: React.FormEvent) {
        e.preventDefault()
        setMessage("")
        setBusy(true)
        try {
            if (mode === "signin") {
                const { error } = await supabase.auth.signInWithPassword({ email, password })
                if (error) { setMessage(error.message); return }
                setCurrentEmail(email)
                await activate()
            } else {
                const { data, error } = await supabase.auth.signUp({
                    email, password,
                    options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` },
                })
                if (error) { setMessage(error.message); return }
                if (data.session) { setCurrentEmail(email); await activate() }
                else setStatus("confirm_email")
            }
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center px-4 py-10">
            <div className="w-full max-w-sm space-y-6">
                <div className="text-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/brand-mark.png" alt="" className="w-12 h-12 object-contain mx-auto mb-4" />
                    <h1 className="text-2xl font-semibold text-[var(--color-text)]">
                        TalkPilot <span className="text-[var(--color-muted)] font-normal">×</span> AppSumo
                    </h1>
                </div>

                {status === "loading"    && <p className="text-[var(--color-text-secondary)] text-sm text-center">{t.appsumo.checking}</p>}
                {status === "activating" && <p className="text-[var(--color-text-secondary)] text-sm text-center">{t.appsumo.activating}</p>}

                {status === "no_code" && (
                    <p className="text-sm text-[var(--color-text-secondary)] text-center">{t.appsumo.noCode}</p>
                )}

                {status === "error" && (
                    <div className="text-center space-y-4">
                        <p className="text-red-600 text-sm">{message}</p>
                        {currentEmail && (
                            <button onClick={useOtherAccount} className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)] underline underline-offset-2">
                                {t.appsumo.useOtherAccount}
                            </button>
                        )}
                    </div>
                )}

                {status === "confirm_email" && (
                    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 text-center space-y-2 shadow-sm">
                        <p className="text-sm font-semibold text-[var(--color-text)]">{t.appsumo.confirmEmailTitle}</p>
                        <p className="text-sm text-[var(--color-text-secondary)]">{t.appsumo.confirmEmailBody(email)}</p>
                    </div>
                )}

                {status === "auth_required" && (
                    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 space-y-4 shadow-sm">
                        <div className="text-center space-y-1">
                            <p className="text-sm font-semibold text-[var(--color-text)]">{t.appsumo.title}</p>
                            <p className="text-xs text-[var(--color-text-secondary)]">{t.appsumo.intro}</p>
                        </div>
                        <div className="flex rounded-lg bg-[var(--color-bg)] p-1">
                            {(["signup", "signin"] as const).map(m => (
                                <button key={m} type="button" onClick={() => { setMode(m); setMessage("") }}
                                    className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${
                                        mode === m ? "bg-[var(--color-surface)] text-[var(--color-text)] font-medium shadow-sm" : "text-[var(--color-text-secondary)]"
                                    }`}>
                                    {m === "signup" ? t.common.createAccount : t.common.signIn}
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-[var(--color-text-secondary)] text-center">
                            {mode === "signup" ? t.appsumo.signupHelp : t.appsumo.signinHelp}
                        </p>
                        <form onSubmit={submitAuth} className="space-y-3">
                            <input type="email" placeholder={t.common.email} value={email} required autoComplete="email"
                                onChange={e => setEmail(e.target.value)} className={INPUT} />
                            <input type="password" placeholder={mode === "signup" ? t.appsumo.choosePassword : t.common.password}
                                value={password} required minLength={6}
                                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                                onChange={e => setPassword(e.target.value)} className={INPUT} />
                            {message && <p className="text-xs text-red-600">{message}</p>}
                            <button type="submit" disabled={busy} className={BTN}>
                                {busy ? t.common.oneMoment : mode === "signup" ? t.appsumo.createAndActivate : t.appsumo.signInAndActivate}
                            </button>
                        </form>
                        <div className="flex items-center gap-3">
                            <span className="h-px flex-1 bg-[var(--color-border)]" />
                            <span className="text-[11px] text-[var(--color-muted)]">{t.common.or}</span>
                            <span className="h-px flex-1 bg-[var(--color-border)]" />
                        </div>
                        <button type="button" onClick={() => oauth("google")}
                            className="w-full py-2.5 bg-[var(--color-bg)] border border-[var(--color-border)] hover:border-[var(--color-muted)] text-sm font-medium text-[var(--color-text)] rounded-lg transition-colors flex items-center justify-center gap-2.5">
                            <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.4 28.7a14.5 14.5 0 0 1 0-9.4l-7.8-6.1a24 24 0 0 0 0 21.6l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.5-5.8c-2.1 1.4-4.7 2.3-7.7 2.3-6.3 0-11.7-3.7-13.6-9l-7.8 6.1C6.6 42.6 14.6 48 24 48z"/></svg>
                            {t.common.continueWithGoogle}
                        </button>
                        <button type="button" onClick={() => oauth("azure")}
                            className="w-full py-2.5 bg-[var(--color-bg)] border border-[var(--color-border)] hover:border-[var(--color-muted)] text-sm font-medium text-[var(--color-text)] rounded-lg transition-colors flex items-center justify-center gap-2.5">
                            <svg width="16" height="16" viewBox="0 0 23 23" aria-hidden="true"><path fill="#F25022" d="M0 0h11v11H0z"/><path fill="#7FBA00" d="M12 0h11v11H12z"/><path fill="#00A4EF" d="M0 12h11v11H0z"/><path fill="#FFB900" d="M12 12h11v11H12z"/></svg>
                            {t.common.continueWithMicrosoft}
                        </button>
                    </div>
                )}

                {status === "done" && plan && (
                    <div className="space-y-3">
                        <GetTheApp
                            eyebrow={t.appsumo.doneEyebrow}
                            title={t.appsumo.doneTitle}
                            sub={t.appsumo.doneSub(plan.tier, plan.minutes)}
                            footnote={t.appsumo.doneFootnote}
                        />
                        {currentEmail && <p className="text-xs text-center text-[var(--color-muted)]">{t.appsumo.signedInAs(currentEmail)}</p>}
                    </div>
                )}
            </div>
        </div>
    )
}
