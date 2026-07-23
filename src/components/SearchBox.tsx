"use client"

export function SearchBox({
    value, onChange, placeholder, className,
}: {
    value: string
    onChange: (v: string) => void
    placeholder?: string
    className?: string
}) {
    return (
        <div className={`relative ${className ?? "w-full sm:w-72"}`}>
            <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
            </svg>
            <input
                type="text"
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder ?? "Search…"}
                className="w-full pl-9 pr-8 py-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
            />
            {value && (
                <button
                    onClick={() => onChange("")}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                >×</button>
            )}
        </div>
    )
}
