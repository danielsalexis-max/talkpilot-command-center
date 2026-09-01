"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { useT } from "@/i18n/LocaleProvider"
import { GetTheApp } from "@/components/GetTheApp"
import type { Dict } from "@/i18n"

const INPUT = "w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
const BTN   = "w-full py-2.5 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] text-[var(--btn-ink)] text-sm font-medium rounded-lg transition-colors disabled:opacity-60"


type InvitePreview = {
    valid: boolean
    reason?: "invalid" | "expired" | "used" | "revoked"
    org_name?: string
    role?: string
    email?: string
    email_hint?: string
}

// Resolved before sign-up so nobody is asked to create an account for an
// organization the page won't name, or for a link that is already dead.
function previewError(t: Dict, reason: InvitePreview["reason"]): string {
    switch (reason) {
        case "expired": return t.acceptInvite.expiredLink
        case "used":    return t.acceptInvite.usedLink
        case "revoked": return t.acceptInvite.revokedLink
        default:        return t.acceptInvite.invalidLink
    }
}


export default function AcceptInvitePage() {
    return (
        <Suspense fallback={<AcceptInviteFallback />}>
            <AcceptInviteContent />
        </Suspense>
    )
}

function AcceptInviteFallback() {
    const t = useT()
    return <div className="min-h-screen flex items-center justify-center text-[var(--color-text-secondary)] text-sm">{t.acceptInvite.checking}</div>
}

