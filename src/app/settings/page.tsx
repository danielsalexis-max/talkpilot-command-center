"use client"

import { Suspense, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useOrg, OrgBanners } from "@/lib/useOrg"
import { SettingsTab, MembersTab, BillingTab, type AdminTab } from "@/components/orgTabs"
import { getSkinPref, setSkinPref, type SkinPref } from "@/lib/skin"
import { useState } from "react"

type Tab = "org" | "members" | "billing"
const TABS: { key: Tab; label: string }[] = [
    { key: "org",     label: "Organization" },
    { key: "members", label: "Members"      },
    { key: "billing", label: "Billing"      },
]

function AppearanceCard() {
    const [pref, setPref] = useState<SkinPref>("light")
    useEffect(() => { setPref(getSkinPref()) }, [])
    return (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm space-y-3 max-w-2xl">
            <div>
                <h3 className="text-sm font-semibold text-[var(--color-text)]">Appearance</h3>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                    How the Command Center looks for you. Reps&apos; apps have their own setting (dark by default).
                </p>
            </div>
            <select
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
                value={pref}
                onChange={e => { const v = e.target.value as SkinPref; setPref(v); setSkinPref(v) }}
            >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="system">Match system</option>
            </select>
        </div>
    )
}

function SettingsPageInner() {
    const router = useRouter()
    const params = useSearchParams()
    const { org, orgId, loading, reload } = useOrg()

    const raw = params.get("tab")
    const tab: Tab = raw === "members" || raw === "billing" ? raw : "org"
    const setTab = (t: Tab) => router.replace(`/settings?tab=${t}`, { scroll: false })

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => { if (!data.user) router.replace("/login") })
    }, [router])

    // MembersTab's readiness gate jumps to setup surfaces that now live under
    // /playbook (voice included); "settings" (org basics) stays here.
    const onNavigate = (t: AdminTab) => {
        if (t === "settings") { setTab("org"); return }
        const map: Partial<Record<AdminTab, string>> = {
            playbooks: "playbooks", objections: "objections", knowledge: "knowledge", voice: "voice", dna: "dna",
        }
        router.push(`/playbook?tab=${map[t] ?? "playbooks"}`)
    }

    if (loading) return <div className="text-sm text-[var(--color-muted)]">Loading…</div>
    if (!orgId || !org) return (
        <div className="text-red-600 text-sm">
            Admin access required. Make sure you&apos;re an org owner or admin.
        </div>
    )

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-[var(--color-text)]">Settings</h1>
                <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                    {org.name} · <span className="capitalize">{org.plan}</span> plan
                </p>
            </div>

            <OrgBanners org={org} />

            <div className="border-b border-[var(--color-border)] flex gap-1 overflow-x-auto">
                {TABS.map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                        className={`px-4 py-2 text-sm border-b-2 transition-colors -mb-px whitespace-nowrap ${
                            tab === t.key
                                ? "border-[var(--color-accent)] text-[var(--color-accent-deep)] font-semibold"
                                : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                        }`}
                    >{t.label}</button>
                ))}
            </div>

            {tab === "org" && (
                <div className="space-y-6">
                    <SettingsTab org={org} onSaved={reload} />
                    <AppearanceCard />
                </div>
            )}
            {tab === "members" && <MembersTab orgId={orgId} org={org} onNavigate={onNavigate} />}
            {tab === "billing" && <BillingTab orgId={orgId} trialEndsAt={org.trial_ends_at ?? null} />}
        </div>
    )
}

export default function SettingsPage() {
    return (
        <Suspense fallback={<div className="text-sm text-[var(--color-muted)]">Loading…</div>}>
            <SettingsPageInner />
        </Suspense>
    )
}
