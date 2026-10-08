"use client"

// Consent screen for the TalkPilot MCP connector (D-538). Supabase Auth's
// OAuth 2.1 server sends the browser here with ?authorization_id=… when
// Claude or ChatGPT asks to connect. The person signs in (any way they can
// sign in to TalkPilot), sees who is asking and what it can do, and allows or
// denies. Supabase then redirects back to the AI app with the code.
//
// Public route (AppShell treats /oauth as public): no workspace, no billing
// gate. A B2C Pro user with no Teams workspace must be able to land here.

import { Suspense, useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useT } from "@/i18n/LocaleProvider"

type Details = {
    authorization_id: string
    redirect_uri: string
    client: { id: string; name: string; uri: string; logo_uri: string }
    user: { id: string; email: string }
    scope: string
}

function hostOf(uri: string): string {
    try { return new URL(uri).host } catch { return uri }
}

export default function ConsentPage() {
    return (
        <Suspense fallback={null}>
            <Consent />
        </Suspense>
    )
}

function Consent() {
    const t = useT().oauthConsent
    const params = useSearchParams()
    const authorizationId = params.get("authorization_id")

    const [phase, setPhase] = useState<"loading" | "signin" | "consent" | "redirecting" | "error">("loading")
    const [details, setDetails] = useState<Details | null>(null)
    const [isPro, setIsPro] = useState<boolean | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    // Sign-in form
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [codeSent, setCodeSent] = useState(false)
    const [code, setCode] = useState("")

    const load = useCallback(async () => {
        if (!authorizationId) { setPhase("error"); setError(t.missingRequest); return }
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setPhase("signin"); return }
        const { data, error: e } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId)
        if (e || !data) { setPhase("error"); setError(e?.message ?? t.expired); return }
        if ("redirect_url" in data && !("client" in data)) {
            // Already approved earlier: go straight back to the AI app.
            setPhase("redirecting")
            window.location.assign((data as { redirect_url: string }).redirect_url)
            return
        }
        setDetails(data as Details)
        const { data: p } = await supabase.from("user_profiles")
            .select("tier, pro_source, pro_expires_at").eq("id", user.id).maybeSingle()
        setIsPro(!!p && p.tier === "pro" && (p.pro_source === "stripe" || !p.pro_expires_at
            || new Date(p.pro_expires_at).getTime() + 3 * 86400_000 > Date.now()))
        setPhase("consent")
    }, [authorizationId, t])

    useEffect(() => {
        load()
        const { data: sub } = supabase.auth.onAuthStateChange((evt) => {
            if (evt === "SIGNED_IN") load()
        })
        return () => sub.subscription.unsubscribe()
    }, [load])

    const here = typeof window !== "undefined" ? window.location.href : ""

    async function oauth(provider: "google" | "azure") {
        setBusy(true)
        await supabase.auth.signInWithOAuth({
            provider,
            options: provider === "azure"
                ? { scopes: "openid profile email", redirectTo: here, queryParams: { prompt: "select_account" } }
                : { redirectTo: here, queryParams: { prompt: "select_account" } },
        })
    }

    async function passwordSignIn(e: React.FormEvent) {
        e.preventDefault()
        setBusy(true); setError(null)
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        setBusy(false)
        if (err) setError(err.message)
    }

    async function sendCode() {
        if (!email.trim()) { setError(t.enterEmailFirst); return }
        setBusy(true); setError(null)
        const { error: err } = await supabase.auth.signInWithOtp({
            email: email.trim(),
            // Connecting must never create an account: the AI app is asking
            // for an EXISTING TalkPilot account's data.
            options: { shouldCreateUser: false, emailRedirectTo: here },
        })
        setBusy(false)
        if (err) { setError(t.noAccountForEmail); return }
        setCodeSent(true)
    }

    async function verifyCode(e: React.FormEvent) {
        e.preventDefault()
        setBusy(true); setError(null)
        const { error: err } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" })
        setBusy(false)
        if (err) setError(t.badCode)
    }

    async function decide(allow: boolean) {
        if (!authorizationId) return
        setBusy(true); setError(null)
        const { data, error: err } = allow
            ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
            : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true })
        if (err || !data?.redirect_url) { setBusy(false); setError(err?.message ?? t.expired); return }
        setPhase("redirecting")
        window.location.assign(data.redirect_url)
    }

    async function switchAccount() {
        await supabase.auth.signOut({ scope: "local" })
        setDetails(null); setPhase("signin")
    }

    const input = "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
    const primary = "w-full rounded-lg bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
    const secondary = "w-full rounded-lg border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] disabled:opacity-50"

    return (
        <main className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center px-4 py-10">
            <div className="w-full max-w-sm space-y-6">
                <div className="text-center space-y-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/brand-mark.png" alt="" className="w-12 h-12 object-contain mx-auto" />
                    {phase === "consent" && details ? (
                        <h1 className="text-xl font-semibold text-[var(--color-text)]">{t.title(details.client.name || t.anAiApp)}</h1>
                    ) : (
                        <h1 className="text-xl font-semibold text-[var(--color-text)]">{t.signInTitle}</h1>
                    )}
                </div>

                {phase === "loading" && <p className="text-center text-sm text-[var(--color-muted)]">{t.loading}</p>}
                {phase === "redirecting" && <p className="text-center text-sm text-[var(--color-muted)]">{t.redirecting}</p>}

                {phase === "signin" && (
                    <div className="space-y-4">
                        <p className="text-sm text-center text-[var(--color-text-secondary)]">{t.signInSub}</p>
                        <button className={secondary} disabled={busy} onClick={() => oauth("google")}>{t.google}</button>
                        <button className={secondary} disabled={busy} onClick={() => oauth("azure")}>{t.microsoft}</button>
                        <div className="text-center text-xs text-[var(--color-muted)]">{t.or}</div>
                        <input className={input} type="email" autoComplete="email" placeholder={t.email}
                            value={email} onChange={e => setEmail(e.target.value)} />
                        {!codeSent ? (
                            <>
                                <form onSubmit={passwordSignIn} className="space-y-3">
                                    <input className={input} type="password" autoComplete="current-password" placeholder={t.password}
                                        value={password} onChange={e => setPassword(e.target.value)} />
                                    <button className={primary} disabled={busy || !email || !password}>{t.signIn}</button>
                                </form>
                                <button className="w-full text-sm text-[var(--color-accent)]" disabled={busy} onClick={sendCode}>
                                    {t.emailMeCode}
                                </button>
                                <p className="text-xs text-center text-[var(--color-muted)]">{t.appleHint}</p>
                            </>
                        ) : (
                            <form onSubmit={verifyCode} className="space-y-3">
                                <p className="text-sm text-[var(--color-text-secondary)]">{t.codeSent(email.trim())}</p>
                                <input className={input} inputMode="numeric" autoComplete="one-time-code" placeholder={t.code}
                                    value={code} onChange={e => setCode(e.target.value)} />
                                <button className={primary} disabled={busy || code.trim().length < 6}>{t.verify}</button>
                            </form>
                        )}
                    </div>
                )}

                {phase === "consent" && details && (
                    <div className="space-y-5">
                        {/* Dynamic registration means anyone can register an app with any
                            name. The redirect domain is the part a fake "Claude" can't fake. */}
                        <p className="rounded-lg bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">
                            {t.returnsTo} <span className="font-semibold text-[var(--color-text)]">{hostOf(details.redirect_uri)}</span>
                        </p>
                        <p className="text-sm text-[var(--color-text-secondary)]">{t.intro}</p>
                        <ul className="space-y-2 text-sm text-[var(--color-text)]">
                            {t.canDo.map(line => (
                                <li key={line} className="flex gap-2"><span aria-hidden>•</span><span>{line}</span></li>
                            ))}
                        </ul>
                        <p className="text-xs text-[var(--color-muted)]">{t.limits}</p>
                        {isPro === false && (
                            <p className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-[var(--color-text)]">{t.needsPro}</p>
                        )}
                        <div className="text-xs text-[var(--color-muted)]">
                            {t.signedInAs(details.user.email)}{" "}
                            <button className="text-[var(--color-accent)]" onClick={switchAccount}>{t.switchAccount}</button>
                        </div>
                        <div className="space-y-2">
                            <button className={primary} disabled={busy} onClick={() => decide(true)}>{t.allow}</button>
                            <button className={secondary} disabled={busy} onClick={() => decide(false)}>{t.deny}</button>
                        </div>
                        <p className="text-xs text-[var(--color-muted)]">{t.revokeHint}</p>
                    </div>
                )}

                {error && <p className="text-sm text-center text-red-500">{error}</p>}
            </div>
        </main>
    )
}
