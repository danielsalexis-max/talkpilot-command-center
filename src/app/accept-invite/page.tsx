"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"

const MAC_RELEASES_API  = "https://api.github.com/repos/danielsalexis-max/talkpilot-releases/releases/latest"
const MAC_RELEASES_PAGE = "https://github.com/danielsalexis-max/talkpilot-releases/releases/latest"
const IOS_APP_STORE     = "https://apps.apple.com/app/id6763953639"

const INPUT = "w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
const BTN   = "w-full py-2.5 bg-[var(--color-accent)] hover:bg-[var(--color-accent-light)] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"

type Platform = "mac" | "ios" | "android" | "windows" | "other"

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
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">Checking invite…</div>}>
            <AcceptInviteContent />
        </Suspense>
    )
}

function AcceptInviteContent() {
    const params = useSearchParams()
    const token  = params.get("token") ?? ""
    const [status, setStatus]   = useState<"loading" | "auth_required" | "confirm_email" | "accepting" | "done" | "error">("loading")
    const [message, setMessage] = useState("")
    const [mode, setMode]       = useState<"signup" | "signin">("signup")
    const [email, setEmail]     = useState("")
    const [password, setPassword] = useState("")
    const [busy, setBusy]       = useState(false)

    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) setStatus("auth_required")
            else acceptInvite()
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token])

    async function acceptInvite() {
        if (!token) { setStatus("error"); setMessage("Invalid invite link."); return }
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
                setMessage(body.error?.message ?? body.error ?? "Failed to accept invite.")
            }
        } catch (e) {
            setStatus("error")
            setMessage((e as Error).message)
        }
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
                    <div className="w-12 h-12 bg-[var(--color-accent)] rounded-2xl mx-auto mb-4 flex items-center justify-center">
                        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-semibold text-gray-900">
                        TalkPilot <span className="text-[var(--color-accent)]">Teams</span>
                    </h1>
                </div>

                {status === "loading"   && <p className="text-gray-500 text-sm text-center">Checking invite…</p>}
                {status === "accepting" && <p className="text-gray-500 text-sm text-center">Accepting invite…</p>}

                {status === "error" && (
                    <div className="text-center space-y-3">
                        <p className="text-red-600 text-sm">{message}</p>
                        <p className="text-xs text-gray-400">Ask your admin to re-send the invite if the link expired.</p>
                    </div>
                )}

                {status === "confirm_email" && (
                    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 text-center space-y-2 shadow-sm">
                        <p className="text-sm font-semibold text-gray-900">Confirm your email</p>
                        <p className="text-sm text-gray-500">
                            We sent a confirmation link to <span className="font-medium text-gray-700">{email}</span>.
                            Confirm it, then open this invite link again to join your team.
                        </p>
                    </div>
                )}

                {status === "auth_required" && (
                    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 space-y-4 shadow-sm">
                        <div className="flex rounded-lg bg-[var(--color-bg)] p-1">
                            {(["signup", "signin"] as const).map(m => (
                                <button key={m} type="button" onClick={() => { setMode(m); setMessage("") }}
                                    className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${
                                        mode === m ? "bg-[var(--color-surface)] text-gray-900 font-medium shadow-sm" : "text-gray-500"
                                    }`}>
                                    {m === "signup" ? "Create account" : "Sign in"}
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-gray-500 text-center">
                            {mode === "signup"
                                ? "New to TalkPilot? Create your account to accept the invite."
                                : "Already have a TalkPilot account? Sign in to accept."}
                        </p>
                        <form onSubmit={submitAuth} className="space-y-3">
                            <input type="email" placeholder="Work email" value={email} required
                                onChange={e => setEmail(e.target.value)} className={INPUT} />
                            <input type="password" placeholder={mode === "signup" ? "Choose a password" : "Password"}
                                value={password} required minLength={6}
                                onChange={e => setPassword(e.target.value)} className={INPUT} />
                            {message && <p className="text-xs text-red-600">{message}</p>}
                            <button type="submit" disabled={busy} className={BTN}>
                                {busy ? "One moment…" : mode === "signup" ? "Create account & accept invite" : "Sign in & accept invite"}
                            </button>
                        </form>
                    </div>
                )}

                {status === "done" && <GetTheAppScreen />}
            </div>
        </div>
    )
}

// ─── Post-accept: download the app ───────────────────────────────────────────

function GetTheAppScreen() {
    const [platform] = useState<Platform>(detectPlatform)
    const [macUrl, setMacUrl] = useState(MAC_RELEASES_PAGE)

    useEffect(() => {
        // Resolve the direct .dmg link from the latest GitHub release; fall back to the release page
        fetch(MAC_RELEASES_API)
            .then(r => r.json())
            .then(rel => {
                const dmg = rel.assets?.find((a: { name: string }) => a.name.endsWith(".dmg"))
                if (dmg?.browser_download_url) setMacUrl(dmg.browser_download_url)
            })
            .catch(() => {})
    }, [])

    const rows: { key: Platform; label: string; sub: string; href?: string; soon?: boolean }[] = [
        { key: "mac",     label: "Mac",     sub: "Download the desktop app (.dmg)", href: macUrl },
        { key: "ios",     label: "iPhone",  sub: "Get TalkPilot AI on the App Store", href: IOS_APP_STORE },
        { key: "android", label: "Android", sub: "Coming soon", soon: true },
        { key: "windows", label: "Windows", sub: "Coming soon", soon: true },
    ]
    // Detected platform first
    rows.sort((a, b) => (a.key === platform ? -1 : 0) - (b.key === platform ? -1 : 0))

    const primary = rows[0].key === platform && !rows[0].soon ? rows[0] : null

    return (
        <div className="space-y-4">
            <div className="text-center space-y-1">
                <p className="text-emerald-600 text-sm font-medium">✓ You're on the team!</p>
                <h2 className="text-lg font-semibold text-gray-900">Now get the TalkPilot app</h2>
                <p className="text-sm text-gray-500">
                    TalkPilot runs on your Mac or iPhone during your conversations — that's where the magic happens.
                </p>
            </div>

            {primary && (
                <a href={primary.href} target="_blank" rel="noopener noreferrer"
                    className="block w-full py-3 bg-[var(--color-accent)] hover:bg-[var(--color-accent-light)] text-white text-sm font-semibold rounded-xl transition-colors text-center">
                    {primary.key === "mac" ? "Download TalkPilot for Mac" : "Get TalkPilot on the App Store"}
                </a>
            )}

            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl divide-y divide-[var(--color-border)] shadow-sm">
                {rows.map(r => (
                    <div key={r.key} className="flex items-center justify-between px-4 py-3">
                        <div>
                            <p className="text-sm font-medium text-gray-900">{r.label}
                                {r.key === platform && <span className="ml-2 text-xs text-[var(--color-accent)]">(this device)</span>}
                            </p>
                            <p className="text-xs text-gray-500">{r.sub}</p>
                        </div>
                        {r.soon ? (
                            <span className="text-xs text-gray-400 border border-[var(--color-border)] rounded-full px-2.5 py-1">Soon</span>
                        ) : (
                            <a href={r.href} target="_blank" rel="noopener noreferrer"
                                className="text-xs font-medium text-[var(--color-accent)] border border-[var(--color-accent)] rounded-lg px-3 py-1.5 hover:bg-indigo-50 transition-colors">
                                {r.key === "mac" ? "Download" : "App Store"}
                            </a>
                        )}
                    </div>
                ))}
            </div>

            <p className="text-xs text-gray-400 text-center">
                Sign in to the app with the same email and password you just used.
            </p>

            <div className="text-center">
                <Link href="/" className="text-xs text-gray-500 hover:text-gray-900 underline underline-offset-2">
                    Manager or admin? Open the Command Center instead
                </Link>
            </div>
        </div>
    )
}
