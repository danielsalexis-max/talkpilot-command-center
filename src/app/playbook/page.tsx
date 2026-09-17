"use client"

import { Suspense, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useOrg, OrgBanners } from "@/lib/useOrg"
import { PageSkeleton } from "@/components/homeStates"
import { PlaybooksTab, ObjectionsTab, KnowledgeTab, TeamDNATab } from "@/components/orgTabs"
import { useT } from "@/i18n/LocaleProvider"

type Tab = "playbooks" | "objections" | "knowledge" | "dna"
// `featured` marks Team DNA. It generates a whole playbook from your best rep —
// the highest-leverage thing on this page — so it leads the row and wears a
// dotted outline instead of sitting among four identical siblings. The outline
// is doing what a leading dot used to: marking it as the odd one out. A box
// survives at a glance where a 6px dot did not.
//
// Leading the row does NOT make it the landing tab: `tab` falls back to the
// literal "playbooks" below, not to TAB_KEYS[0]. That split is deliberate —
// DNA is a setup action you do once, so it earns the eye but not the default.
const TAB_KEYS: { key: Tab; featured?: boolean }[] = [
    { key: "dna", featured: true },
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
        <div className="space-y-6">
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
            {tab === "dna"        && <TeamDNATab orgId={orgId} org={org} onApplied={reload} />}
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
