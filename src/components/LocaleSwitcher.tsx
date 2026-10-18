"use client"

import { useEffect, useState } from "react"
import { useLocale } from "@/i18n/LocaleProvider"
import { LOCALES } from "@/i18n"
import { setSkinPref } from "@/lib/skin"

/// Compact EN / ES toggle. `variant="floating"` pins it to the corner of the
/// public pages (login, /start, accept-invite, reset-password) and carries a
/// light/dark toggle beside it (D-615) — the skin otherwise follows the OS
/// (src/lib/skin.ts) and public visitors had no way to override it; the
/// in-app override lives in the sidebar. The default inline variant sits in
/// the sidebar next to the appearance toggle.
export function LocaleSwitcher({ variant = "inline" }: { variant?: "inline" | "floating" }) {
    const { locale, setLocale } = useLocale()
    const [dark, setDark] = useState(false)
    useEffect(() => { setDark(document.documentElement.dataset.skin === "dark") }, [])

    const pill = (
        <div
            className={`inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5 ${
                variant === "floating" ? "shadow-md" : ""
            }`}
            role="group"
            aria-label="Language"
        >
            {LOCALES.map(l => (
                <button
                    key={l}
                    type="button"
                    onClick={() => setLocale(l)}
                    aria-pressed={locale === l}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                        locale === l
                            ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent-deep)]"
                            : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
                    }`}
                >
                    {l.toUpperCase()}
                </button>
            ))}
        </div>
    )

    if (variant === "floating") {
        const toggle = () => {
            const next = !dark
            setSkinPref(next ? "dark" : "light")
            setDark(next)
        }
        return (
            <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2">
                <button
                    type="button"
                    onClick={toggle}
                    aria-label={dark ? "Light mode" : "Dark mode"}
                    title={dark ? "Light mode" : "Dark mode"}
                    className="w-[30px] h-[30px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-md flex items-center justify-center text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
                >
                    {dark ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                            <circle cx="12" cy="12" r="4.5" />
                            <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" />
                        </svg>
                    ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z" />
                        </svg>
                    )}
                </button>
                {pill}
            </div>
        )
    }
    return pill
}
