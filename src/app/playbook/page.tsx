"use client"

import { Suspense, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useOrg, OrgBanners } from "@/lib/useOrg"
import { PlaybooksTab, ObjectionsTab, KnowledgeTab, VoiceTab, TeamDNATab } from "@/components/orgTabs"

type Tab = "playbooks" | "objections" | "knowledge" | "voice" | "dna"
const TABS: { key: Tab; label: string }[] = [
    { key: "playbooks",  label: "Playbooks"  },
    { key: "objections", label: "Objections" },
    { key: "knowledge",  label: "Knowledge"  },
    { key: "voice",      label: "Voice"      },
    { key: "dna",        label: "Team DNA"   },
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
