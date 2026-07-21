"use client"

import Link from "next/link"
import type { Route } from "next"
import { usePathname } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useEffect, useState } from "react"

/// Client-side chrome (nav header, auth state) — split out of the root layout
/// so layout.tsx can stay a server component and export metadata.
export default function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const [email, setEmail] = useState<string | null>(null)
    const isPublic = pathname === "/login" || pathname.startsWith("/accept-invite")

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null))
    }, [])

    const nav: { href: Route; label: string }[] = [
        { href: "/",         label: "Overview" },
        { href: "/team",     label: "Team"     },
        { href: "/insights", label: "Insights" },
        { href: "/admin",    label: "Admin"    },
    ]

    return (
        <>
            {!isPublic && (
                <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)] sticky top-0 z-50 shadow-sm">
                    <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
                        <div className="flex items-center gap-8">
                            <Link href="/" className="flex items-center gap-2 font-semibold text-gray-900 tracking-tight">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src="/icon.png" alt="" className="w-6 h-6" />
                                TalkPilot <span className="text-[var(--color-accent)]">Teams</span>
                            </Link>
                            <nav className="flex items-center gap-1">
                                {nav.map(n => (
                                    <Link
                                        key={n.href}
                                        href={n.href}
                                        className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                                            pathname === n.href
                                                ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent)] font-medium"
                                                : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                                        }`}
                                    >
                                        {n.label}
                                    </Link>
                                ))}
                            </nav>
                        </div>
                        <div className="flex items-center gap-3">
                            {email && <span className="text-xs text-gray-400">{email}</span>}
                            <button
                                onClick={() => supabase.auth.signOut().then(() => { window.location.href = "/login" })}
                                className="text-xs text-gray-500 hover:text-gray-900 transition-colors"
                            >
                                Sign out
                            </button>
                        </div>
                    </div>
                </header>
            )}
            <main className={!isPublic ? "max-w-7xl mx-auto px-6 py-8" : ""}>
                {children}
            </main>
        </>
    )
}
