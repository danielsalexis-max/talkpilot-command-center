"use client"

// Where OAuth callbacks land the browser after a connect attempt (D-332 F1).
// The Supabase edge callbacks 302 here because the shared *.supabase.co
// functions domain refuses to render HTML (anti-phishing), and a bare redirect
// into talkpilot:// left the provider's consent tab spinning forever.
//
// Public page — no session exists in this browser; the connect happened in the
// native app. Query params: provider, status (success|error), scheme (app
// deep-link scheme, validated against the app's own scheme family).

import { useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { useT } from "@/i18n/LocaleProvider"

// Mirrors SCHEME_RE in the edge functions' _shared/integrationState.ts, so a
// crafted link can't make this page deep-link into an arbitrary app.
const SCHEME_RE = /^(talkpilot|co\.talkpilot)[a-z0-9.-]*$/

const PROVIDER_LABELS: Record<string, string> = {
    slack: "Slack",
    hubspot: "HubSpot",
    salesforce: "Salesforce",
    monday: "monday.com",
    google: "Google",
    microsoft: "Microsoft",
}

export default function ConnectedPage() {
    return (
        <Suspense fallback={null}>
            <ConnectedContent />
        </Suspense>
    )
}

function ConnectedContent() {
    const t = useT()
    const params = useSearchParams()

    const providerKey = (params.get("provider") ?? "").toLowerCase()
    const provider = PROVIDER_LABELS[providerKey] ?? "TalkPilot"
    const ok = params.get("status") !== "error"

    const schemeParam = params.get("scheme") ?? "talkpilot"
    const scheme = SCHEME_RE.test(schemeParam) ? schemeParam : "talkpilot"
    const deepLink = `${scheme}://oauth-callback?provider=${encodeURIComponent(providerKey)}&success=${ok}`

    // Best-effort app foregrounding; harmless when the browser blocks it.
    useEffect(() => {
        if (!ok) return
        const id = setTimeout(() => { window.location.href = deepLink }, 400)
        return () => clearTimeout(id)
    }, [ok, deepLink])

    return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] px-4">
            <div className="w-full max-w-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl px-10 py-11 text-center shadow-sm">
                <div
                    className="w-14 h-14 rounded-full mx-auto mb-5 flex items-center justify-center text-2xl text-white"
                    style={{ background: ok ? "var(--color-accent)" : "#C4534A" }}
                >
                    {ok ? "✓" : "✕"}
                </div>
                <h1 className="text-lg font-semibold text-[var(--color-text)] mb-2">
                    {ok ? t.connected.successTitle(provider) : t.connected.failTitle(provider)}
                </h1>
                <p className="text-sm text-[var(--color-muted)] leading-relaxed mb-6">
                    {ok ? t.connected.successBody : t.connected.failBody}
                </p>
                <a
                    href={deepLink}
                    className="inline-block px-6 py-2.5 rounded-full bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] text-[var(--btn-ink)] text-sm font-semibold transition-colors"
                >
                    {t.connected.backToApp}
                </a>
                <div className="mt-7 text-[11px] font-semibold tracking-[0.08em] text-[var(--color-muted)]">
                    TALKPILOT
                </div>
            </div>
        </div>
    )
}
