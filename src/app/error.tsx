"use client"

import { useEffect } from "react"
import { clientDict } from "@/i18n"
import { reportError } from "@/lib/teamsAnalytics"

/// Route-level error boundary (D-700): a page that throws during render lands
/// here instead of on a blank screen. The error goes to PostHog as an
/// `$exception` (source: error_boundary); the layout, nav and locale survive,
/// so the person can retry the page or leave. Text comes from the dictionary
/// of whatever the browser is showing (cookie → navigator.language → en).
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    const t = clientDict().errorPage
    useEffect(() => { reportError(error, { digest: error.digest, boundary: "route" }) }, [error])
    return (
        <div className="min-h-[50vh] flex items-center justify-center p-6">
            <div className="max-w-md w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 space-y-4 text-center">
                <h1 className="text-xl font-semibold text-[var(--color-text)]">{t.title}</h1>
                <p className="text-sm text-[var(--color-text-secondary)]">{t.body}</p>
                <div className="flex flex-wrap justify-center gap-3 pt-2">
                    <button onClick={reset}
                        className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-light)] transition-colors">
                        {t.retry}
                    </button>
                    <a href="/"
                        className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-hover)] transition-colors">
                        {t.home}
                    </a>
                </div>
            </div>
        </div>
    )
}
