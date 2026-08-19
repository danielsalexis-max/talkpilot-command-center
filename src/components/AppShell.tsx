"use client"

import Link from "next/link"
import type { Route } from "next"
import { usePathname } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useEffect, useState } from "react"
import { applySkin, getSkinPref, setSkinPref, watchSystemSkin } from "@/lib/skin"

/// Client-side chrome — the Boardroom sidebar. Split out of the root layout so
/// layout.tsx can stay a server component and export metadata.
///
/// IA (D-162): Home / Calls / Team / Coaching / Insights / Playbook / Settings.
/// The old flat top-nav + "Admin" gear is gone: the coaching library lives
/// under Playbook, org administration under Settings.

interface NavItem { href: Route; label: string; icon: React.ReactNode; match: (p: string) => boolean }

const ICONS = {
    home: <path strokeLinecap="round" strokeLinejoin="round" d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5" />,
    calls: <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16v12H9l-5 4V5z" />,
    team: (
        <>
            <circle cx="9" cy="8" r="3.2" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5M16 5.5a3 3 0 0 1 0 5.5M17.5 15.2c1.9.6 3 2 3 4.8" />
        </>
    ),
    coaching: (
        <>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v3M12 18v3M3 12h3M18 12h3" />
            <circle cx="12" cy="12" r="5" />
        </>
    ),
    insights: <path strokeLinecap="round" strokeLinejoin="round" d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
    playbook: <path strokeLinecap="round" strokeLinejoin="round" d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15zM4 18.5A2.5 2.5 0 0 1 6.5 16H20" />,
    settings: (
        <>
            <circle cx="12" cy="12" r="3" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z" />
        </>
    ),
}

const VISIBILITY_LABELS: Record<string, string> = {
    scores_only: "Scores only",
    flagged_moments: "Flagged moments",
    full_transcripts: "Full transcripts",
}

