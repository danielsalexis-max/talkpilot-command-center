"use client"

import { Suspense, useEffect } from "react"
import type { Route } from "next"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useOrg, OrgBanners } from "@/lib/useOrg"
import { PageSkeleton } from "@/components/homeStates"
import { PlaybooksTab, ObjectionsTab, KnowledgeTab } from "@/components/orgTabs"
import { useT } from "@/i18n/LocaleProvider"

type Tab = "playbooks" | "objections" | "knowledge"
// Team DNA moved to its own page, /dna (D-615) — it used to be the featured
// fourth tab here; ?tab=dna redirects there below so old links keep working.
const TAB_KEYS: { key: Tab; featured?: boolean }[] = [
    { key: "playbooks"  },
    { key: "objections" },
    { key: "knowledge"  },
]

function PlaybookPageInner() {
    const router = useRouter()
    const params = useSearchParams()
    const t = useT()
    const { org, orgId, loading, reload } = useOrg()
    const TABS = TAB_KEYS.map(tab => ({ ...tab, label: t.playbookPage.tabs[tab.key] }))

    const raw = params.get("tab")
    const tab: Tab = TAB_KEYS.some(x => x.key === raw) ? (raw as Tab) : "playbooks"
    const setTab = (next: Tab) => router.replace(`/playbook?tab=${next}`, { scroll: false })

    // Team DNA lives at /dna now (D-615); keep old deep links working.
    useEffect(() => { if (raw === "dna") router.replace("/dna" as Route) }, [raw, router])

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => { if (!data.user) router.replace("/login") })
    }, [router])

    if (loading) return <PageSkeleton rows={2} />
    if (!orgId || !org) return (
        <div className="text-red-600 text-sm">
            {t.common.adminAccessRequired}
        </div>
    )

    return (
        <div data-ph-mask className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-[var(--color-text)]">{t.playbookPage.title}</h1>
                <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                    {t.playbookPage.sub}
                </p>
            </div>

            <OrgBanners org={org} />

            <div className="border-b border-[var(--color-border)] flex gap-1 overflow-x-auto">
                {TABS.map(tabDef => {
                    const active = tab === tabDef.key

                    // The featured tab opts out of the shared underline entirely:
                    // an underline plus a box reads as two competing indicators.
                    // It sits centred in the row so the dotted box floats clear of
                    // the container's bottom rule rather than colliding with it.
                    if (tabDef.featured) return (
                        <button key={tabDef.key} onClick={() => setTab(tabDef.key)}
                            className={`px-4 py-1.5 my-1 self-center text-sm rounded-lg border border-dotted transition-colors whitespace-nowrap ${
                                active
                                    ? "border-[var(--color-accent-deep)] bg-[var(--color-accent-subtle)] text-[var(--color-accent-deep)] font-semibold"
                                    : "border-[var(--color-accent)] text-[var(--color-text)] font-medium hover:bg-[var(--color-accent-subtle)] hover:text-[var(--color-accent-deep)]"
                            }`}
                        >
                            {tabDef.label}
                        </button>
                    )

                    return (
                        <button key={tabDef.key} onClick={() => setTab(tabDef.key)}
                            className={`px-4 py-2 text-sm border-b-2 transition-colors -mb-px whitespace-nowrap ${
                                active
                                    ? "border-[var(--color-accent)] text-[var(--color-accent-deep)] font-semibold"
                                    : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                            }`}
                        >
                            {tabDef.label}
                        </button>
                    )
                })}
            </div>

            {tab === "playbooks"  && <PlaybooksTab orgId={orgId} />}
            {tab === "objections" && <ObjectionsTab orgId={orgId} org={org} onSaved={reload} />}
            {tab === "knowledge"  && <KnowledgeTab orgId={orgId} />}
        </div>
    )
}

export default function PlaybookPage() {
    return (
        <Suspense fallback={<PageSkeleton rows={2} />}>
            <PlaybookPageInner />
        </Suspense>
    )
}
