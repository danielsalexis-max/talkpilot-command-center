"use client"

import { useLocale } from "@/i18n/LocaleProvider"
import { LOCALES } from "@/i18n"

/// Compact EN / ES toggle. `variant="floating"` pins it to the corner of the
/// public pages (login, /start, accept-invite, reset-password); the default
/// inline variant sits in the sidebar next to the appearance toggle.
export function LocaleSwitcher({ variant = "inline" }: { variant?: "inline" | "floating" }) {
    const { locale, setLocale } = useLocale()

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
        return <div className="fixed bottom-4 right-4 z-50">{pill}</div>
    }
    return pill
}
