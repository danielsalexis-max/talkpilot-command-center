"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

export default function LoginPage() {
    const router = useRouter()
    const [mode, setMode]         = useState<"signin" | "signup">("signin")
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
            setError("Passwords don't match.")
            return
        }

        setLoading(true)
        try {
            if (mode === "signin") {
                const { error: authErr } = await supabase.auth.signInWithPassword({ email, password })
                if (authErr) { setError(authErr.message); return }
                router.replace("/")
            } else {
                const { error: authErr } = await supabase.auth.signUp({ email, password })
                if (authErr) { setError(authErr.message); return }
                setInfo("Account created! Check your email to confirm, or sign in now if email confirmation is disabled.")
                setMode("signin"); setPassword(""); setConfirm("")
            }
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center">
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
                    <p className="text-sm text-gray-500 mt-1">Command Center</p>
                </div>

                <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6 shadow-sm space-y-4">
                    <form onSubmit={handleSubmit} className="space-y-3">
                        <input
                            type="email"
                            placeholder="Email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                        />
                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                        />
                        {mode === "signup" && (
                            <input
                                type="password"
                                placeholder="Confirm password"
                                value={confirm}
                                onChange={e => setConfirm(e.target.value)}
                                required
                                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                            />
                        )}
                        {error && <p className="text-xs text-red-600">{error}</p>}
                        {info  && <p className="text-xs text-emerald-600">{info}</p>}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-2.5 bg-[var(--color-accent)] hover:bg-[var(--color-accent-light)] disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors"
                        >
                            {loading
                                ? (mode === "signin" ? "Signing in…" : "Creating account…")
                                : (mode === "signin" ? "Sign in" : "Create account")}
                        </button>
                    </form>

                    <p className="text-center text-xs text-gray-500">
                        {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
                        <button
                            onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); setInfo(null) }}
                            className="text-[var(--color-accent)] hover:underline font-medium"
                        >
                            {mode === "signin" ? "Create one" : "Sign in"}
                        </button>
                    </p>
                </div>
            </div>
        </div>
    )
}
