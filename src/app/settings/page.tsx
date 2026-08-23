"use client"

import Link from "next/link"
import { Suspense, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useOrg, OrgBanners } from "@/lib/useOrg"
import { SettingsTab, BillingTab } from "@/components/orgTabs"
import { PageSkeleton } from "@/components/homeStates"
import { getSkinPref, setSkinPref, type SkinPref } from "@/lib/skin"
import { useT } from "@/i18n/LocaleProvider"
import { useState } from "react"

type Tab = "org" | "billing"

function AppearanceCard() {
    const t = useT()
    const [pref, setPref] = useState<SkinPref>("light")
    useEffect(() => { setPref(getSkinPref()) }, [])
    return (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm space-y-3 max-w-2xl">
            <div>
                <h3 className="text-sm font-semibold text-[var(--color-text)]">{t.settingsPage.appearance}</h3>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                    {t.settingsPage.appearanceSub}
                </p>
            </div>
            <select
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
                value={pref}
                onChange={e => { const v = e.target.value as SkinPref; setPref(v); setSkinPref(v) }}
            >
                <option value="light">{t.settingsPage.light}</option>
                <option value="dark">{t.settingsPage.dark}</option>
                <option value="system">{t.settingsPage.matchSystem}</option>
            </select>
        </div>
    )
}

function SettingsPageInner() {
    const router = useRouter()
    const params = useSearchParams()
    const t = useT()
    const { org, orgId, loading, reload } = useOrg()
    const TABS: { key: Tab; label: string }[] = [
        { key: "org",     label: t.settingsPage.tabOrg     },
        { key: "billing", label: t.settingsPage.tabBilling },
    ]

    const raw = params.get("tab")
    const tab: Tab = raw === "billing" ? "billing" : "org"
    const setTab = (t: Tab) => router.replace(`/settings?tab=${t}`, { scroll: false })

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => { if (!data.user) router.replace("/login") })
    }, [router])

    // People moved to Team → Members (D-175); old bookmarks keep working.
    useEffect(() => {
        if (raw === "members") router.replace("/team?tab=members")
    }, [raw, router])

    if (loading) return <PageSkeleton rows={2} />
    if (!orgId || !org) return (
        <div className="text-red-600 text-sm">
            {t.common.adminAccessRequired}
        </div>
    )

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-[var(--color-text)]">{t.settingsPage.title}</h1>
                <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                    {org.name} · <span className="capitalize">{t.settingsPage.subPlan(org.plan)}</span> {t.settingsPage.subTeamMoved}{" "}
                    <Link href="/team?tab=members" className="text-[var(--color-accent-deep)] font-medium hover:underline">{t.settingsPage.subTeamMovedLink}</Link>
                    {t.settingsPage.subNow ? ` ${t.settingsPage.subNow}` : ""}
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
            {tab === "billing" && <BillingTab orgId={orgId} trialEndsAt={org.trial_ends_at ?? null} />}
        </div>
    )
}

export default function SettingsPage() {
    return (
        <Suspense fallback={<PageSkeleton rows={2} />}>
            <SettingsPageInner />
        </Suspense>
    )
}
