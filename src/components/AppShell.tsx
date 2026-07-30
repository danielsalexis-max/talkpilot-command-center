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
    const [menuOpen, setMenuOpen] = useState(false)
    const isPublic = pathname === "/login" || pathname.startsWith("/accept-invite")

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null))
    }, [])

    // Close the mobile drawer on route change.
    useEffect(() => { setMenuOpen(false) }, [pathname])

    const nav: { href: Route; label: string }[] = [
        { href: "/",         label: "Overview" },
        { href: "/team",     label: "Team"     },
        { href: "/insights", label: "Insights" },
        { href: "/admin",    label: "Admin"    },
    ]

    const NavLink = ({ n, mobile = false }: { n: { href: Route; label: string }; mobile?: boolean }) => {
        const isActive = pathname === n.href
        const isAdmin  = n.href === "/admin"
        // Admin is the org-setup hub — give it a persistent accent
        // treatment so owners can always find it, even when inactive.
        if (isAdmin) {
            return (
                <Link
                    href={n.href}
                    className={`${mobile ? "" : "ml-2"} inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                        isActive
                            ? "bg-[var(--color-accent)] text-white border-[var(--color-accent)] shadow-sm"
                            : "text-[var(--color-accent)] border-[var(--color-accent)] hover:bg-[var(--color-accent-subtle)]"
                    }`}
                >
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {n.label}
                </Link>
            )
        }
        return (
            <Link
                href={n.href}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors ${mobile ? "block" : ""} ${
                    isActive
                        ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent)] font-medium"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                }`}
            >
                {n.label}
            </Link>
        )
    }

    return (
        <>
            {!isPublic && (
                <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)] sticky top-0 z-50 shadow-sm">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
                        <div className="flex items-center gap-8 min-w-0">
                            <Link href="/" className="flex items-center gap-2 font-semibold text-gray-900 tracking-tight shrink-0">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src="/icon.png" alt="" className="w-6 h-6" />
                                <span className="whitespace-nowrap">TalkPilot <span className="text-[var(--color-accent)]">Teams</span></span>
                            </Link>
                            <nav className="hidden md:flex items-center gap-1">
                                {nav.map(n => <NavLink key={n.href} n={n} />)}
                            </nav>
                        </div>
                        <div className="flex items-center gap-3">
                            {email && <span className="hidden lg:inline text-xs text-gray-400">{email}</span>}
                            <button
                                onClick={() => supabase.auth.signOut().then(() => { window.location.href = "/login" })}
                                className="hidden md:inline text-xs text-gray-500 hover:text-gray-900 transition-colors"
                            >
                                Sign out
                            </button>
                            <button
                                onClick={() => setMenuOpen(o => !o)}
                                aria-label="Toggle menu"
                                aria-expanded={menuOpen}
                                className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-md text-gray-600 hover:bg-gray-100 transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    {menuOpen
                                        ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />}
                                </svg>
                            </button>
                        </div>
                    </div>
                    {menuOpen && (
                        <nav className="md:hidden border-t border-[var(--color-border)] px-4 py-3 space-y-1">
                            {nav.map(n => <NavLink key={n.href} n={n} mobile />)}
                            <div className="pt-2 mt-2 border-t border-[var(--color-border)] flex items-center justify-between">
                                {email && <span className="text-xs text-gray-400 truncate">{email}</span>}
                                <button
                                    onClick={() => supabase.auth.signOut().then(() => { window.location.href = "/login" })}
                                    className="text-xs text-gray-500 hover:text-gray-900 transition-colors shrink-0"
                                >
                                    Sign out
                                </button>
                            </div>
                        </nav>
                    )}
                </header>
            )}
            <main className={!isPublic ? "max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8" : ""}>
                {children}
            </main>
        </>
    )
}
