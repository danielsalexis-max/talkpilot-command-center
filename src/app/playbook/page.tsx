"use client"

import { Suspense, useEffect } from "react"
import type { Route } from "next"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useOrg, OrgBanners } from "@/lib/useOrg"
import { PageSkeleton } from "@/components/homeStates"
import { PlaybooksTab, ObjectionsTab, KnowledgeTab } from "@/components/orgTabs"
import type { PlaybookView } from "@/components/playbookStudio"
import { isSalesStage } from "@/lib/salesStages"
import { useT } from "@/i18n/LocaleProvider"

/// The Playbook page (D-736). No tab bar any more: the main view is the
/// team's sales process, a stage opens with `?stage=`, and Objections and
/// Knowledge, which apply to every stage, open as their own views with
/// `?tab=`. Old `?tab=playbooks` links land on the main view, and `?tab=dna`
/// still goes to /dna (D-615).
function PlaybookPageInner() {
    const router = useRouter()
    const params = useSearchParams()
    const t = useT()
    const { org, orgId, loading, reload } = useOrg()

    const rawTab = params.get("tab")
    const rawStage = params.get("stage")
    const stage = isSalesStage(rawStage) ? rawStage : null
    const sub = rawTab === "objections" || rawTab === "knowledge" ? rawTab : null
    const focus = params.get("focus")

    function navigate(v: PlaybookView) {
        const url = !v ? "/playbook"
            : "stage" in v ? `/playbook?stage=${v.stage}`
            : `/playbook?tab=${v.tab}${v.focus ? `&focus=${v.focus}` : ""}`
        router.push(url as Route)
    }

    useEffect(() => { if (rawTab === "dna") router.replace("/dna" as Route) }, [rawTab, router])

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => { if (!data.user) router.replace("/login") })
    }, [router])

    // "Edit phrases" lands on the Objections view; the phrases sit at its end.
    useEffect(() => {
        if (sub !== "objections" || focus !== "phrases" || loading) return
        const id = window.setTimeout(() => document.getElementById("phrases")?.scrollIntoView({ behavior: "smooth" }), 500)
        return () => window.clearTimeout(id)
    }, [sub, focus, loading])

    if (loading) return <PageSkeleton rows={2} />
    if (!orgId || !org) return (
        <div className="text-red-600 text-sm">
            {t.common.adminAccessRequired}
        </div>
    )

    if (sub) return (
        <div className="space-y-6">
            <div>
                <button type="button" onClick={() => navigate(null)}
                    className="min-h-11 text-sm font-medium text-[var(--color-accent)] hover:underline underline-offset-2">
                    {t.playbookPage.back}
                </button>
                <h1 className="text-[26px] font-bold tracking-tight text-[var(--color-text)]">{t.playbookPage.tabs[sub]}</h1>
            </div>
            <OrgBanners org={org} />
            {sub === "objections" && <ObjectionsTab orgId={orgId} org={org} onSaved={reload} />}
            {sub === "knowledge"  && <KnowledgeTab orgId={orgId} />}
        </div>
    )

    return (
        <div className="space-y-6">
            <OrgBanners org={org} />
            <PlaybooksTab orgId={orgId} stage={stage} onNavigate={navigate} />
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
