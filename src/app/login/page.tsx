"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { isPersonalEmail } from "@/lib/workEmail"
import { useT } from "@/i18n/LocaleProvider"

export default function LoginPage() {
    const router = useRouter()
    const t = useT()
    const [mode, setMode]         = useState<"signin" | "signup">("signin")
    // Second-factor step (D-182). Enrolling TOTP did nothing at sign-in: the
    // password alone produced a full AAL1 session, so MFA was enrollable but
    // bypassed — worse than no MFA, because it looks like protection.
    const [mfaFactorId, setMfaFactorId] = useState<string | null>(null)
    const [mfaCode, setMfaCode]         = useState("")
    const [ssoChecking, setSsoChecking] = useState(false)
    const [email, setEmail]       = useState("")
    const [password, setPassword] = useState("")
    const [confirm, setConfirm]   = useState("")
    const [error, setError]       = useState<string | null>(null)
    const [info, setInfo]         = useState<string | null>(null)
    const [loading, setLoading]   = useState(false)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null); setInfo(null)

        if (mode === "signup" && password !== confirm) {
            setError(t.common.passwordsDontMatch)
            return
        }

        setLoading(true)
        try {
            if (mode === "signin") {
                const { error: authErr } = await supabase.auth.signInWithPassword({ email, password })
                if (authErr) { setError(authErr.message); return }

                // A verified TOTP factor means this session is only AAL1 until
                // the code is entered. Stop here rather than letting them in.
                const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
                if (aal?.nextLevel === "aal2" && aal.nextLevel !== aal.currentLevel) {
                    const { data: factors } = await supabase.auth.mfa.listFactors()
                    const verified = (factors?.totp ?? []).find(f => f.status === "verified")
                    if (verified) { setMfaFactorId(verified.id); return }
                }
                router.replace("/")
            } else {
                // Creating an account here with a consumer address is a dead
                // end: they cannot own a workspace (create-org refuses), and a
                // member joins through their invite link, which creates the
                // account itself. Say so now rather than after the account
                // exists. Sign-IN is deliberately not gated — an invited
                // member's address is whatever the org invited.
                if (isPersonalEmail(email)) {
                    setError(t.login.workEmailRequired)
                    return
                }
                const { error: authErr } = await supabase.auth.signUp({ email, password })
                if (authErr) { setError(authErr.message); return }
                setInfo(t.login.accountCreated)
                setMode("signin"); setPassword(""); setConfirm("")
            }
        } finally {
            setLoading(false)
        }
    }

    /// Completes the second factor. Until this succeeds the session is AAL1 and
    /// the user never reaches the dashboard.
    /// Sign out before starting OAuth.
    ///
    /// This project has Supabase's manual identity linking enabled — calendar
    /// connect needs it (D-062). The side effect: starting an OAuth flow while
    /// a session already exists ATTACHES the new identity to the signed-in
    /// account instead of switching to it. On 2026-08-26 that silently welded a
    /// Google identity for alexis@talkpilot.co onto a leftover test.final@g.com
    /// test account two minutes after it was created; the dashboard then showed
    /// the wrong address and the intended account never came into existence.
    ///
    /// On a sign-in page the intent is never "link" — it is always "get me in
    /// as this identity". So drop any existing session first.
    async function oauth(provider: "google" | "azure", redirectTo: string) {
        await supabase.auth.signOut({ scope: "local" })
        await supabase.auth.signInWithOAuth({
            provider,
            options: provider === "azure"
                ? { scopes: "openid profile email", redirectTo }
                : { redirectTo },
        })
    }

    async function submitMfa(e: React.FormEvent) {
        e.preventDefault()
        if (!mfaFactorId || mfaCode.trim().length < 6) return
        setLoading(true); setError(null)
        try {
            const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId })
            if (chErr) { setError(chErr.message); return }
            const { error: vErr } = await supabase.auth.mfa.verify({
                factorId: mfaFactorId, challengeId: ch.id, code: mfaCode.trim(),
            })
            if (vErr) { setError(t.login.mfaBadCode); return }
            router.replace("/")
        } finally { setLoading(false) }
    }

    /// If the email's domain is claimed by an org with SSO, hand off to their
    /// identity provider instead of asking for a password we don't own.
    async function continueWithSso() {
        const domain = email.split("@")[1]?.trim().toLowerCase()
        if (!domain) { setError(t.login.ssoNeedsEmail); return }
        setSsoChecking(true); setError(null)
        try {
            const { data, error: err } = await supabase.auth.signInWithSSO({ domain })
            if (err || !data?.url) { setError(t.login.ssoNotConfigured); return }
            window.location.assign(data.url)
        } finally { setSsoChecking(false) }
    }

    async function forgotPassword() {
        setError(null); setInfo(null)
        if (!email) { setError(t.login.forgotNeedsEmail); return }
        const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`,
        })
        if (err) setError(err.message)
        else setInfo(t.login.resetLinkSent)
    }

    return (
        <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center px-4">
            <div className="w-full max-w-sm space-y-6">
                <div className="text-center">
                    {/* The brand mark, not a generic mic glyph — this is the first
                        screen a customer sees. eslint-disable-next-line @next/next/no-img-element */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/brand-mark.png" alt="TalkPilot" className="w-12 h-12 object-contain mx-auto mb-4" />
                    <h1 className="text-2xl font-semibold text-[var(--color-text)]">
                        TalkPilot <span className="text-[var(--color-accent)]">Teams</span>
                    </h1>
                    <p className="text-sm text-[var(--color-text-secondary)] mt-1">{t.login.commandCenter}</p>
                </div>

                <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6 shadow-sm space-y-4">
                {mfaFactorId ? (
                    <form onSubmit={submitMfa} className="space-y-3">
                        <div>
                            <p className="text-sm font-semibold text-[var(--color-text)]">{t.login.mfaStepTitle}</p>
                            <p className="text-xs text-[var(--color-text-secondary)] mt-1">{t.login.mfaStepSub}</p>
                        </div>
                        <input
                            inputMode="numeric" autoFocus placeholder="000000" value={mfaCode}
                            onChange={e => setMfaCode(e.target.value)}
                            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm font-mono tracking-widest text-center text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                        />
                        {error && <p className="text-xs text-red-600">{error}</p>}
                        <button type="submit" disabled={loading || mfaCode.trim().length < 6}
                            className="w-full py-2.5 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] disabled:opacity-40 text-[var(--btn-ink)] text-sm font-semibold rounded-lg transition-colors">
                            {loading ? t.login.signingIn : t.login.mfaVerify}
                        </button>
                        <button type="button"
                            onClick={async () => { await supabase.auth.signOut({ scope: "local" }); setMfaFactorId(null); setMfaCode(""); setError(null) }}
                            className="block mx-auto text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors">
                            {t.login.mfaBackToSignIn}
                        </button>
                    </form>
                ) : (
                <>
                    <form onSubmit={handleSubmit} className="space-y-3">
                        <input
                            type="email"
                            placeholder={t.common.email}
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                        />
                        {mode === "signup" && isPersonalEmail(email) && (
                            <p className="text-xs text-amber-700">{t.login.workEmailRequired}</p>
                        )}
                        <input
                            type="password"
                            placeholder={t.common.password}
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                        />
                        {mode === "signup" && (
                            <input
                                type="password"
                                placeholder={t.common.confirmPassword}
                                value={confirm}
                                onChange={e => setConfirm(e.target.value)}
                                required
                                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                            />
                        )}
                        {error && <p className="text-xs text-red-600">{error}</p>}
                        {info  && <p className="text-xs text-emerald-600">{info}</p>}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-2.5 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] disabled:opacity-40 text-[var(--btn-ink)] text-sm font-semibold rounded-lg transition-colors"
                        >
                            {loading
                                ? (mode === "signin" ? t.login.signingIn : t.login.creatingAccount)
                                : (mode === "signin" ? t.common.signIn : t.common.createAccount)}
                        </button>
                        {mode === "signin" && (
                            <button type="button" onClick={forgotPassword}
                                className="block mx-auto text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors">
                                {t.login.forgotPassword}
                            </button>
                        )}
                    </form>

                    <div className="flex items-center gap-3">
                        <span className="h-px flex-1 bg-[var(--color-border)]" />
                        <span className="text-[11px] text-[var(--color-muted)]">{t.common.or}</span>
                        <span className="h-px flex-1 bg-[var(--color-border)]" />
                    </div>
                    <button
                        onClick={() => oauth("google", `${window.location.origin}/`)}
                        className="w-full py-2.5 bg-[var(--color-bg)] border border-[var(--color-border)] hover:border-[var(--color-muted)] text-sm font-medium text-[var(--color-text)] rounded-lg transition-colors flex items-center justify-center gap-2.5"
                    >
                        <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.4 28.7a14.5 14.5 0 0 1 0-9.4l-7.8-6.1a24 24 0 0 0 0 21.6l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.5-5.8c-2.1 1.4-4.7 2.3-7.7 2.3-6.3 0-11.7-3.7-13.6-9l-7.8 6.1C6.6 42.6 14.6 48 24 48z"/></svg>
                        {t.common.continueWithGoogle}
                    </button>
                    <button
                        onClick={() => oauth("azure", `${window.location.origin}/`)}
                        className="w-full py-2.5 bg-[var(--color-bg)] border border-[var(--color-border)] hover:border-[var(--color-muted)] text-sm font-medium text-[var(--color-text)] rounded-lg transition-colors flex items-center justify-center gap-2.5"
                    >
                        {/* Microsoft's four-square mark. No Calendars.Read here on purpose:
                            the panel is an admin surface that never reads a calendar — that
                            scope belongs to the rep apps (D-187). */}
                        <svg width="16" height="16" viewBox="0 0 23 23" aria-hidden="true"><path fill="#F25022" d="M0 0h11v11H0z"/><path fill="#7FBA00" d="M12 0h11v11H12z"/><path fill="#00A4EF" d="M0 12h11v11H0z"/><path fill="#FFB900" d="M12 12h11v11H12z"/></svg>
                        {t.common.continueWithMicrosoft}
                    </button>
                    <button
                        onClick={continueWithSso}
                        disabled={ssoChecking}
                        className="w-full py-2.5 bg-[var(--color-bg)] border border-[var(--color-border)] hover:border-[var(--color-muted)] disabled:opacity-50 text-sm font-medium text-[var(--color-text)] rounded-lg transition-colors"
                    >
                        {ssoChecking ? t.common.oneMoment : t.login.ssoButton}
                    </button>

                    <p className="text-center text-xs text-[var(--color-text-secondary)]">
                        {mode === "signin" ? t.login.noAccount : t.login.haveAccount}
                        <button
                            onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); setInfo(null) }}
                            className="text-[var(--color-accent)] hover:underline font-medium"
                        >
                            {mode === "signin" ? t.common.createOne : t.common.signIn}
                        </button>
                    </p>
                </>
                )}
                </div>

                <p className="text-center text-xs text-[var(--color-text-secondary)]">
                    {t.login.newTeam}{" "}
                    <a href="/start" className="text-[var(--color-accent-deep)] font-semibold hover:underline">
                        {t.login.startTrial}
                    </a>
                </p>
            </div>
        </div>
    )
}