export default function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const [email, setEmail]           = useState<string | null>(null)
    const [orgName, setOrgName]       = useState<string | null>(null)
    const [visibility, setVisibility] = useState<string | null>(null)
    const [menuOpen, setMenuOpen]     = useState(false)
    const [dark, setDark]             = useState(false)
    const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null)
    const isPublic = pathname === "/login" || pathname.startsWith("/accept-invite")
        || pathname.startsWith("/start") || pathname.startsWith("/reset-password")

    useEffect(() => {
        applySkin()
        setDark(document.documentElement.dataset.skin === "dark")
        return watchSystemSkin()
    }, [])

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null))
        supabase.rpc("get_org_context").then(({ data }) => {
            if (!data?.org_id) return
            supabase.from("organizations").select("name, visibility, trial_ends_at, stripe_subscription_id").eq("id", data.org_id).single()
                .then(({ data: o }) => {
                    if (!o) return
                    setOrgName(o.name); setVisibility(o.visibility)
                    if (o.trial_ends_at && !o.stripe_subscription_id) setTrialEndsAt(o.trial_ends_at)
                })
        })
    }, [])

    // Close the mobile drawer on route change.
    useEffect(() => { setMenuOpen(false) }, [pathname])

    function toggleSkin() {
        const nowDark = document.documentElement.dataset.skin !== "dark"
        setSkinPref(nowDark ? "dark" : "light")
        setDark(nowDark)
    }

    const nav: NavItem[] = [
        { href: "/",          label: "Home",     icon: ICONS.home,     match: p => p === "/" },
        { href: "/calls",     label: "Calls",    icon: ICONS.calls,    match: p => p.startsWith("/calls") || p.startsWith("/scorecard") },
        { href: "/team",      label: "Team",     icon: ICONS.team,     match: p => p.startsWith("/team") },
        { href: "/coaching",  label: "Coaching", icon: ICONS.coaching, match: p => p.startsWith("/coaching") },
        { href: "/insights",  label: "Insights", icon: ICONS.insights, match: p => p.startsWith("/insights") },
        { href: "/playbook",  label: "Playbook", icon: ICONS.playbook, match: p => p.startsWith("/playbook") },
        { href: "/settings",  label: "Settings", icon: ICONS.settings, match: p => p.startsWith("/settings") || p.startsWith("/admin") },
    ]

    const NavLink = ({ n }: { n: NavItem }) => {
        const active = n.match(pathname)
        return (
            <Link
                href={n.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] transition-colors ${
                    active
                        ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent-deep)] font-semibold"
                        : "text-[var(--color-text-secondary)] font-medium hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]"
                }`}
            >
                <svg className={`w-[17px] h-[17px] shrink-0 ${active ? "text-[var(--color-accent)]" : "text-[var(--color-muted)]"}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    {n.icon}
                </svg>
                {n.label}
            </Link>
        )
    }

    const SkinToggle = () => (
        <button
            onClick={toggleSkin}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)] transition-colors w-full text-left"
        >
            <svg className="w-[17px] h-[17px] shrink-0 text-[var(--color-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {dark
                    ? <><circle cx="12" cy="12" r="4" /><path strokeLinecap="round" d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>
                    : <path strokeLinecap="round" strokeLinejoin="round" d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />}
            </svg>
            {dark ? "Light mode" : "Dark mode"}
        </button>
    )

    const SignOut = ({ className = "" }: { className?: string }) => (
        <button
            onClick={() => supabase.auth.signOut().then(() => { window.location.href = "/login" })}
            className={`text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors ${className}`}
        >
            Sign out
        </button>
    )

    const Brand = () => (
        <Link href="/" className="flex items-center gap-2.5 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.png" alt="" className="w-8 h-8 rounded-lg shrink-0" />
            <span className="min-w-0">
                <span className="block font-display font-bold text-[15px] leading-tight text-[var(--color-text)] whitespace-nowrap">
                    TalkPilot <span className="text-[var(--color-accent)]">Teams</span>
                </span>
                {orgName && <span className="block text-[11px] text-[var(--color-muted)] truncate">{orgName}</span>}
            </span>
        </Link>
    )

    if (isPublic) return <main>{children}</main>

    return (
        <div className="flex min-h-screen">
            {/* ── Sidebar (md+) ── */}
            <aside className="hidden md:flex flex-col w-[232px] shrink-0 sticky top-0 h-screen bg-[var(--color-surface)] border-r border-[var(--color-border)] px-3.5 py-5">
                <div className="px-2 pb-5"><Brand /></div>
                <nav className="flex flex-col gap-0.5">
                    {nav.map(n => <NavLink key={n.href} n={n} />)}
                </nav>
                <div className="mt-auto flex flex-col gap-2.5">
                    <SkinToggle />
                    {trialEndsAt && (() => {
                        const days = Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400e3))
                        return (
                            <Link href="/settings?tab=billing"
                                className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-[11px] font-medium transition-colors ${
                                    days <= 3 ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                                              : "bg-[var(--color-accent-subtle)] text-[var(--color-accent-deep)] hover:bg-[var(--color-hover)]"}`}>
                                <span>Trial · {days} day{days === 1 ? "" : "s"} left</span>
                                <span className="font-semibold">Add billing →</span>
                            </Link>
                        )
                    })()}
                    {visibility && (
                        <div className="flex items-start gap-2 bg-[var(--color-accent-subtle)] rounded-lg px-2.5 py-2">
                            <svg className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[var(--color-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6l8-3z" />
                            </svg>
                            <p className="text-[10.5px] leading-snug text-[var(--color-accent-deep)]">
                                <strong>{VISIBILITY_LABELS[visibility] ?? visibility}</strong> visibility<br />
                                Reps always see their own scorecards
                            </p>
                        </div>
                    )}
                    <div className="flex items-center justify-between gap-2 px-2 pt-1">
                        {email && <span className="text-[11px] text-[var(--color-muted)] truncate">{email}</span>}
                        <SignOut className="shrink-0" />
                    </div>
                </div>
            </aside>

            {/* ── Mobile top bar + drawer ── */}
            <div className="flex-1 min-w-0 flex flex-col">
                <header className="md:hidden sticky top-0 z-50 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
                    <div className="px-4 h-14 flex items-center justify-between">
                        <Brand />
                        <button
                            onClick={() => setMenuOpen(o => !o)}
                            aria-label="Toggle menu"
                            aria-expanded={menuOpen}
                            className="inline-flex items-center justify-center w-9 h-9 rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                {menuOpen
                                    ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />}
                            </svg>
                        </button>
                    </div>
                    {menuOpen && (
                        <nav className="border-t border-[var(--color-border)] px-3 py-3 space-y-0.5">
                            {nav.map(n => <NavLink key={n.href} n={n} />)}
                            <SkinToggle />
                            <div className="pt-2 mt-2 border-t border-[var(--color-border)] flex items-center justify-between px-3">
                                {email && <span className="text-[11px] text-[var(--color-muted)] truncate">{email}</span>}
                                <SignOut className="shrink-0" />
                            </div>
                        </nav>
                    )}
                </header>
                <main className="flex-1 w-full max-w-[1180px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
                    {children}
                </main>
            </div>
        </div>
    )
}
