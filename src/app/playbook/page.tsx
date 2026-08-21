"use client"

import { Suspense, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useOrg, OrgBanners } from "@/lib/useOrg"
import { PlaybooksTab, ObjectionsTab, KnowledgeTab, VoiceTab, TeamDNATab } from "@/components/orgTabs"

type Tab = "playbooks" | "objections" | "knowledge" | "voice" | "dna"
// `featured` marks Team DNA. It generates a whole playbook from your best rep —
// the highest-leverage thing on this page — but it sits last in a row of five
// identical tabs, so its position reads as "least important". It stays last on
// purpose (the first tab is also the default landing, and DNA is a setup action
// rather than a daily one); the accent carries the signal instead.
const TABS: { key: Tab; label: string; featured?: boolean }[] = [
    { key: "playbooks",  label: "Playbooks"  },
    { key: "objections", label: "Objections" },
    { key: "knowledge",  label: "Knowledge"  },
    { key: "voice",      label: "Voice"      },
    { key: "dna",        label: "Team DNA", featured: true },
]

function PlaybookPageInner() {
    const router = useRouter()
    const params = useSearchParams()
    const { org, orgId, loading, reload } = useOrg()

    const raw = params.get("tab")
    const tab: Tab = TABS.some(t => t.key === raw) ? (raw as Tab) : "playbooks"
    const setTab = (t: Tab) => router.replace(`/playbook?tab=${t}`, { scroll: false })

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => { if (!data.user) router.replace("/login") })
    }, [router])

    if (loading) return <div className="text-sm text-[var(--color-muted)]">Loading…</div>
    if (!orgId || !org) return (
        <div className="text-red-600 text-sm">
            Admin access required. Make sure you&apos;re an org owner or admin.
        </div>
    )

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-[var(--color-text)]">Playbook</h1>
                <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                    Your org brain: what reps are coached from live, and scored against after.
                </p>
            </div>

            <OrgBanners org={org} />

            <div className="border-b border-[var(--color-border)] flex gap-1 overflow-x-auto">
                {TABS.map(t => {
                    const active = tab === t.key
                    return (
                        <button key={t.key} onClick={() => setTab(t.key)}
                            className={`px-4 py-2 text-sm border-b-2 transition-colors -mb-px whitespace-nowrap inline-flex items-center gap-1.5 ${
                                active
                                    ? "border-[var(--color-accent)] text-[var(--color-accent-deep)] font-semibold"
                                    : t.featured
                                        // Full-strength text and medium weight: one step up from
                                        // the muted siblings, one step below the active tab.
                                        ? "border-transparent text-[var(--color-text)] font-medium hover:text-[var(--color-accent-deep)]"
                                        : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                            }`}
                        >
                            {t.featured && (
                                <span aria-hidden
                                    className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                        active ? "bg-[var(--color-accent-deep)]" : "bg-[var(--color-accent)]"
                                    }`}
                                />
                            )}
                            {t.label}
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
        <Suspense fallback={<div className="text-sm text-[var(--color-muted)]">Loading…</div>}>
            <PlaybookPageInner />
        </Suspense>
    )
}
