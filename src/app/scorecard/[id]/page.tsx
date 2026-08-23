"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
    supabase, askAboutTranscript, type Scorecard, type ScorecardObjection,
    type ScorecardClaim
} from "@/lib/supabase"
import { ScoreBadge, GradePill, VerdictPill } from "@/components/ScoreRing"
import { AskPanel } from "@/components/AskPanel"
import { useLocale, useT } from "@/i18n/LocaleProvider"

export default function ScorecardPage() {
    const { id } = useParams<{ id: string }>()
    const { t, intl } = useLocale()
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
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { window.location.replace("/login"); return }
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

    if (loading) return <div className="text-[var(--color-text-secondary)] text-sm">{t.common.loading}</div>
    if (!card)   return <div className="text-red-600 text-sm">{t.scorecard.notFound}</div>

    const tabs = [
        { key: "overview",   label: t.scorecard.tabOverview               },
        { key: "objections", label: t.scorecard.tabObjections(objections.length) },
        { key: "claims",     label: t.scorecard.tabClaims(claims.length)  },
        { key: "transcript", label: t.scorecard.tabTranscript             },
        { key: "coach",      label: t.scorecard.tabCoach                  },
    ] as const

    const stageKeys = Object.keys(card.adherence ?? {})
    const breaches  = card.guardrail_breaches ?? []
    const highlights = card.highlights ?? []

    return (
        <div className="space-y-6">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                <Link href="/"    className="hover:text-[var(--color-text)] transition-colors">{t.scorecard.crumbOverview}</Link>
                <span>/</span>
                <Link href="/team" className="hover:text-[var(--color-text)] transition-colors">{t.scorecard.crumbTeam}</Link>
                <span>/</span>
                <span className="text-[var(--color-text-secondary)]">{t.scorecard.crumbScorecard}</span>
            </div>

            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-[var(--color-text)]">
                        {card.session_title
                            ?? (card.started_at
                                ? new Date(card.started_at).toLocaleString(intl, { dateStyle: "long", timeStyle: "short" })
                                : t.scorecard.sessionScorecard)}
                    </h1>
                    <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                        {card.started_at ? new Date(card.started_at).toLocaleString(intl, { dateStyle: "long", timeStyle: "short" }) + " · " : ""}
                        {card.duration_minutes ? t.common.min(card.duration_minutes) : "—"}
                        {card.talk_ratio != null ? ` · ${t.scorecard.repSpoke(Math.round(card.talk_ratio * 100))}` : ""}
                        {" · "}{card.session_source === "plus_conversations" ? "iOS" : "macOS"}
                        {card.model_version ? ` · ${card.model_version}` : ""}
                    </p>
                </div>
            </div>

            {/* Score tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <ScoreCard label={t.common.overall}    score={card.overall_score}   />
                <ScoreCard label={t.common.adherence}  score={card.adherence_score} />
                <ScoreCard label={t.common.objections} score={card.objection_score} />
                <ScoreCard label={t.common.accuracy}   score={card.accuracy_score}  />
            </div>

            {/* Guardrail alert */}
            {breaches.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
                    <h3 className="text-sm font-medium text-red-700">{t.scorecard.guardrailBreaches(breaches.length)}</h3>
                    {breaches.map((b, i) => (
                        <div key={i} className="space-y-1">
                            <p className="text-sm text-[var(--color-text)]">{b.rule}</p>
                            <p className="text-xs text-[var(--color-text-secondary)] italic">&quot;{b.transcript_quote}&quot;</p>
                            <span className={`text-xs px-2 py-0.5 rounded border ${b.severity === "critical" ? "border-red-200 text-red-700 bg-red-50" : "border-amber-200 text-amber-700 bg-amber-50"}`}>
                                {t.data.severities[b.severity] ?? b.severity}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Tabs */}
            <div className="border-b border-[var(--color-border)] flex gap-1 overflow-x-auto">
                {tabs.map(tabDef => (
                    <button
                        key={tabDef.key}
                        onClick={() => openTab(tabDef.key)}
                        className={`px-4 py-2 text-sm border-b-2 transition-colors -mb-px whitespace-nowrap shrink-0 ${
                            activeTab === tabDef.key
                                ? "border-[var(--color-accent)] text-[var(--color-accent)] font-medium"
                                : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                        }`}
                    >
                        {tabDef.label}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            {activeTab === "overview" && (
                <div className="space-y-6">
                    {/* Stage adherence */}
                    {stageKeys.length > 0 && (
                        <div>
                            <h2 className="text-sm font-medium text-[var(--color-text)] mb-3">{t.scorecard.stageAdherence}</h2>
                            <div className="space-y-2">
                                {stageKeys.map(key => {
                                    const stage = card.adherence[key]
                                    return (
                                        <div key={key} className="bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] p-4">
                                            <div className="flex items-start justify-between">
                                                <span className="text-sm font-medium text-[var(--color-text)] capitalize">{key.replace(/_/g, " ")}</span>
                                                <span className={`text-xs px-2 py-0.5 rounded border ${stage.completed ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                                                    {stage.completed ? t.scorecard.complete : t.scorecard.incomplete}
                                                </span>
                                            </div>
                                            {stage.evidence && <p className="text-xs text-[var(--color-text-secondary)] mt-1 italic">&quot;{stage.evidence}&quot;</p>}
                                            {stage.missed?.length > 0 && (
                                                <div className="mt-2">
                                                    <p className="text-xs text-[var(--color-text-secondary)] mb-1">{t.scorecard.missing}</p>
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
                            <h2 className="text-sm font-medium text-[var(--color-text)] mb-3">{t.scorecard.moments}</h2>
                            <div className="space-y-1.5">
                                {highlights.map((h, i) => (
                                    <div key={i} className="flex items-start gap-3 text-sm">
                                        <span className={`text-lg leading-none mt-0.5 ${h.kind === "best" ? "text-emerald-600" : h.kind === "worst" ? "text-red-600" : "text-amber-500"}`}>
                                            {h.kind === "best" ? "★" : h.kind === "worst" ? "✗" : "⚑"}
                                        </span>
                                        <span className="text-[var(--color-text-secondary)]">{h.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Growth areas */}
                    {card.growth_areas?.length > 0 && (
                        <div>
                            <h2 className="text-sm font-medium text-[var(--color-text)] mb-2">{t.scorecard.growthAreas}</h2>
                            <ul className="space-y-1">
                                {card.growth_areas.map((g, i) => (
                                    <li key={i} className="text-sm text-[var(--color-text-secondary)] flex items-start gap-2">
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
                    {objections.length === 0 && <p className="text-sm text-[var(--color-text-secondary)]">{t.scorecard.noObjections}</p>}
                    {objections.map(o => (
                        <div key={o.id} className="bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] p-4 space-y-2">
                            <div className="flex items-start justify-between">
                                <p className="text-sm font-medium text-[var(--color-text)]">&quot;{o.objection_text}&quot;</p>
                                <GradePill grade={o.grade} />
                            </div>
                            {o.response_excerpt && <p className="text-xs text-[var(--color-text-secondary)] italic">{t.scorecard.repQuote} &quot;{o.response_excerpt}&quot;</p>}
                            {o.grade_rationale && <p className="text-xs text-[var(--color-text-secondary)]">{o.grade_rationale}</p>}
                        </div>
                    ))}
                </div>
            )}

            {activeTab === "claims" && (
                <div className="space-y-2">
                    {claims.length === 0 && <p className="text-sm text-[var(--color-text-secondary)]">{t.scorecard.noClaims}</p>}
                    {claims.map(c => (
                        <div key={c.id} className="bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] p-4 space-y-2">
                            <div className="flex items-start justify-between gap-3">
                                <p className="text-sm text-[var(--color-text)]">{c.claim}</p>
                                <VerdictPill verdict={c.verdict} />
                            </div>
                            {c.kb_excerpt && <p className="text-xs text-[var(--color-text-secondary)] italic">{t.scorecard.kbQuote} &quot;{c.kb_excerpt}&quot;</p>}
                        </div>
                    ))}
                </div>
            )}

            {activeTab === "transcript" && (
                <div className="space-y-6">
                    {transcriptState === "loaded" && transcript && (
                        <AskPanel
                            heading={t.scorecard.askHeading}
                            placeholder={t.scorecard.askPlaceholder}
                            suggestions={t.scorecard.suggestions}
                            onAsk={(q, h) => askAboutTranscript(transcriptToText(transcript), q, h)}
                        />
                    )}
                    <TranscriptView state={transcriptState} transcript={transcript} />
                </div>
            )}

            {activeTab === "coach" && (
                <div className="space-y-4">
                    <p className="text-sm text-[var(--color-text-secondary)]">{t.scorecard.coachNote}</p>
                    <textarea
                        value={comment}
                        onChange={e => setComment(e.target.value)}
                        placeholder={t.scorecard.coachPlaceholder}
                        rows={4}
                        className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)] resize-none"
                    />
                    <button
                        onClick={postComment}
                        disabled={submitting || !comment.trim()}
                        className="px-4 py-2 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] disabled:opacity-40 disabled:cursor-not-allowed text-[var(--btn-ink)] text-sm font-medium rounded-lg transition-colors"
                    >
                        {submitting ? t.scorecard.posting : t.scorecard.postComment}
                    </button>
                </div>
            )}
        </div>
    )
}

// Normalize a stored transcript (iOS speaker-JSON or macOS text) into readable
// "Rep:/Other:" lines for the model.
function transcriptToText(transcript: string): string {
    try {
        const parsed = JSON.parse(transcript)
        if (Array.isArray(parsed)) {
            return parsed
                .map((t: { speaker?: string; text?: string }) =>
                    `${t.speaker === "self" ? "Rep" : "Other"}: ${t.text ?? ""}`)
                .join("\n")
        }
    } catch { /* plain text */ }
    return transcript
}

function TranscriptView({ state, transcript }: { state: "idle" | "loading" | "loaded"; transcript: string | null }) {
    const t = useT()
    if (state === "loading") return <p className="text-sm text-[var(--color-text-secondary)]">{t.scorecard.loadingTranscript}</p>
    if (!transcript) {
        return (
            <p className="text-sm text-[var(--color-text-secondary)]">
                {t.scorecard.transcriptUnavailable}
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
            <pre className="text-sm text-[var(--color-text)] whitespace-pre-wrap bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 font-sans">
                {transcript}
            </pre>
        )
    }

    return (
        <div className="space-y-3">
            {turns.map((turn, i) => {
                const isSelf = turn.speaker === "self"
                return (
                    <div key={i} className={`flex ${isSelf ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                            isSelf
                                ? "bg-[var(--btn-bg)] text-[var(--btn-ink)]"
                                : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)]"
                        }`}>
                            <div className={`text-[11px] mb-0.5 ${isSelf ? "text-[var(--btn-ink)] opacity-70" : "text-[var(--color-muted)]"}`}>
                                {isSelf ? t.scorecard.speakerRep : t.scorecard.speakerOther}
                            </div>
                            <div className="text-sm">{turn.text}</div>
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
