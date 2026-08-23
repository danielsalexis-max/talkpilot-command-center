"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase, type Scorecard } from "@/lib/supabase"
import { ScoreRing } from "@/components/ScoreRing"
import { PracticeTab } from "@/components/orgTabs"
import { PageSkeleton } from "@/components/homeStates"
import { useLocale } from "@/i18n/LocaleProvider"

interface MemberInfo { user_id: string; email: string | null; full_name: string | null }

export default function CoachingPage() {
    const router = useRouter()
    const { t, intl } = useLocale()
    const [orgId, setOrgId]     = useState<string | null>(null)
    const [queue, setQueue]     = useState<Scorecard[]>([])
    const [members, setMembers] = useState<MemberInfo[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

    async function load() {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) { router.replace("/login"); return }
            const { data: ctx } = await supabase.rpc("get_org_context")
            if (!ctx?.org_id) { setLoading(false); return }
            setOrgId(ctx.org_id)
            const [{ data: scorecards }, { data: mems }] = await Promise.all([
                supabase.from("session_scorecards").select("*")
                    .eq("org_id", ctx.org_id).eq("status", "scored")
                    .gte("started_at", new Date(Date.now() - 30 * 86400e3).toISOString())
                    .order("started_at", { ascending: false }).limit(200),
                supabase.rpc("get_org_members_with_email", { p_org: ctx.org_id }),
            ])
            const cards = (scorecards ?? []) as Scorecard[]
            setQueue(cards.filter(c =>
                (c.guardrail_breaches ?? []).length > 0 ||
                (c.adherence_score != null && c.adherence_score < 60)).slice(0, 12))
            setMembers((mems ?? []) as MemberInfo[])
        } finally {
            setLoading(false)
        }
    }

    const byUser = useMemo(() => new Map(members.map(m => [m.user_id, m])), [members])
    const label = (id: string) => byUser.get(id)?.full_name || byUser.get(id)?.email || t.common.rep

    if (loading) return <PageSkeleton rows={2} />
    if (!orgId) return <div className="text-red-600 text-sm">{t.common.noOrgMembership}</div>

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-[var(--color-text)]">{t.coaching.title}</h1>
                <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                    {t.coaching.sub}
                </p>
            </div>

            {/* Review queue */}
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                    <h2 className="text-sm font-semibold text-[var(--color-text)]">{t.coaching.queueTitle}</h2>
                    {queue.length > 0 && (
                        <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-700">{queue.length}</span>
                    )}
                </div>
                {queue.length === 0 && (
                    <p className="text-sm text-[var(--color-muted)] py-4 text-center">
                        {t.coaching.queueEmpty}{" "}
                        <Link href="/playbook" className="text-[var(--color-accent-deep)] font-medium hover:underline">{t.coaching.tightenPlaybook}</Link>
                    </p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {queue.map(c => {
                        const hasBreach = (c.guardrail_breaches ?? []).length > 0
                        return (
                            <Link key={c.id} href={`/scorecard/${c.id}`}
                                className={`rounded-lg border border-[var(--color-border)] border-l-[3px] ${hasBreach ? "border-l-red-500" : "border-l-amber-400"} px-4 py-3 hover:bg-[var(--color-hover)] transition-colors flex items-center justify-between gap-3`}>
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-[var(--color-text)] truncate">
                                        {c.session_title || (c.started_at ? new Date(c.started_at).toLocaleString(intl, { dateStyle: "medium", timeStyle: "short" }) : t.common.scoredCall)}
                                    </p>
                                    <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                                        {label(c.user_id)}
                                        {hasBreach
                                            ? ` · ${t.coaching.nBreaches(c.guardrail_breaches.length)}`
                                            : ` · ${t.coaching.adherenceN(c.adherence_score ?? 0)}`}
                                        {c.started_at ? ` · ${new Date(c.started_at).toLocaleDateString(intl, { month: "short", day: "numeric" })}` : ""}
                                    </p>
                                </div>
                                <ScoreRing score={c.overall_score} size="sm" />
                            </Link>
                        )
                    })}
                </div>
            </div>

            {/* Practice assignment (shared component; grades roll up automatically) */}
            <div>
                <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">{t.coaching.practice}</h2>
                <PracticeTab orgId={orgId} />
            </div>
        </div>
    )
}
