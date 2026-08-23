"use client"

import { useT } from "@/i18n/LocaleProvider"

export function SearchBox({
    value, onChange, placeholder, className,
}: {
    value: string
    onChange: (v: string) => void
    placeholder?: string
    className?: string
}) {
    const t = useT()
    return (
        <div className={`relative ${className ?? "w-full sm:w-72"}`}>
            <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-muted)] pointer-events-none"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
            </svg>
            <input
                type="text"
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder ?? t.common.search}
                className="w-full pl-9 pr-8 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
            />
            {value && (
                <button
                    onClick={() => onChange("")}
                    aria-label={t.common.clearSearch}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-hover)] transition-colors"
                >×</button>
            )}
        </div>
    )
}
