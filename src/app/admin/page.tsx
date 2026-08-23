"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useT } from "@/i18n/LocaleProvider"

/// The old Admin hub was split by the Boardroom redesign (D-162): coaching
/// configuration (playbooks, objections, knowledge, voice, Team DNA) lives at
/// /playbook; org administration (settings, members, billing) at /settings.
/// Old bookmarks land here — send them to Settings.
export default function AdminRedirect() {
    const router = useRouter()
    const t = useT()
    useEffect(() => { router.replace("/settings") }, [router])
    return <div className="text-sm text-[var(--color-muted)]">{t.adminPage.moved}</div>
}
