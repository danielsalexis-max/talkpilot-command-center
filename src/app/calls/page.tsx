"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase, type Scorecard } from "@/lib/supabase"
import { ScoreRing } from "@/components/ScoreRing"
import { SearchBox } from "@/components/SearchBox"

interface MemberInfo { user_id: string; email: string | null; full_name: string | null }

type Filter = "all" | "breach" | "low" | "top"
const FILTERS: { key: Filter; label: string }[] = [
    { key: "all",    label: "All" },
    { key: "breach", label: "Guardrail breaches" },
    { key: "low",    label: "Adherence < 60" },
    { key: "top",    label: "Top calls" },
]

export default function CallsPage() {
    const router = useRouter()
    const [cards, setCards]     = useState<Scorecard[]>([])
    const [members, setMembers] = useState<MemberInfo[]>([])
    const [loading, setLoading] = useState(true)
    const [query, setQuery]     = useState("")
    const [filter, setFilter]   = useState<Filter>("all")

    useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

    async function load() {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) { router.replace("/login"); return }
            const { data: ctx } = await supabase.rpc("get_org_context")
            if (!ctx?.org_id) { setLoading(false); return }
            const [{ data: scorecards }, { data: mems }] = await Promise.all([
                supabase.from("session_scorecards").select("*")
                    .eq("org_id", ctx.org_id).eq("status", "scored")
                    .gte("started_at", new Date(Date.now() - 90 * 86400e3).toISOString())
                    .order("started_at", { ascending: false }).limit(300),
                supabase.rpc("get_org_members_with_email", { p_org: ctx.org_id }),
            ])
            setCards((scorecards ?? []) as Scorecard[])
            setMembers((mems ?? []) as MemberInfo[])
        } finally {
            setLoading(false)
        }
    }

    const byUser = useMemo(() => new Map(members.map(m => [m.user_id, m])), [members])
    const label = (id: string) => byUser.get(id)?.full_name || byUser.get(id)?.email || "Rep"

    const filtered = cards.filter(c => {
        if (filter === "breach" && (c.guardrail_breaches ?? []).length === 0) return false
        if (filter === "low" && !(c.adherence_score != null && c.adherence_score < 60)) return false
        if (filter === "top" && !(c.overall_score != null && c.overall_score >= 80)) return false
        if (query) {
            const hay = `${c.session_title ?? ""} ${label(c.user_id)}`.toLowerCase()
            if (!hay.includes(query.toLowerCase())) return false
        }
        return true
    })

    if (loading) return <div className="text-sm text-[var(--color-muted)]">Loading…</div>

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-[var(--color-text)]">Calls</h1>
                    <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                        Every scored session across the org, last 90 days. Click a call to open its scorecard.
                    </p>
                </div>
                <SearchBox value={query} onChange={setQuery} placeholder="Search calls or reps…" />
            </div>

            <div className="flex flex-wrap gap-2">
                {FILTERS.map(f => (
                    <button key={f.key} onClick={() => setFilter(f.key)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                            filter === f.key
                                ? "bg-[var(--color-accent-subtle)] border-[var(--color-accent-light)] text-[var(--color-accent-deep)] font-semibold"
                                : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-muted)]"
                        }`}
                    >{f.label}</button>
                ))}
            </div>

            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-[10.5px] uppercase tracking-wide text-[var(--color-muted)] border-b border-[var(--color-border)]">
                            <th className="px-4 py-3 font-semibold">Call</th>
                            <th className="px-3 py-3 font-semibold hidden sm:table-cell">Rep</th>
                            <th className="px-3 py-3 font-semibold hidden md:table-cell">Date</th>
                            <th className="px-3 py-3 font-semibold hidden lg:table-cell">Length</th>
                            <th className="px-3 py-3 font-semibold hidden lg:table-cell">Talk</th>
                            <th className="px-3 py-3 font-semibold">Overall</th>
                            <th className="px-3 py-3 font-semibold hidden sm:table-cell">Adherence</th>
                            <th className="px-3 py-3 font-semibold"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-line-soft)]">
                        {filtered.length === 0 && (
                            <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-[var(--color-muted)]">
                                No calls match. Clear the search or filters.
                            </td></tr>
                        )}
                        {filtered.map(c => (
                            <tr key={c.id} onClick={() => router.push(`/scorecard/${c.id}`)}
                                className="cursor-pointer hover:bg-[var(--color-hover)] transition-colors">
                                <td className="px-4 py-3">
                                    <span className="font-medium text-[var(--color-text)] block truncate max-w-[320px]">
                                        {c.session_title || (c.started_at ? new Date(c.started_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Scored call")}
                                    </span>
                                    <span className="text-xs text-[var(--color-muted)] sm:hidden">{label(c.user_id)}</span>
                                </td>
                                <td className="px-3 py-3 hidden sm:table-cell">
                                    <Link href={`/team/${c.user_id}`} onClick={e => e.stopPropagation()}
                                        className="text-[var(--color-text-secondary)] hover:text-[var(--color-accent-deep)]">
                                        {label(c.user_id)}
                                    </Link>
                                </td>
                                <td className="px-3 py-3 font-mono text-xs text-[var(--color-text-secondary)] hidden md:table-cell">
                                    {c.started_at ? new Date(c.started_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"}
                                </td>
                                <td className="px-3 py-3 font-mono text-xs text-[var(--color-text-secondary)] hidden lg:table-cell">
                                    {c.duration_minutes ? `${c.duration_minutes} min` : "—"}
                                </td>
                                <td className="px-3 py-3 font-mono text-xs text-[var(--color-text-secondary)] hidden lg:table-cell">
                                    {c.talk_ratio != null ? `${c.talk_ratio}%` : "—"}
                                </td>
                                <td className="px-3 py-3"><ScoreRing score={c.overall_score} size="sm" /></td>
                                <td className="px-3 py-3 hidden sm:table-cell"><ScoreRing score={c.adherence_score} size="sm" /></td>
                                <td className="px-3 py-3">
                                    {(c.guardrail_breaches ?? []).length > 0 &&
                                        <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-700 whitespace-nowrap">
                                            {c.guardrail_breaches.length} BREACH{c.guardrail_breaches.length > 1 ? "ES" : ""}
                                        </span>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
