"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
    supabase, type Scorecard, type ScorecardObjection,
    type ScorecardClaim
} from "@/lib/supabase"
import { ScoreBadge, GradePill, VerdictPill } from "@/components/ScoreRing"

export default function ScorecardPage() {
    const { id } = useParams<{ id: string }>()
    const [card, setCard]             = useState<Scorecard | null>(null)
    const [objections, setObjections] = useState<ScorecardObjection[]>([])
    const [claims, setClaims]         = useState<ScorecardClaim[]>([])
    const [comment, setComment]       = useState("")
    const [submitting, setSubmitting] = useState(false)
    const [loading, setLoading]       = useState(true)
    const [activeTab, setActiveTab]   = useState<"overview" | "objections" | "claims" | "transcript" | "coach">("overview")
    const [transcript, setTranscript] = useState<string | null>(null)
    const [transcriptState, setTranscriptState] = useState<"idle" | "loading" | "loaded">("idle")

    useEffect(() => { if (id) load() }, [id])

    async function load() {
        try {
            const { data: sc } = await supabase
                .from("session_scorecards")
                .select("*")
                .eq("id", id)
                .single()
            setCard(sc as Scorecard)

            const [objRes, claimRes] = await Promise.all([
                supabase.from("scorecard_objections").select("*").eq("scorecard_id", id).order("transcript_ts"),
                supabase.from("scorecard_claims").select("*").eq("scorecard_id", id).order("transcript_ts"),
            ])
            setObjections((objRes.data ?? []) as ScorecardObjection[])
            setClaims((claimRes.data ?? []) as ScorecardClaim[])
        } finally {
            setLoading(false)
        }
    }

    async function loadTranscript() {
        if (transcriptState !== "idle") return
        setTranscriptState("loading")
        const { data } = await supabase.rpc("get_scorecard_transcript", { p_scorecard_id: id })
        setTranscript(typeof data === "string" ? data : null)
        setTranscriptState("loaded")
    }

    function openTab(key: typeof activeTab) {
        setActiveTab(key)
        if (key === "transcript") loadTranscript()
    }

    async function postComment() {
        if (!comment.trim() || !card) return
        setSubmitting(true)
        try {
            await supabase.from("coaching_comments").insert({
                scorecard_id: card.id,
                org_id:       card.org_id,
                author_id:    (await supabase.auth.getUser()).data.user?.id,
                body:         comment.trim(),
            })
            setComment("")
        } finally {
            setSubmitting(false)
        }
    }

    if (loading) return <div className="text-gray-500 text-sm">Loading…</div>
    if (!card)   return <div className="text-red-600 text-sm">Scorecard not found or access denied.</div>

    const tabs = [
        { key: "overview",   label: "Overview"   },
        { key: "objections", label: `Objections (${objections.length})` },
        { key: "claims",     label: `Claims (${claims.length})`         },
        { key: "transcript", label: "Transcript" },
        { key: "coach",      label: "Coach"      },
    ] as const

    const stageKeys = Object.keys(card.adherence ?? {})
    const breaches  = card.guardrail_breaches ?? []
    const highlights = card.highlights ?? []

    return (
        <div className="space-y-6">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm text-gray-500">
                <Link href="/"    className="hover:text-gray-900 transition-colors">Overview</Link>
                <span>/</span>
                <Link href="/team" className="hover:text-gray-900 transition-colors">Team</Link>
                <span>/</span>
                <span className="text-gray-700">Scorecard</span>
            </div>

            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900">
                        {card.session_title
                            ?? (card.started_at
                                ? new Date(card.started_at).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" })
                                : "Session Scorecard")}
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        {card.started_at ? new Date(card.started_at).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" }) + " · " : ""}
                        {card.duration_minutes ? `${card.duration_minutes} min` : "—"}
                        {card.talk_ratio != null ? ` · Rep spoke ${Math.round(card.talk_ratio * 100)}%` : ""}
                        {" · "}{card.session_source === "plus_conversations" ? "iOS" : "macOS"}
                        {card.model_version ? ` · ${card.model_version}` : ""}
                    </p>
                </div>
            </div>

            {/* Score tiles */}
            <div className="grid grid-cols-4 gap-4">
                <ScoreCard label="Overall"    score={card.overall_score}   />
                <ScoreCard label="Adherence"  score={card.adherence_score} />
                <ScoreCard label="Objections" score={card.objection_score} />
                <ScoreCard label="Accuracy"   score={card.accuracy_score}  />
            </div>

            {/* Guardrail alert */}
            {breaches.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
                    <h3 className="text-sm font-medium text-red-700">⚠ Guardrail breaches ({breaches.length})</h3>
                    {breaches.map((b, i) => (
                        <div key={i} className="space-y-1">
                            <p className="text-sm text-gray-900">{b.rule}</p>
                            <p className="text-xs text-gray-500 italic">&quot;{b.transcript_quote}&quot;</p>
                            <span className={`text-xs px-2 py-0.5 rounded border ${b.severity === "critical" ? "border-red-200 text-red-700 bg-red-50" : "border-amber-200 text-amber-700 bg-amber-50"}`}>
                                {b.severity}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Tabs */}
            <div className="border-b border-[var(--color-border)] flex gap-1">
                {tabs.map(t => (
                    <button
                        key={t.key}
                        onClick={() => openTab(t.key)}
                        className={`px-4 py-2 text-sm border-b-2 transition-colors -mb-px ${
                            activeTab === t.key
                                ? "border-[var(--color-accent)] text-[var(--color-accent)] font-medium"
                                : "border-transparent text-gray-500 hover:text-gray-900"
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            {activeTab === "overview" && (
                <div className="space-y-6">
                    {/* Stage adherence */}
                    {stageKeys.length > 0 && (
                        <div>
                            <h2 className="text-sm font-medium text-gray-900 mb-3">Stage adherence</h2>
                            <div className="space-y-2">
                                {stageKeys.map(key => {
                                    const stage = card.adherence[key]
                                    return (
                                        <div key={key} className="bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] p-4">
                                            <div className="flex items-start justify-between">
                                                <span className="text-sm font-medium text-gray-900 capitalize">{key.replace(/_/g, " ")}</span>
                                                <span className={`text-xs px-2 py-0.5 rounded border ${stage.completed ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                                                    {stage.completed ? "Complete" : "Incomplete"}
                                                </span>
                                            </div>
                                            {stage.evidence && <p className="text-xs text-gray-500 mt-1 italic">&quot;{stage.evidence}&quot;</p>}
                                            {stage.missed?.length > 0 && (
                                                <div className="mt-2">
                                                    <p className="text-xs text-gray-500 mb-1">Missing:</p>
                                                    <ul className="space-y-0.5">
                                                        {stage.missed.map((m, i) => (
                                                            <li key={i} className="text-xs text-amber-700 flex items-start gap-1">
                                                                <span>·</span><span>{m}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* Highlights */}
                    {highlights.length > 0 && (
                        <div>
                            <h2 className="text-sm font-medium text-gray-900 mb-3">Moments</h2>
                            <div className="space-y-1.5">
                                {highlights.map((h, i) => (
                                    <div key={i} className="flex items-start gap-3 text-sm">
                                        <span className={`text-lg leading-none mt-0.5 ${h.kind === "best" ? "text-emerald-600" : h.kind === "worst" ? "text-red-600" : "text-amber-500"}`}>
                                            {h.kind === "best" ? "★" : h.kind === "worst" ? "✗" : "⚑"}
                                        </span>
                                        <span className="text-gray-700">{h.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Growth areas */}
                    {card.growth_areas?.length > 0 && (
                        <div>
                            <h2 className="text-sm font-medium text-gray-900 mb-2">Growth areas</h2>
                            <ul className="space-y-1">
                                {card.growth_areas.map((g, i) => (
                                    <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                                        <span className="text-[var(--color-accent)] mt-0.5">→</span>{g}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {activeTab === "objections" && (
                <div className="space-y-3">
                    {objections.length === 0 && <p className="text-sm text-gray-500">No objections recorded (or visibility tier restricts access).</p>}
                    {objections.map(o => (
                        <div key={o.id} className="bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] p-4 space-y-2">
                            <div className="flex items-start justify-between">
                                <p className="text-sm font-medium text-gray-900">&quot;{o.objection_text}&quot;</p>
                                <GradePill grade={o.grade} />
                            </div>
                            {o.response_excerpt && <p className="text-xs text-gray-500 italic">Rep: &quot;{o.response_excerpt}&quot;</p>}
                            {o.grade_rationale && <p className="text-xs text-gray-500">{o.grade_rationale}</p>}
                        </div>
                    ))}
                </div>
            )}

            {activeTab === "claims" && (
                <div className="space-y-2">
                    {claims.length === 0 && <p className="text-sm text-gray-500">No claims recorded (or visibility tier restricts access).</p>}
                    {claims.map(c => (
                        <div key={c.id} className="bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] p-4 space-y-2">
                            <div className="flex items-start justify-between gap-3">
                                <p className="text-sm text-gray-900">{c.claim}</p>
                                <VerdictPill verdict={c.verdict} />
                            </div>
                            {c.kb_excerpt && <p className="text-xs text-gray-500 italic">KB: &quot;{c.kb_excerpt}&quot;</p>}
                        </div>
                    ))}
                </div>
            )}

            {activeTab === "transcript" && (
                <TranscriptView state={transcriptState} transcript={transcript} />
            )}

            {activeTab === "coach" && (
                <div className="space-y-4">
                    <p className="text-sm text-gray-500">Leave a coaching note on this session. The rep will see it in their app.</p>
                    <textarea
                        value={comment}
                        onChange={e => setComment(e.target.value)}
                        placeholder="Add coaching feedback…"
                        rows={4}
                        className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[var(--color-accent)] resize-none"
                    />
                    <button
                        onClick={postComment}
                        disabled={submitting || !comment.trim()}
                        className="px-4 py-2 bg-[var(--color-accent)] hover:bg-[var(--color-accent-light)] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                    >
                        {submitting ? "Posting…" : "Post comment"}
                    </button>
                </div>
            )}
        </div>
    )
}

function TranscriptView({ state, transcript }: { state: "idle" | "loading" | "loaded"; transcript: string | null }) {
    if (state === "loading") return <p className="text-sm text-gray-500">Loading transcript…</p>
    if (!transcript) {
        return (
            <p className="text-sm text-gray-500">
                Transcript isn&apos;t available for this session, or your org&apos;s visibility tier
                (Settings → Transcript visibility) restricts full transcripts to managers.
            </p>
        )
    }

    // iOS sessions store a JSON array of {speaker,text}; macOS stores plain text.
    let turns: Array<{ speaker?: string; text?: string }> | null = null
    try {
        const parsed = JSON.parse(transcript)
        if (Array.isArray(parsed)) turns = parsed
    } catch { /* plain text */ }

    if (!turns) {
        return (
            <pre className="text-sm text-gray-800 whitespace-pre-wrap bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 font-sans">
                {transcript}
            </pre>
        )
    }

    return (
        <div className="space-y-3">
            {turns.map((t, i) => {
                const isSelf = t.speaker === "self"
                return (
                    <div key={i} className={`flex ${isSelf ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                            isSelf
                                ? "bg-[var(--color-accent)] text-white"
                                : "bg-[var(--color-surface)] border border-[var(--color-border)] text-gray-900"
                        }`}>
                            <div className={`text-[11px] mb-0.5 ${isSelf ? "text-white/70" : "text-gray-400"}`}>
                                {isSelf ? "Rep" : "Other"}
                            </div>
                            <div className="text-sm">{t.text}</div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

function ScoreCard({ label, score }: { label: string; score: number | null }) {
    return (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 flex flex-col items-center gap-2">
            <ScoreBadge label={label} score={score} />
        </div>
    )
}
