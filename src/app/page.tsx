"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase, type Scorecard } from "@/lib/supabase"
import { ScoreBadge } from "@/components/ScoreRing"
import Link from "next/link"
import {
    LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts"

interface OrgInfo {
    id: string; name: string; visibility: string; seats_purchased: number; plan: string
}

interface TrendPoint {
    week: string; overall: number | null; adherence: number | null; objection: number | null
}

export default function OverviewPage() {
    const router = useRouter()
    const [org, setOrg]             = useState<OrgInfo | null>(null)
    const [recent, setRecent]       = useState<Scorecard[]>([])
    const [trend, setTrend]         = useState<TrendPoint[]>([])
    const [avgScores, setAvgScores] = useState<Record<string, number | null>>({})
    const [loading, setLoading]     = useState(true)
    const [error, setError]         = useState<string | null>(null)

    useEffect(() => { load() }, [])

    async function load() {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) { router.replace("/login"); return }

            const { data: orgData } = await supabase.rpc("get_org_context")
            if (!orgData?.org_id) { setError("No org membership found."); setLoading(false); return }

            const orgId = orgData.org_id

            const { data: orgInfo } = await supabase.from("organizations")
                .select("id, name, visibility, seats_purchased, plan")
                .eq("id", orgId).single()
            setOrg(orgInfo)

            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
            const { data: scorecards } = await supabase
                .from("session_scorecards")
                .select("*")
                .eq("org_id", orgId)
                .eq("status", "scored")
                .gte("started_at", thirtyDaysAgo)
                .order("started_at", { ascending: false })
                .limit(50)

            const cards = (scorecards ?? []) as Scorecard[]
            setRecent(cards.slice(0, 10))

            const avg = (field: keyof Scorecard) => {
                const vals = cards.map(c => c[field] as number | null).filter((v): v is number => v != null)
                return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null
            }
            setAvgScores({
                overall: avg("overall_score"), adherence: avg("adherence_score"),
                objection: avg("objection_score"), accuracy: avg("accuracy_score"),
            })

            const weeks: TrendPoint[] = []
            for (let w = 3; w >= 0; w--) {
                const start = new Date(Date.now() - (w + 1) * 7 * 24 * 60 * 60 * 1000)
                const end   = new Date(Date.now() - w * 7 * 24 * 60 * 60 * 1000)
                const week  = cards.filter(c => {
                    const d = c.started_at ? new Date(c.started_at) : null
                    return d && d >= start && d < end
                })
                const wAvg = (field: keyof Scorecard) => {
                    const vals = week.map(c => c[field] as number | null).filter((v): v is number => v != null)
                    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null
                }
                weeks.push({
                    week: start.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                    overall: wAvg("overall_score"), adherence: wAvg("adherence_score"), objection: wAvg("objection_score"),
                })
            }
            setTrend(weeks)
        } catch (e) {
            setError((e as Error).message)
        } finally {
            setLoading(false)
        }
    }

    if (loading) return <div className="text-gray-400 text-sm">Loading…</div>
    if (error)   return <div className="text-red-600 text-sm">{error}</div>

    return (
        <div className="space-y-8">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900">{org?.name}</h1>
                    <p className="text-sm text-gray-500 mt-1 capitalize">
                        {org?.plan} plan · {org?.seats_purchased} seats · {org?.visibility?.replace("_", " ")} visibility
                    </p>
                </div>
                <Link href="/team" className="text-sm text-[var(--color-accent)] hover:text-[var(--color-accent-light)] transition-colors font-medium">
                    View team →
                </Link>
            </div>

            {/* Score tiles */}
            <div className="grid grid-cols-4 gap-4">
                {[
                    { label: "Overall",    key: "overall"   },
                    { label: "Adherence",  key: "adherence" },
                    { label: "Objections", key: "objection" },
                    { label: "Accuracy",   key: "accuracy"  },
                ].map(({ label, key }) => (
                    <div key={key} className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 flex flex-col items-center gap-3 shadow-sm">
                        <ScoreBadge label={label} score={avgScores[key] ?? null} />
                        <span className="text-xs text-gray-400">30-day avg</span>
                    </div>
                ))}
            </div>

            {/* Trend chart */}
            {trend.some(t => t.overall != null) && (
                <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 shadow-sm">
                    <h2 className="text-sm font-semibold text-gray-900 mb-4">Score trend — last 4 weeks</h2>
                    <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={trend} margin={{ left: -20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                            <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#9CA3AF" }} />
                            <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#9CA3AF" }} />
                            <Tooltip
                                contentStyle={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 8, boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                                labelStyle={{ color: "#111827", fontSize: 12, fontWeight: 600 }}
                                itemStyle={{ fontSize: 12, color: "#4B5563" }}
                            />
                            <Line type="monotone" dataKey="overall"   stroke="#4F46E5" strokeWidth={2} dot={false} name="Overall"    />
                            <Line type="monotone" dataKey="adherence" stroke="#10b981" strokeWidth={2} dot={false} name="Adherence"  />
                            <Line type="monotone" dataKey="objection" stroke="#f59e0b" strokeWidth={2} dot={false} name="Objections" />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Recent sessions */}
            <div>
                <h2 className="text-sm font-semibold text-gray-900 mb-3">Recent sessions</h2>
                <div className="space-y-2">
                    {recent.length === 0 && (
                        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] px-6 py-8 text-center shadow-sm">
                            <p className="text-sm text-gray-500">No scored sessions in the last 30 days.</p>
                            <p className="text-xs text-gray-400 mt-1">Sessions appear here after calls are scored by the AI pipeline.</p>
                        </div>
                    )}
                    {recent.map(card => (
                        <Link
                            key={card.id}
                            href={`/scorecard/${card.id}`}
                            className="flex items-center justify-between bg-[var(--color-surface)] hover:bg-gray-50 transition-colors rounded-xl border border-[var(--color-border)] px-4 py-3 shadow-sm"
                        >
                            <div className="flex flex-col">
                                <span className="text-sm text-gray-900 font-medium">
                                    {card.started_at
                                        ? new Date(card.started_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
                                        : "Unknown time"}
                                </span>
                                <span className="text-xs text-gray-400">
                                    {card.duration_minutes ? `${card.duration_minutes} min` : "—"} · {card.session_source === "plus_conversations" ? "iOS" : "macOS"}
                                </span>
                            </div>
                            <div className="flex items-center gap-6">
                                <ScoreBadge label="Overall" score={card.overall_score} />
                                <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    )
}
