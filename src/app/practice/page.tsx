"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { PracticeTab } from "@/components/orgTabs"
import { PageSkeleton } from "@/components/homeStates"
import { useLocale } from "@/i18n/LocaleProvider"

/// Practice is its own destination (D-192).
///
/// It used to be an `<h2>` at the bottom of the Review page — reachable only
/// by scrolling past the review queue, which meant assigning practice was a
/// thing you had to already know existed. Review is about calls that already
/// happened; practice is about the next one. Different question, different
/// page.

export default function PracticePage() {
    const router = useRouter()
    const { t } = useLocale()
    const [orgId, setOrgId]     = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        (async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser()
                if (!user) { router.replace("/login"); return }
                const { data: ctx } = await supabase.rpc("get_org_context")
                if (ctx?.org_id) setOrgId(ctx.org_id)
            } finally {
                setLoading(false)
            }
        })()
    }, [router])

    if (loading) return <PageSkeleton rows={2} />
    if (!orgId) return <div className="text-red-600 text-sm">{t.common.noOrgMembership}</div>

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-[var(--color-text)]">{t.practice.title}</h1>
                <p className="text-sm text-[var(--color-text-secondary)] mt-1">{t.practice.sub}</p>
            </div>
            <PracticeTab orgId={orgId} />
        </div>
    )
}
