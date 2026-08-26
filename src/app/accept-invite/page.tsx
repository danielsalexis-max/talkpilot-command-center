"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { useT } from "@/i18n/LocaleProvider"
import type { Dict } from "@/i18n"

const MAC_RELEASES_API  = "https://api.github.com/repos/danielsalexis-max/talkpilot-releases/releases/latest"
const MAC_RELEASES_PAGE = "https://github.com/danielsalexis-max/talkpilot-releases/releases/latest"
const IOS_APP_STORE     = "https://apps.apple.com/app/id6763953639"
// Android is live on Play since 2026-08-23, so Play is the install path.
// The signed APK on GitHub stays the SIDELOAD channel for Teams (a different
// signing key — an upload-key build will not install over a sideload), and is
// only offered when Play is not an option.
const ANDROID_PLAY_STORE = "https://play.google.com/store/apps/details?id=co.talkpilot.android"

const INPUT = "w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
const BTN   = "w-full py-2.5 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] text-[var(--btn-ink)] text-sm font-medium rounded-lg transition-colors disabled:opacity-60"

type Platform = "mac" | "ios" | "android" | "windows" | "other"

type InvitePreview = {
    valid: boolean
    reason?: "invalid" | "expired" | "used"
    org_name?: string
    role?: string
    email_hint?: string
}

// Resolved before sign-up so nobody is asked to create an account for an
// organization the page won't name, or for a link that is already dead.
function previewError(t: Dict, reason: InvitePreview["reason"]): string {
    switch (reason) {
        case "expired": return t.acceptInvite.expiredLink
        case "used":    return t.acceptInvite.usedLink
        default:        return t.acceptInvite.invalidLink
    }
}

function detectPlatform(): Platform {
    if (typeof navigator === "undefined") return "other"
    const ua = navigator.userAgent
    if (/iPhone|iPad|iPod/.test(ua)) return "ios"
    if (/Android/.test(ua)) return "android"
    if (/Macintosh/.test(ua)) return "mac"
    if (/Windows/.test(ua)) return "windows"
    return "other"
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
    const [status, setStatus]   = useState<"loading" | "auth_required" | "confirm_email" | "accepting" | "done" | "error">("loading")
    const [message, setMessage] = useState("")
    const [mode, setMode]       = useState<"signup" | "signin">("signup")
    const [email, setEmail]     = useState("")
    const [password, setPassword] = useState("")
    const [busy, setBusy]       = useState(false)
    const [preview, setPreview] = useState<InvitePreview | null>(null)

    useEffect(() => {
        let cancelled = false

        async function boot() {
            if (!token) { setStatus("error"); setMessage(t.acceptInvite.invalidLink); return }

            // Who invited you, and to what — resolved before the sign-up form so the
            // page can name the organization and stop a dead link early.
            try {
                const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
                const res = await fetch(`${supabaseUrl}/functions/v1/invite-preview`, {
                    method:  "POST",
                    headers: { "Content-Type": "application/json" },
                    body:    JSON.stringify({ token }),
                })
                const p = (await res.json()) as InvitePreview
                if (cancelled) return
                setPreview(p)
                if (!p.valid) {
                    setStatus("error")
                    setMessage(previewError(t, p.reason))
                    return
                }
            } catch {
                // The preview is context, not a gate. If it fails, carry on and let
                // accept-invite stay the authority on whether the token is good.
            }

            const { data: { user } } = await supabase.auth.getUser()
            if (cancelled) return
            if (!user) setStatus("auth_required")
            else acceptInvite()
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
            } else {
                setStatus("error")
                setMessage(body.error?.message ?? body.error ?? t.acceptInvite.acceptFailed)
            }
        } catch (e) {
            setStatus("error")
            setMessage((e as Error).message)
        }
    }

    async function googleAuth() {
        setMessage("")
        await supabase.auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo: window.location.href },
        })
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
                                onChange={e => setEmail(e.target.value)} className={INPUT} />
                            <input type="password" placeholder={mode === "signup" ? t.acceptInvite.choosePassword : t.common.password}
                                value={password} required minLength={6}
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
                        <button type="button" onClick={googleAuth}
                            className="w-full py-2.5 bg-[var(--color-bg)] border border-[var(--color-border)] hover:border-[var(--color-muted)] text-sm font-medium text-[var(--color-text)] rounded-lg transition-colors flex items-center justify-center gap-2.5">
                            <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.4 28.7a14.5 14.5 0 0 1 0-9.4l-7.8-6.1a24 24 0 0 0 0 21.6l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.5-5.8c-2.1 1.4-4.7 2.3-7.7 2.3-6.3 0-11.7-3.7-13.6-9l-7.8 6.1C6.6 42.6 14.6 48 24 48z"/></svg>
                            {t.common.continueWithGoogle}
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

