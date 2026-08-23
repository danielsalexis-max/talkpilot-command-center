"use client"

import { Suspense, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useOrg, OrgBanners } from "@/lib/useOrg"
import { PageSkeleton } from "@/components/homeStates"
import { PlaybooksTab, ObjectionsTab, KnowledgeTab, VoiceTab, TeamDNATab } from "@/components/orgTabs"
import { useT } from "@/i18n/LocaleProvider"

type Tab = "playbooks" | "objections" | "knowledge" | "voice" | "dna"
// `featured` marks Team DNA. It generates a whole playbook from your best rep —
// the highest-leverage thing on this page — but it sits last in a row of five
// identical tabs, so its position reads as "least important". It stays last on
// purpose (the first tab is also the default landing, and DNA is a setup action
// rather than a daily one); the accent carries the signal instead.
const TAB_KEYS: { key: Tab; featured?: boolean }[] = [
    { key: "playbooks"  },
    { key: "objections" },
    { key: "knowledge"  },
    { key: "voice"      },
    { key: "dna", featured: true },
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
                    return (
                        <button key={tabDef.key} onClick={() => setTab(tabDef.key)}
                            className={`px-4 py-2 text-sm border-b-2 transition-colors -mb-px whitespace-nowrap inline-flex items-center gap-1.5 ${
                                active
                                    ? "border-[var(--color-accent)] text-[var(--color-accent-deep)] font-semibold"
                                    : tabDef.featured
                                        // Full-strength text and medium weight: one step up from
                                        // the muted siblings, one step below the active tab.
                                        ? "border-transparent text-[var(--color-text)] font-medium hover:text-[var(--color-accent-deep)]"
                                        : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                            }`}
                        >
                            {tabDef.featured && (
                                <span aria-hidden
                                    className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                        active ? "bg-[var(--color-accent-deep)]" : "bg-[var(--color-accent)]"
                                    }`}
                                />
                            )}
                            {tabDef.label}
                        </button>
                    )
                })}
            </div>

            {tab === "playbooks"  && <PlaybooksTab orgId={orgId} />}
            {tab === "objections" && <ObjectionsTab orgId={orgId} />}
            {tab === "knowledge"  && <KnowledgeTab orgId={orgId} />}
            {tab === "voice"      && <VoiceTab org={org} onSaved={reload} />}
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