function AcceptInviteContent() {
    const params = useSearchParams()
    const t = useT()
    const token  = params.get("token") ?? ""
    const [status, setStatus]   = useState<"loading" | "auth_required" | "confirm_email" | "accepting" | "done" | "error" | "wrong_account">("loading")
    const [message, setMessage] = useState("")
    const [mode, setMode]       = useState<"signup" | "signin">("signup")
    const [email, setEmail]     = useState("")
    const [password, setPassword] = useState("")
    const [busy, setBusy]       = useState(false)
    const [preview, setPreview] = useState<InvitePreview | null>(null)
    /// Who is actually signed in — shown on the wrong-account screen so the
    /// invitee can see WHICH identity is in the way before signing it out.
    const [currentEmail, setCurrentEmail] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false

        async function boot() {
            if (!token) { setStatus("error"); setMessage(t.acceptInvite.invalidLink); return }

            // Who invited you, and to what — resolved before the sign-up form so the
            // page can name the organization and stop a dead link early.
            let pv: InvitePreview | null = null
            try {
                const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
                const res = await fetch(`${supabaseUrl}/functions/v1/invite-preview`, {
                    method:  "POST",
                    headers: { "Content-Type": "application/json" },
                    body:    JSON.stringify({ token }),
                })
                const p = (await res.json()) as InvitePreview
                if (cancelled) return
                pv = p
                setPreview(p)
                if (!p.valid) {
                    setStatus("error")
                    setMessage(previewError(t, p.reason))
                    return
                }
                // The account must be created as the invited address —
                // accept-invite enforces the match (D-169), so a free-form
                // field only sets people up to fail after creating an account.
                if (p.email) setEmail(p.email)
            } catch {
                // The preview is context, not a gate. If it fails, carry on and let
                // accept-invite stay the authority on whether the token is good.
            }

            const { data: { user } } = await supabase.auth.getUser()
            if (cancelled) return
            if (!user) { setStatus("auth_required"); return }
            setCurrentEmail(user.email ?? null)
            // Compare BEFORE calling accept-invite: the server enforces the
            // email binding anyway (D-169), but auto-accepting with a known
            // mismatched session produced the same 403 dead end on every click
            // of the invite link, with no way out. Catch it here and offer the
            // sign-out path instead.
            const invited = (pv?.email ?? "").trim().toLowerCase()
            const current = (user.email ?? "").trim().toLowerCase()
            if (invited && current && invited !== current) {
                setStatus("wrong_account")
                return
            }
            acceptInvite()
        }

        boot()
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token])

    async function acceptInvite() {
        if (!token) { setStatus("error"); setMessage(t.acceptInvite.invalidLink); return }
        setStatus("accepting")
        try {
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
            const { data: { session } } = await supabase.auth.getSession()
            const res = await fetch(`${supabaseUrl}/functions/v1/accept-invite`, {
                method:  "POST",
                headers: {
                    "Authorization": `Bearer ${session?.access_token}`,
                    "Content-Type":  "application/json",
                },
                body: JSON.stringify({ token }),
            })
            const body = await res.json().catch(() => ({}))
            if (res.ok) {
                setStatus("done")
            } else if (body.error?.code === "invite_email_mismatch") {
                // Server-side backstop for the same case boot() pre-checks —
                // reached when the preview didn't load. Same recovery screen.
                const { data: { user: u } } = await supabase.auth.getUser()
                setCurrentEmail(u?.email ?? null)
                setStatus("wrong_account")
            } else {
                setStatus("error")
                setMessage(body.error?.code === "invite_revoked"
                    ? t.acceptInvite.revokedLink
                    : body.error?.message ?? body.error ?? t.acceptInvite.acceptFailed)
            }
        } catch (e) {
            setStatus("error")
            setMessage((e as Error).message)
        }
    }

    /// Sign out before starting OAuth — same rule as /login and /start: manual
    /// identity linking is enabled (D-062), so OAuth on top of an existing
    /// session LINKS the new identity to that account instead of switching.
    /// On this page that means an invitee on a machine with a leftover session
    /// (the owner's, a colleague's) would join the org as the wrong account.
    /// redirectTo keeps ?token= so the return trip re-runs boot() and accepts.
    async function oauth(provider: "google" | "azure") {
        setMessage("")
        await supabase.auth.signOut({ scope: "local" })
        // login_hint pins the provider's account chooser to the invited
        // address — the password form locks its email field for the same
        // reason, and without this OAuth was the open side door into the
        // wrong-account 403 (Google happily offered every signed-in account).
        const hint = preview?.email ? { login_hint: preview.email } : undefined
        await supabase.auth.signInWithOAuth({
            provider,
            options: provider === "azure"
                ? { scopes: "openid profile email", redirectTo: window.location.href, ...(hint ? { queryParams: hint } : {}) }
                : { redirectTo: window.location.href, ...(hint ? { queryParams: hint } : {}) },
        })
    }

    /// The escape hatch from the wrong-account screen: drop the session that's
    /// in the way and land back on the auth form, prefilled with the invited
    /// address.
    async function signOutAndRetry() {
        await supabase.auth.signOut({ scope: "local" })
        setCurrentEmail(null)
        setPassword("")
        if (preview?.email) setEmail(preview.email)
        setMessage("")
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
                await acceptInvite()
            } else {
                const { data, error } = await supabase.auth.signUp({ email, password })
                if (error) { setMessage(error.message); return }
                if (data.session) {
                    await acceptInvite()
                } else {
                    // Email confirmation is required — session doesn't exist yet
                    setStatus("confirm_email")
                }
            }
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center px-4">
            <div className="w-full max-w-sm space-y-6">
                <div className="text-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/brand-mark.png" alt="" className="w-12 h-12 object-contain mx-auto mb-4" />
                    <h1 className="text-2xl font-semibold text-[var(--color-text)]">
                        TalkPilot <span className="text-[var(--color-accent)]">Teams</span>
                    </h1>
                </div>

                {status === "loading"   && <p className="text-[var(--color-text-secondary)] text-sm text-center">{t.acceptInvite.checking}</p>}
                {status === "accepting" && <p className="text-[var(--color-text-secondary)] text-sm text-center">{t.acceptInvite.accepting}</p>}

                {status === "error" && (
                    <div className="text-center space-y-3">
                        <p className="text-red-600 text-sm">{message}</p>
                        <p className="text-xs text-[var(--color-muted)]">{t.acceptInvite.askResend}</p>
                    </div>
                )}

                {status === "wrong_account" && (
                    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 space-y-4 shadow-sm text-center">
                        <p className="text-sm font-semibold text-[var(--color-text)]">{t.acceptInvite.wrongAccountTitle}</p>
                        <p className="text-sm text-[var(--color-text-secondary)]">
                            {t.acceptInvite.wrongAccountInvited}{" "}
                            <span className="font-medium text-[var(--color-text)]">{preview?.email ?? preview?.email_hint ?? t.acceptInvite.theInvitedAddress}</span>
                            {currentEmail && (
                                <>
                                    {" — "}{t.acceptInvite.wrongAccountCurrent}{" "}
                                    <span className="font-medium text-[var(--color-text)]">{currentEmail}</span>
                                </>
                            )}.
                        </p>
                        <button onClick={signOutAndRetry} className={BTN}>
                            {t.acceptInvite.switchAndAccept}
                        </button>
                        <p className="text-xs text-[var(--color-muted)]">{t.acceptInvite.askAdminMismatch}</p>
                    </div>
                )}

                {preview?.valid && (status === "auth_required" || status === "confirm_email") && (
                    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 text-center space-y-1 shadow-sm">
                        <p className="text-sm text-[var(--color-text)]">
                            {t.acceptInvite.invitedTo1}{" "}
                            <span className="font-semibold">{preview.org_name}</span>
                            {preview.role && <> {t.acceptInvite.invitedAs} <span className="font-semibold">{t.data.roles[preview.role] ?? preview.role}</span></>}.
                        </p>
                        {preview.email_hint && (
                            <p className="text-xs text-[var(--color-muted)]">
                                {t.acceptInvite.sentTo(preview.email_hint)}
                            </p>
                        )}
                    </div>
                )}

                {status === "confirm_email" && (
                    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 text-center space-y-2 shadow-sm">
                        <p className="text-sm font-semibold text-[var(--color-text)]">{t.acceptInvite.confirmEmailTitle}</p>
                        <p className="text-sm text-[var(--color-text-secondary)]">
                            {t.acceptInvite.confirmEmailBody1} <span className="font-medium text-[var(--color-text-secondary)]">{email}</span>{t.acceptInvite.confirmEmailBody2}
                        </p>
                    </div>
                )}

                {status === "auth_required" && (
                    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 space-y-4 shadow-sm">
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
                            {mode === "signup" ? t.acceptInvite.signupHelp : t.acceptInvite.signinHelp}
                        </p>
                        <form onSubmit={submitAuth} className="space-y-3">
                            <input type="email" placeholder={t.common.workEmail} value={email} required
                                readOnly={!!preview?.email} aria-readonly={!!preview?.email}
                                autoComplete="email"
                                onChange={e => setEmail(e.target.value)}
                                className={`${INPUT} ${preview?.email ? "opacity-70 cursor-not-allowed" : ""}`} />
                            <input type="password" placeholder={mode === "signup" ? t.acceptInvite.choosePassword : t.common.password}
                                value={password} required minLength={6}
                                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                                onChange={e => setPassword(e.target.value)} className={INPUT} />
                            {message && <p className="text-xs text-red-600">{message}</p>}
                            <button type="submit" disabled={busy} className={BTN}>
                                {busy ? t.common.oneMoment : mode === "signup" ? t.acceptInvite.createAndAccept : t.acceptInvite.signInAndAccept}
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
                            {/* Same basic scopes as /login — no Calendars.Read here (D-187);
                                the rep apps request calendar at their own sign-in (D-062). */}
                            <svg width="16" height="16" viewBox="0 0 23 23" aria-hidden="true"><path fill="#F25022" d="M0 0h11v11H0z"/><path fill="#7FBA00" d="M12 0h11v11H12z"/><path fill="#00A4EF" d="M0 12h11v11H0z"/><path fill="#FFB900" d="M12 12h11v11H12z"/></svg>
                            {t.common.continueWithMicrosoft}
                        </button>
                        <p className="text-[10.5px] text-[var(--color-muted)] text-center">
                            {t.acceptInvite.boundToAddress}
                        </p>
                    </div>
                )}

                {status === "done" && <GetTheAppScreen />}
            </div>
        </div>
    )
}

// ─── Post-accept: download the app ───────────────────────────────────────────
//
// The screen itself is shared with the owner surfaces now (D-230) — only the
// framing and the "you're a manager, go to the console instead" escape hatch
// are specific to having just accepted an invite.

function GetTheAppScreen() {
    const t = useT()
    return (
        <div className="space-y-4">
            <GetTheApp
                eyebrow={t.acceptInvite.onTheTeam}
                title={t.acceptInvite.getTheApp}
                sub={t.acceptInvite.getTheAppSub}
                footnote={t.acceptInvite.sameCredentials}
            />
            <div className="text-center">
                <Link href="/" className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)] underline underline-offset-2">
                    {t.acceptInvite.managerLink}
                </Link>
            </div>
        </div>
    )
}
