"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useT } from "@/i18n/LocaleProvider"

/// Landing page for Supabase password-recovery links (D-163). The recovery
/// token in the URL gives this page a temporary session; setting a new
/// password completes it and signs the user in.
export default function ResetPasswordPage() {
    const router = useRouter()
    const t = useT()
    const [ready, setReady]       = useState(false)
    const [password, setPassword] = useState("")
    const [confirm, setConfirm]   = useState("")
    const [error, setError]       = useState<string | null>(null)
    const [busy, setBusy]         = useState(false)

    useEffect(() => {
        // The client exchanges the recovery token automatically; wait for it.
        supabase.auth.getSession().then(({ data }) => setReady(!!data.session))
        const { data: sub } = supabase.auth.onAuthStateChange((event) => {
            if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true)
        })
        return () => sub.subscription.unsubscribe()
    }, [])

    async function submit(e: React.FormEvent) {
        e.preventDefault(); setError(null)
        if (password !== confirm) { setError(t.common.passwordsDontMatch); return }
        setBusy(true)
        const { error: err } = await supabase.auth.updateUser({ password })
        setBusy(false)
        if (err) { setError(err.message); return }
        router.replace("/")
    }

    return (
        <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center px-4">
            <div className="w-full max-w-sm">
                <h1 className="font-display text-xl font-bold text-[var(--color-text)] text-center">{t.resetPassword.title}</h1>
                <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6 shadow-sm mt-5">
                    {!ready ? (
                        <p className="text-sm text-[var(--color-text-secondary)] text-center">
                            {t.resetPassword.checking}
                        </p>
                    ) : (
                        <form onSubmit={submit} className="space-y-3">
                            <input type="password" required minLength={8} placeholder={t.resetPassword.newPassword}
                                value={password} onChange={e => setPassword(e.target.value)}
                                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)]" />
                            <input type="password" required placeholder={t.resetPassword.confirmNew}
                                value={confirm} onChange={e => setConfirm(e.target.value)}
                                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)]" />
                            {error && <p className="text-xs text-red-600">{error}</p>}
                            <button type="submit" disabled={busy}
                                className="w-full py-2.5 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] disabled:opacity-40 text-[var(--btn-ink)] text-sm font-semibold rounded-lg transition-colors">
                                {busy ? t.common.saving : t.resetPassword.submit}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    )
}