function GetTheAppScreen() {
    const t = useT()
    const [platform] = useState<Platform>(detectPlatform)
    const [macUrl, setMacUrl] = useState(MAC_RELEASES_PAGE)
    const [androidApk, setAndroidApk] = useState<string | null>(null)

    useEffect(() => {
        // Resolve the direct Mac download from the latest GitHub release, falling
        // back to the release page. The .apk is picked up too, but only as the
        // secondary sideload link under the Play Store row.
        fetch(MAC_RELEASES_API)
            .then(r => r.json())
            .then(rel => {
                const dmg = rel.assets?.find((a: { name: string }) => a.name.endsWith(".dmg"))
                if (dmg?.browser_download_url) setMacUrl(dmg.browser_download_url)
                const apk = rel.assets?.find((a: { name: string }) => a.name.endsWith(".apk"))
                if (apk?.browser_download_url) setAndroidApk(apk.browser_download_url)
            })
            .catch(() => {})
    }, [])

    const rows: { key: Platform; label: string; sub: string; href?: string; soon?: boolean; altHref?: string; altLabel?: string }[] = [
        { key: "mac",     label: "Mac",     sub: t.acceptInvite.macSub, href: macUrl },
        { key: "ios",     label: "iPhone",  sub: t.acceptInvite.iosSub, href: IOS_APP_STORE },
        { key: "android", label: "Android", sub: t.acceptInvite.androidPlaySub, href: ANDROID_PLAY_STORE,
          altHref: androidApk ?? undefined, altLabel: t.acceptInvite.androidApkLink },
        { key: "windows", label: "Windows", sub: t.acceptInvite.comingSoon, soon: true },
    ]
    // Detected platform first
    rows.sort((a, b) => (a.key === platform ? -1 : 0) - (b.key === platform ? -1 : 0))

    const primary = rows[0].key === platform && !rows[0].soon ? rows[0] : null

    return (
        <div className="space-y-4">
            <div className="text-center space-y-1">
                <p className="text-emerald-600 text-sm font-medium">{t.acceptInvite.onTheTeam}</p>
                <h2 className="text-lg font-semibold text-[var(--color-text)]">{t.acceptInvite.getTheApp}</h2>
                <p className="text-sm text-[var(--color-text-secondary)]">
                    {t.acceptInvite.getTheAppSub}
                </p>
            </div>

            {primary && (
                <a href={primary.href} target="_blank" rel="noopener noreferrer"
                    className="block w-full py-3 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] text-[var(--btn-ink)] text-sm font-semibold rounded-xl transition-colors text-center">
                    {primary.key === "mac" ? t.acceptInvite.downloadMac : t.acceptInvite.getAppStore}
                </a>
            )}

            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl divide-y divide-[var(--color-border)] shadow-sm">
                {rows.map(r => (
                    <div key={r.key} className="flex items-center justify-between px-4 py-3">
                        <div>
                            <p className="text-sm font-medium text-[var(--color-text)]">{r.label}
                                {r.key === platform && <span className="ml-2 text-xs text-[var(--color-accent)]">{t.acceptInvite.thisDevice}</span>}
                            </p>
                            <p className="text-xs text-[var(--color-text-secondary)]">{r.sub}</p>
                            {r.altHref && (
                                <a href={r.altHref} target="_blank" rel="noopener noreferrer"
                                    className="text-[11px] text-[var(--color-muted)] hover:text-[var(--color-text-secondary)] underline">
                                    {r.altLabel}
                                </a>
                            )}
                        </div>
                        {r.soon ? (
                            <span className="text-xs text-[var(--color-muted)] border border-[var(--color-border)] rounded-full px-2.5 py-1">{t.acceptInvite.soon}</span>
                        ) : (
                            <a href={r.href} target="_blank" rel="noopener noreferrer"
                                className="text-xs font-medium text-[var(--color-accent)] border border-[var(--color-accent)] rounded-lg px-3 py-1.5 hover:bg-teal-50 transition-colors">
                                {r.key === "mac" ? t.acceptInvite.download
                                 : r.key === "android" ? t.acceptInvite.playStore
                                 : t.acceptInvite.appStore}
                            </a>
                        )}
                    </div>
                ))}
            </div>

            <p className="text-xs text-[var(--color-muted)] text-center">
                {t.acceptInvite.sameCredentials}
            </p>

            <div className="text-center">
                <Link href="/" className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)] underline underline-offset-2">
                    {t.acceptInvite.managerLink}
                </Link>
            </div>
        </div>
    )
}
