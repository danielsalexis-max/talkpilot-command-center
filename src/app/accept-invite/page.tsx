"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

export default function AcceptInvitePage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">Checking invite…</div>}>
            <AcceptInviteContent />
        </Suspense>
    )
}

function AcceptInviteContent() {
    const params  = useSearchParams()
    const router  = useRouter()
    const token   = params.get("token") ?? ""
    const [status, setStatus] = useState<"loading" | "auth_required" | "accepting" | "done" | "error">("loading")
    const [message, setMessage] = useState("")
    const [email, setEmail]     = useState("")
    const [password, setPassword] = useState("")

    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) setStatus("auth_required")
            else acceptInvite()
        })
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
            const body = await res.json()
            if (res.ok) {
                setStatus("done")
                setTimeout(() => router.replace("/"), 2000)
            } else {
                setStatus("error")
                setMessage(body.error ?? "Failed to accept invite.")
            }
        } catch (e) {
            setStatus("error")
            setMessage((e as Error).message)
        }
    }

    async function signInAndAccept(e: React.FormEvent) {
        e.preventDefault()
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) { setMessage(error.message); return }
        acceptInvite()
    }

    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="w-full max-w-sm space-y-6 text-center">
                <h1 className="text-2xl font-semibold text-white">
                    TalkPilot <span className="text-[var(--color-accent)]">Teams</span>
                </h1>

                {status === "loading"    && <p className="text-slate-400 text-sm">Checking invite…</p>}
                {status === "accepting"  && <p className="text-slate-400 text-sm">Accepting invite…</p>}
                {status === "done"       && <p className="text-emerald-400 text-sm">You're in! Redirecting…</p>}
                {status === "error"      && <p className="text-red-400 text-sm">{message}</p>}

                {status === "auth_required" && (
                    <form onSubmit={signInAndAccept} className="space-y-4 text-left">
                        <p className="text-sm text-slate-400 text-center">Sign in to accept your invite</p>
                        <input
                            type="email" placeholder="Email" value={email}
                            onChange={e => setEmail(e.target.value)} required
                            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[var(--color-accent)]"
                        />
                        <input
                            type="password" placeholder="Password" value={password}
                            onChange={e => setPassword(e.target.value)} required
                            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[var(--color-accent)]"
                        />
                        {message && <p className="text-xs text-red-400">{message}</p>}
                        <button
                            type="submit"
                            className="w-full py-2.5 bg-[var(--color-accent)] hover:bg-[var(--color-accent-light)] text-white text-sm font-medium rounded-lg transition-colors"
                        >
                            Sign in and accept
                        </button>
                    </form>
                )}
            </div>
        </div>
    )
}
