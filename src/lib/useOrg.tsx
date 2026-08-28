"use client"

import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import type { OrgInfo } from "@/components/orgTabs"
import { useLocale } from "@/i18n/LocaleProvider"
import { EmailLink } from "@/components/EmailLink"

/// Shared org loader for the config surfaces (/playbook, /settings).
/// Mirrors the old Admin page's bootstrap: get_org_context first, then a
/// direct-membership fallback so a suspended org's owner can still reach
/// Billing to reactivate (context returns nothing for suspended orgs —
/// that's the app-side kill switch).
export function useOrg() {
    const [org, setOrg]         = useState<OrgInfo | null>(null)
    const [orgId, setOrgId]     = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    const reload = useCallback(async () => {
        const { data: ctx } = await supabase.rpc("get_org_context")
        let id: string | null = ctx?.org_id ?? null
        if (!id) {
            const { data: membership } = await supabase.from("org_members")
                .select("org_id").eq("status", "active").limit(1).maybeSingle()
            id = membership?.org_id ?? null
        }
        if (!id) { setLoading(false); return }
        setOrgId(id)
        const { data } = await supabase.from("organizations")
            .select("id, name, slug, plan, visibility, seats_purchased, status, cancel_at, trial_ends_at, stripe_subscription_id, voice_profile, settings")
            .eq("id", id).single()
        setOrg(data as OrgInfo)
        setLoading(false)
    }, [])

    useEffect(() => { reload() }, [reload])

    return { org, orgId, loading, reload }
}

/// Suspension / cancellation banners shared by the config surfaces.
export function OrgBanners({ org }: { org: OrgInfo }) {
    const { t, intl } = useLocale()
    return (
        <>
            {org.status === "suspended" && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                    <p className="text-sm font-medium text-red-700">{t.orgBanners.suspendedTitle}</p>
                    <p className="text-xs text-red-600 mt-1">
                        {t.orgBanners.suspendedBody1}{" "}
                        <EmailLink email="alexis@talkpilot.co" subject="Reactivate workspace" className="underline">alexis@talkpilot.co</EmailLink>.
                    </p>
                </div>
            )}
            {org.status === "active" && org.cancel_at && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <p className="text-sm font-medium text-amber-800">
                        {t.orgBanners.endsTitle(new Date(org.cancel_at).toLocaleDateString(intl, { dateStyle: "long" }))}
                    </p>
                    <p className="text-xs text-amber-700 mt-1">
                        {t.orgBanners.endsBody}
                    </p>
                </div>
            )}
        </>
    )
}
