"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useOrg, OrgBanners } from "@/lib/useOrg"
import { PageSkeleton } from "@/components/homeStates"
import { TeamDNATab } from "@/components/orgTabs"
import { useT } from "@/i18n/LocaleProvider"

/// Team DNA as its own page (D-615). It used to be the featured fourth tab
/// inside Playbook, but generating a playbook from your best rep is the
/// highest-leverage setup action in the product — as a tab it read as a
/// detail of Playbook. /playbook?tab=dna redirects here so old links keep
/// working.
export default function DnaPage() {
    const router = useRouter()
    const t = useT()
    const { org, orgId, loading, reload } = useOrg()

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
                <h1 className="text-2xl font-bold text-[var(--color-text)]">{t.dnaPage.title}</h1>
                <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                    {t.dnaPage.sub}
                </p>
            </div>

            <OrgBanners org={org} />

            <TeamDNATab orgId={orgId} org={org} onApplied={reload} />
        </div>
    )
}
