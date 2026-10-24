"use client"

import { useEffect } from "react"
import { clientDict, clientLocale } from "@/i18n"
import { reportError } from "@/lib/teamsAnalytics"

/// Root error boundary (D-701): catches what the root layout itself throws,
/// where error.tsx cannot help. It replaces <html> and <body>, so nothing
/// from globals.css or the fonts is guaranteed — styles are inline on purpose.
/// The error is reported to PostHog the same way as the route boundary.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    const t = clientDict().errorPage
    useEffect(() => { reportError(error, { digest: error.digest, boundary: "global" }) }, [error])
    return (
        <html lang={clientLocale()}>
            <body style={{ margin: 0, fontFamily: "Inter, system-ui, -apple-system, sans-serif", background: "#F6FAF8", color: "#0E182B" }}>
                <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
                    <div style={{ maxWidth: 420, width: "100%", background: "#FFFFFF", border: "1px solid #E2E8E5", borderRadius: 12, padding: 24, textAlign: "center" }}>
                        <h1 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 12px" }}>{t.title}</h1>
                        <p style={{ fontSize: 14, color: "#4A5568", margin: "0 0 20px" }}>{t.body}</p>
                        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
                            <button onClick={reset}
                                style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#0C9482", color: "#FFFFFF", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
                                {t.retry}
                            </button>
                            <a href="/"
                                style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #E2E8E5", color: "#0E182B", fontSize: 14, fontWeight: 500, textDecoration: "none" }}>
                                {t.home}
                            </a>
                        </div>
                    </div>
                </div>
            </body>
        </html>
    )
}
