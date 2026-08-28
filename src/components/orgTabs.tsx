"use client"

import Link from "next/link"
import { useEffect, useState, useCallback, useRef } from "react"
import { embedObjections, reindexObjections, ingestKnowledgeInline, ingestKnowledgeInlineVerbose, reindexKnowledgeVerbose, approvedResponsesFrom, guidanceOf, normalizeSeverity } from "@/lib/orgBrain"
import { supabase } from "@/lib/supabase"
import { SearchBox } from "@/components/SearchBox"
import { STOCK_PRACTICE_SCENARIOS } from "@/lib/stockPracticeScenarios"
import { rollUpGuardrails } from "@/lib/guardrails"
import { PlaybookAssignment, type AssignTarget } from "@/components/playbookAssignment"
import { TeamsSection } from "@/components/teamsSection"
import { StarterKitPicker } from "@/components/starterKitPicker"
import { VERTICALS, type Vertical } from "@/lib/starterKit"
import { extractTextFromFile, UnsupportedFileError, EmptyDocumentError, EXTRACT_ACCEPT } from "@/lib/extractText"
import { EmailLink } from "@/components/EmailLink"
import { useLocale, useT } from "@/i18n/LocaleProvider"
import { clientLocale, type Dict } from "@/i18n"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrgInfo {
    id: string; name: string; slug: string; plan: string
    visibility: string; seats_purchased: number
    status: string; cancel_at: string | null
    trial_ends_at?: string | null
    stripe_subscription_id?: string | null
    voice_profile: { tone?: string; values?: string; self_reference?: string; banned_phrases?: string[]; required_phrases?: string[] }
    settings?: { rep_visibility?: { playbook?: boolean; knowledge?: boolean } } & Record<string, unknown>
}
interface KbRow    { id: string; title: string; kind: string; status: string; summary: string | null; created_at: string; team_id: string | null; user_id: string | null }
interface ObjRow   { id: string; objection: string; response_guidance: string | null; approved_responses: { text?: string }[] | null; severity: string; active: boolean; variants: string[] | null; source: string | null; team_id: string | null; user_id: string | null }
interface PbStage  { key?: string; name: string; description: string; required?: string[]; required_items: string[]; guardrail_rules: Array<{type: string; keyword: string; action: string}> }
interface PbRow    { id: string; name: string; methodology: string | null; status: string; version: number; stages: PbStage[]; created_at: string }
interface MemberRow { user_id: string; email: string | null; role: string; status: string; joined_at: string }
interface InviteRow { id: string; email: string; role: string; accepted_at: string | null; expires_at: string; revoked_at: string | null }
interface TeamRow  { id: string; name: string }
interface PracticeAssignmentRow {
    id: string; title: string; note: string | null; due_at: string | null
    assignee_user_id: string | null; assignee_team_id: string | null; created_at: string
}

interface StageForm {
    name: string; description: string; requiredItems: string
    guardrails: Array<{ keyword: string; action: string }>
}

interface ExtractedObjection {
    objection: string; response_guidance: string; severity: string; variants: string[]
}

export type AdminTab = "settings" | "knowledge" | "objections" | "playbooks" | "practice" | "members" | "billing" | "dna" | "voice"
type DNAStep = "collect" | "analyzing" | "review"
type DNAReviewTab = "tone" | "phrases" | "objections" | "flow"

interface TranscriptEntry {
    id: string
    text: string
    expertSpeaker: string
    // Optional "whose call was this" tag, stored with the transcript so the
    // review step can say where the analysis came from. Display-only — the
    // model is never told about it and no per-rep analysis is claimed.
    repLabel: string
    detectedSpeakers: string[]
}

interface DNAResult {
    summary: string
    tone: { descriptors: string[]; evidence: string }
    power_phrases: Array<{ phrase: string; context: string; appears_in: string }>
    phrases_to_avoid: Array<{ pattern: string; why: string; better_alternative: string }>
    objections: Array<{
        objection: string
        expert_response_summary: string
        example_quote: string
        severity: string
        response_guidance: string
    }>
    conversation_flow: {
        methodology_guess: string
        stages: Array<{ name: string; description: string; required_items: string[]; transition_signal: string }>
    }
}

// ─── Shared UI atoms ──────────────────────────────────────────────────────────

const INPUT = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
const TEXTAREA = INPUT + " resize-none"
const BTN_PRIMARY = "px-4 py-2 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] disabled:opacity-40 text-[var(--btn-ink)] text-sm font-medium rounded-lg transition-colors"
const BTN_GHOST = "px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)] border border-[var(--color-border)] hover:border-[var(--color-muted)] rounded-lg transition-colors disabled:opacity-40"
const BTN_DANGER = "px-3 py-1.5 text-xs text-red-600 hover:text-red-700 border border-red-200 hover:border-red-300 rounded-lg transition-colors disabled:opacity-40"
const CARD = "bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm"
const ROW = "flex items-center justify-between bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] px-4 py-3 gap-4 shadow-sm"

function StatusBadge({ label, color }: { label: string; color: "green" | "yellow" | "red" | "slate" | "indigo" }) {
    const colors = {
        green:  "border-emerald-200 text-emerald-700 bg-emerald-50",
        yellow: "border-amber-200 text-amber-700 bg-amber-50",
        red:    "border-red-200 text-red-700 bg-red-50",
        slate:  "border-[var(--color-border)] text-[var(--color-text-secondary)] bg-[var(--color-bg)]",
        indigo: "border-teal-200 text-teal-700 bg-teal-50",
    }
    return <span className={`text-xs px-2 py-0.5 rounded border capitalize ${colors[color]}`}>{label}</span>
}

function Msg({ msg, error }: { msg: string | null; error?: boolean }) {
    if (!msg) return null
    return <p className={`text-xs ${error ? "text-red-600" : "text-emerald-600"}`}>{msg}</p>
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[var(--color-text)]">{title}</h2>
            {action}
        </div>
    )
}

/// Upload is the path we want people on; typing it in by hand is the escape
/// hatch (D-180). Showing both at full weight made every one of these tabs read
/// as "here are six boxes, good luck" — so the manual form collapses behind one
/// line of text and opens on demand.
///
/// `forceOpen` matters: the moment a file is parsed, its contents land in these
/// very fields, so the section must open by itself and retitle to "Review &
/// save". A collapsed section hiding a freshly-parsed document would look like
/// the upload silently failed.
function ManualSection({
    label, openLabel, forceOpen, children,
}: {
    label: string
    openLabel?: string
    forceOpen?: boolean
    children: React.ReactNode
}) {
    const [open, setOpen] = useState(false)
    const isOpen = open || !!forceOpen

    if (!isOpen) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="w-full text-center py-2 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-accent-deep)] transition-colors"
            >
                {label} ↓
            </button>
        )
    }
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--color-text-secondary)]">{openLabel ?? label}</span>
                {!forceOpen && (
                    <button type="button" onClick={() => setOpen(false)}
                        className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors">
                        ↑
                    </button>
                )}
            </div>
            {children}
        </div>
    )
}

function UploadZone({
    fileRef, onChange, loading, accept, title, subtitle,
}: {
    fileRef: React.RefObject<HTMLInputElement | null>
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
    loading: boolean
    accept: string
    title: string
    subtitle: string
}) {
    const t = useT()
    return (
        <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={loading}
            className="w-full border-2 border-dashed border-[var(--color-accent)] rounded-xl p-8 flex flex-col items-center gap-3 bg-teal-50/50 hover:bg-teal-50 transition-colors disabled:opacity-60 disabled:cursor-wait group"
        >
            <input ref={fileRef} type="file" accept={accept} className="hidden" onChange={onChange} />
            <div className="w-12 h-12 bg-[var(--color-accent)] rounded-xl flex items-center justify-center group-disabled:opacity-60">
                {loading ? (
                    <svg className="w-6 h-6 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z"/>
                    </svg>
                ) : (
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                )}
            </div>
            <div className="text-center">
                <p className="text-sm font-semibold text-[var(--color-accent)]">
                    {loading ? t.tabs.analyzing : title}
                </p>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">{subtitle}</p>
            </div>
            {!loading && (
                <span className="text-xs text-[var(--color-accent)] border border-[var(--color-accent)] rounded-lg px-3 py-1.5 font-medium">
                    {t.tabs.chooseFile}
                </span>
            )}
        </button>
    )
}

/// Raw Postgres/PostgREST text ("violates check constraint …") reads as a
/// crash to an owner (D-175). Our own edge functions already return humane
/// messages — pass those through; translate anything that smells like the
/// database, and keep the raw text in the console for debugging.
function humanError(raw: string | null | undefined, doing: string, t: Dict): string {
    const r = (raw ?? "").trim()
    const dbSmell = /violates|constraint|relation |column |duplicate key|syntax error|permission denied|row-level security|foreign key|null value in/i
    if (!r) return t.tabs.cantDo(doing)
    if (dbSmell.test(r)) {
        console.error(`[${doing}]`, r)
        return t.tabs.cantDo(doing)
    }
    return r
}

/// Provenance chip for an objection row. NULL source (manual adds, and every
/// row that predates the column) shows no chip — "unlabeled = yours" is the
/// right default; the chip exists so SEEDED content can't be mistaken for a
/// data leak.
function sourceBadge(source: string | null, t: Dict): string | null {
    if (!source || source === "manual") return null
    if (source === "starter_kit") return t.tabs.objections.sourceStarterKit
    if (source === "team_dna")    return t.tabs.objections.sourceTeamDna
    if (source.startsWith("document")) return t.tabs.objections.sourceDocument
    return null
}

function errStr(e: unknown): string {
    if (!e) return ""
    if (typeof e === "string") return e
    if (typeof e === "object" && "message" in (e as Record<string, unknown>)) return String((e as Record<string, unknown>).message)
    return JSON.stringify(e)
}

/// One audience per knowledge/objection row — the whole workspace, one team, or
/// one person — written straight onto team_id/user_id. Deliberately simpler
/// than playbooks' multi-row assignments: scope here is a retrieval filter the
/// matching RPCs already honor, not a rollout plan.
interface AudienceScope { team_id: string | null; user_id: string | null }

function audienceValue(s: AudienceScope): string {
    return s.user_id ? `user:${s.user_id}` : s.team_id ? `team:${s.team_id}` : "all"
}

function audienceFromValue(v: string): AudienceScope {
    if (v.startsWith("team:")) return { team_id: v.slice(5), user_id: null }
    if (v.startsWith("user:")) return { team_id: null, user_id: v.slice(5) }
    return { team_id: null, user_id: null }
}

function AudienceSelect({ scope, teams, people, onChange }: {
    scope: AudienceScope
    teams: AssignTarget[]
    people: AssignTarget[]
    onChange: (next: AudienceScope) => void
}) {
    const t = useT()
    const isEveryone = !scope.team_id && !scope.user_id
    return (
        <select
            aria-label={t.tabs.audience.label}
            title={t.tabs.audience.label}
            value={audienceValue(scope)}
            onChange={e => onChange(audienceFromValue(e.target.value))}
            className={`max-w-[9rem] text-xs px-2 py-1 rounded-lg border bg-[var(--color-bg)] transition-colors focus:outline-none focus:border-[var(--color-accent)] ${
                isEveryone ? "border-[var(--color-border)] text-[var(--color-muted)]"
                           : "border-teal-200 text-teal-700"}`}
        >
            <option value="all">{t.tabs.audience.everyone}</option>
            {teams.length > 0 && (
                <optgroup label={t.tabs.audience.teamsGroup}>
                    {teams.map(x => <option key={x.id} value={`team:${x.id}`}>{x.label}</option>)}
                </optgroup>
            )}
            {people.length > 0 && (
                <optgroup label={t.tabs.audience.peopleGroup}>
                    {people.map(x => <option key={x.id} value={`user:${x.id}`}>{x.label}</option>)}
                </optgroup>
            )}
        </select>
    )
}

/// The knowledge kind options are the `org_knowledge_kind_check` CHECK
/// constraint, verbatim. They used to be a different vocabulary entirely
/// (product / competitive / methodology / objection_playbook / other) of which
/// only case_study was accepted, so every upload through the form died on a
/// constraint violation — D-190. One list, used by every form that writes kind.
function KindOptions({ t }: { t: Dict }) {
    return (<>
        <option value="doc">{t.tabs.knowledge.kindDoc}</option>
        <option value="pricing">{t.tabs.knowledge.kindPricing}</option>
        <option value="battlecard">{t.tabs.knowledge.kindBattlecard}</option>
        <option value="faq">{t.tabs.knowledge.kindFaq}</option>
        <option value="objection">{t.tabs.knowledge.kindObjection}</option>
        <option value="compliance">{t.tabs.knowledge.kindCompliance}</option>
        <option value="case_study">{t.tabs.knowledge.kindCaseStudy}</option>
    </>)
}

/// Rebuild a document's text from its indexed chunks — the only copy the
/// browser can reach (the storage bucket has no client-side read policy).
/// ingest-knowledge writes 500-token chunks with a 50-token overlap, and both
/// are word-based (1 token ≈ 0.75 words), so dropping each later chunk's
/// overlap prefix reconstructs the exact word sequence. What it can NOT
/// reconstruct is formatting: chunking split on /\s+/, so line breaks are
/// gone — the edit UI says so instead of pretending this is the original file.
const CHUNK_OVERLAP_WORDS = Math.ceil(50 / 0.75)

function reassembleChunks(chunks: { chunk_index: number; content: string }[]): string {
    return [...chunks]
        .sort((a, b) => a.chunk_index - b.chunk_index)
        .map((c, i) => i === 0 ? c.content : c.content.split(/\s+/).slice(CHUNK_OVERLAP_WORDS).join(" "))
        .join(" ")
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

const TONE_PRESETS = [
    "Consultative", "Empathetic", "Direct", "Data-driven", "Challenger",
    "Friendly", "Authoritative", "Confident", "Assertive", "Collaborative",
    "Professional", "Warm", "Analytical", "Strategic", "Persuasive",
    "Educational", "Casual", "Concise", "Transparent", "Energetic",
]

export function SettingsTab({ org, onSaved }: { org: OrgInfo; onSaved: () => void }) {
    const t = useT()
    const [name, setName]             = useState(org.name)
    const [visibility, setVisibility] = useState(org.visibility)
    // Rep visibility (D-172): reps seeing the playbook and knowledge titles in
    // their own app is the default — the fair-and-motivating setting. The
    // opt-out exists but is deliberately quiet: small text, no big toggle UI.
    const [repPlaybook, setRepPlaybook]   = useState(org.settings?.rep_visibility?.playbook !== false)
    const [repKnowledge, setRepKnowledge] = useState(org.settings?.rep_visibility?.knowledge !== false)
    // How this workspace tells the other side TalkPilot is listening (D-192).
    // Default OFF: TalkPilot has no bot in the call and does not record audio,
    // so there is nothing that announces itself — disclosure is a policy the
    // workspace chooses, and the honest default is not to claim one.
    const [recordingNotice, setRecordingNotice] =
        useState((org.settings?.recording_notice as string | undefined) ?? "off")
    const [saving, setSaving]         = useState(false)
    const [msg, setMsg]               = useState<string | null>(null)
    const [isErr, setIsErr]           = useState(false)

    async function save() {
        setSaving(true); setMsg(null)
        const settings = {
            ...(org.settings ?? {}),
            rep_visibility: { playbook: repPlaybook, knowledge: repKnowledge },
            recording_notice: recordingNotice,
        }
        const { error } = await supabase.from("organizations").update({ name, visibility, settings }).eq("id", org.id)
        setSaving(false)
        if (error) { setMsg(humanError(error.message, t.tabs.doingSaveSettings, t)); setIsErr(true) }
        else { setMsg(t.common.saved); setIsErr(false); onSaved() }
    }

    return (
        <div className="space-y-6 max-w-2xl">
            <div className={CARD + " space-y-4"}>
                <h3 className="text-sm font-semibold text-[var(--color-text)]">{t.tabs.settings.orgTitle}</h3>
                <div className="space-y-1">
                    <label className="text-xs text-[var(--color-text-secondary)] font-medium">{t.tabs.settings.name}</label>
                    <input className={INPUT} value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-[var(--color-text-secondary)] font-medium">{t.tabs.settings.transcriptVisibility}</label>
                    <select className={INPUT} value={visibility} onChange={e => setVisibility(e.target.value)}>
                        <option value="scores_only">{t.tabs.settings.visScores}</option>
                        <option value="flagged_moments">{t.tabs.settings.visFlagged}</option>
                        <option value="full_transcripts">{t.tabs.settings.visFull}</option>
                    </select>
                    <p className="text-xs text-[var(--color-text-secondary)] pt-1">
                        {t.tabs.settings.visEnforced}
                    </p>
                </div>
                <div className="pt-1 space-y-1.5">
                    <p className="text-xs text-[var(--color-text-secondary)]">
                        {t.tabs.settings.repVisibilityIntro}
                    </p>
                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
                            <input type="checkbox" checked={repPlaybook} onChange={e => setRepPlaybook(e.target.checked)}
                                className="accent-[var(--color-accent)] w-3.5 h-3.5" />
                            {t.tabs.settings.playbookVisible}
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
                            <input type="checkbox" checked={repKnowledge} onChange={e => setRepKnowledge(e.target.checked)}
                                className="accent-[var(--color-accent)] w-3.5 h-3.5" />
                            {t.tabs.settings.knowledgeVisible}
                        </label>
                    </div>
                </div>
                {/* Recording notice (D-192). TalkPilot puts no bot in the call
                    and does not record audio, so nothing announces itself —
                    which is exactly why this has to be a deliberate policy
                    choice rather than a default. */}
                <div className="pt-3 border-t border-[var(--color-border)] space-y-1.5">
                    <label className="text-xs text-[var(--color-text-secondary)] font-medium">{t.tabs.settings.recordingNotice}</label>
                    <select className={INPUT} value={recordingNotice} onChange={e => setRecordingNotice(e.target.value)}>
                        <option value="off">{t.tabs.settings.recordingOff}</option>
                        <option value="calendar_note">{t.tabs.settings.recordingCalendar}</option>
                        <option value="email">{t.tabs.settings.recordingEmail}</option>
                    </select>
                    <p className="text-xs text-[var(--color-text-secondary)] pt-1">
                        {t.tabs.settings.recordingHelp}
                    </p>
                    <p className="text-xs text-[var(--color-muted)]">
                        {t.tabs.settings.recordingLegal}
                    </p>
                </div>

                <div className="flex items-center gap-3 text-xs text-[var(--color-text-secondary)] bg-[var(--color-bg)] rounded-lg px-3 py-2">
                    <span>{t.tabs.settings.plan} <span className="text-[var(--color-text)] font-medium capitalize">{org.plan}</span></span>
                    <span>·</span>
                    <span>{t.tabs.settings.seats} <span className="text-[var(--color-text)] font-medium">{org.seats_purchased}</span></span>
                    <span>·</span>
                    <span>{t.tabs.settings.slug} <span className="text-[var(--color-text)] font-medium">{org.slug}</span></span>
                </div>
            </div>
            <div className="flex items-center gap-3">
                <button className={BTN_PRIMARY} onClick={save} disabled={saving}>
                    {saving ? t.common.saving : t.tabs.settings.saveSettings}
                </button>
                <Msg msg={msg} error={isErr} />
            </div>
        </div>
    )
}

// ─── Voice Tab (company voice & culture — lives under Playbook) ───────────────

export function VoiceTab({ org, onSaved }: { org: OrgInfo; onSaved: () => void }) {
    const t = useT()
    const existingTone = org.voice_profile?.tone ?? ""
    const matchedChips = TONE_PRESETS.filter(p => existingTone.toLowerCase().includes(p.toLowerCase()))
    const customRemainder = TONE_PRESETS.reduce(
        (acc, p) => acc.replace(new RegExp(p + ",?\\s*", "gi"), ""),
        existingTone
    ).trim().replace(/^,+|,+$/g, "").trim()

    const [toneChips, setToneChips]       = useState<string[]>(matchedChips)
    const [toneCustom, setToneCustom]     = useState(customRemainder)
    const [values, setValues]             = useState(org.voice_profile?.values ?? "")
    // Self-reference lost its UI on 2026-08-27 (owner e2e: one config field
    // nobody understood). The value still rides get_org_context as "Refer to
    // the company as:" in the live prompt, so an org that set one keeps it —
    // it just isn't editable here anymore; unset orgs let the coach use the
    // workspace name naturally.
    const selfRef = org.voice_profile?.self_reference ?? ""
    const [banned, setBanned]             = useState<string[]>(org.voice_profile?.banned_phrases ?? [])
    const [required, setRequired]         = useState<string[]>(org.voice_profile?.required_phrases ?? [])
    const [bannedInput, setBannedInput]   = useState("")
    const [requiredInput, setRequiredInput] = useState("")
    const [saving, setSaving]             = useState(false)
    const [msg, setMsg]                   = useState<string | null>(null)
    const [isErr, setIsErr]               = useState(false)

    function toggleChip(chip: string) {
        setToneChips(prev => prev.includes(chip) ? prev.filter(c => c !== chip) : [...prev, chip])
    }

    function addPhrase(list: string[], setList: (v: string[]) => void, input: string, setInput: (v: string) => void) {
        const val = input.trim()
        if (!val || list.includes(val)) { setInput(""); return }
        setList([...list, val]); setInput("")
    }

    async function save() {
        setSaving(true); setMsg(null)
        const toneParts = [...toneChips, ...(toneCustom.trim() ? [toneCustom.trim()] : [])]
        const { error } = await supabase.from("organizations").update({
            voice_profile: { tone: toneParts.join(", "), values, self_reference: selfRef, banned_phrases: banned, required_phrases: required },
        }).eq("id", org.id)
        setSaving(false)
        if (error) { setMsg(humanError(error.message, t.tabs.doingSaveSettings, t)); setIsErr(true) }
        else { setMsg(t.common.saved); setIsErr(false); onSaved() }
    }

    return (
        <div className="space-y-6 max-w-2xl">
            <div className={CARD + " space-y-5"}>
                <div>
                    <h3 className="text-sm font-semibold text-[var(--color-text)]">{t.tabs.voice.title}</h3>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-1">{t.tabs.voice.sub}</p>
                </div>

                {/* Tone of voice */}
                <div className="space-y-2">
                    <label className="text-xs text-[var(--color-text-secondary)] font-medium">{t.tabs.voice.tone}</label>
                    <div className="flex flex-wrap gap-2">
                        {TONE_PRESETS.map(chip => (
                            <button key={chip} type="button" onClick={() => toggleChip(chip)}
                                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                                    toneChips.includes(chip)
                                        ? "bg-[var(--btn-bg)] border-[var(--btn-bg)] text-[var(--btn-ink)]"
                                        : "bg-[var(--color-bg)] border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-muted)]"
                                }`}
                            >{chip}</button>
                        ))}
                    </div>
                    <input className={INPUT} placeholder={t.tabs.voice.customTone}
                        value={toneCustom} onChange={e => setToneCustom(e.target.value)} />
                </div>

                <div className="space-y-1">
                    <label className="text-xs text-[var(--color-text-secondary)] font-medium">{t.tabs.voice.values}</label>
                    <textarea className={TEXTAREA} rows={2} placeholder={t.tabs.voice.valuesPlaceholder}
                        value={values} onChange={e => setValues(e.target.value)} />
                </div>
                {/* Phrases. Say what these actually do (owner e2e 2026-08-27):
                    they ride the live-coach prompt on every client. They do NOT
                    reach scoring — that is the playbook guardrails' job — so the
                    copy must not promise it. */}
                <p className="text-xs text-[var(--color-muted)]">{t.tabs.voice.phrasesUsage}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Banned */}
                    <div className="space-y-2">
                        <label className="text-xs text-[var(--color-text-secondary)] font-medium">{t.tabs.voice.banned}</label>
                        <div className="space-y-1.5 min-h-[2rem]">
                            {banned.map((p, i) => (
                                <div key={i} className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5">
                                    <span className="text-xs text-red-700 flex-1 truncate">{p}</span>
                                    <button type="button" onClick={() => setBanned(banned.filter((_, j) => j !== i))}
                                        className="text-red-400 hover:text-red-600 flex-shrink-0 leading-none">×</button>
                                </div>
                            ))}
                            {banned.length === 0 && <p className="text-xs text-[var(--color-muted)]">{t.tabs.voice.noBanned}</p>}
                        </div>
                        <div className="flex gap-2">
                            <input
                                className="flex-1 min-w-0 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-xs text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                                placeholder={t.tabs.voice.bannedPlaceholder}
                                value={bannedInput}
                                onChange={e => setBannedInput(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addPhrase(banned, setBanned, bannedInput, setBannedInput) } }}
                            />
                            <button type="button" className={BTN_GHOST} onClick={() => addPhrase(banned, setBanned, bannedInput, setBannedInput)}>{t.common.add}</button>
                        </div>
                    </div>
                    {/* Required */}
                    <div className="space-y-2">
                        <label className="text-xs text-[var(--color-text-secondary)] font-medium">{t.tabs.voice.required}</label>
                        <div className="space-y-1.5 min-h-[2rem]">
                            {required.map((p, i) => (
                                <div key={i} className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-1.5">
                                    <span className="text-xs text-emerald-700 flex-1 truncate">{p}</span>
                                    <button type="button" onClick={() => setRequired(required.filter((_, j) => j !== i))}
                                        className="text-emerald-400 hover:text-emerald-600 flex-shrink-0 leading-none">×</button>
                                </div>
                            ))}
                            {required.length === 0 && <p className="text-xs text-[var(--color-muted)]">{t.tabs.voice.noRequired}</p>}
                        </div>
                        <div className="flex gap-2">
                            <input
                                className="flex-1 min-w-0 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-xs text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                                placeholder={t.tabs.voice.requiredPlaceholder}
                                value={requiredInput}
                                onChange={e => setRequiredInput(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addPhrase(required, setRequired, requiredInput, setRequiredInput) } }}
                            />
                            <button type="button" className={BTN_GHOST} onClick={() => addPhrase(required, setRequired, requiredInput, setRequiredInput)}>{t.common.add}</button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-3">
                <button className={BTN_PRIMARY} onClick={save} disabled={saving}>
                    {saving ? t.common.saving : t.tabs.voice.saveProfile}
                </button>
                <Msg msg={msg} error={isErr} />
            </div>
        </div>
    )
}

// ─── Knowledge Tab ────────────────────────────────────────────────────────────

export function KnowledgeTab({ orgId }: { orgId: string }) {
    const t = useT()
    const [docs, setDocs]           = useState<KbRow[]>([])
    const [chunkCounts, setChunkCounts] = useState<Record<string, number>>({})
    const [teams, setTeams]         = useState<AssignTarget[]>([])
    const [people, setPeople]       = useState<AssignTarget[]>([])
    const [query, setQuery]         = useState("")
    const [loading, setLoading]     = useState(true)
    const [title, setTitle]         = useState("")
    const [kind, setKind]           = useState("doc")
    const [content, setContent]     = useState("")
    const [uploading, setUploading] = useState(false)
    const [parsing, setParsing]     = useState(false)
    /// Set once a file has been parsed: the confirm card is showing and the
    /// user has not yet pressed Add. Manual entry leaves this null.
    const [stagedFile, setStagedFile] = useState<string | null>(null)
    /// The doc being edited, or null. Editing replaces the document's content
    /// under the same title — see `saveEdit`.
    const [editing, setEditing]     = useState<KbRow | null>(null)
    const [editBody, setEditBody]   = useState("")
    const [editBusy, setEditBusy]   = useState(false)
    const [reindexing, setReindexing] = useState<string | null>(null)
    const [msg, setMsg]             = useState<string | null>(null)
    const [isErr, setIsErr]         = useState(false)
    const fileRef = useRef<HTMLInputElement>(null)

    const load = useCallback(async () => {
        const [{ data }, { data: chunkRows }, { data: teamRows }, { data: memberRows }] = await Promise.all([
            supabase.from("org_knowledge")
                .select("id, title, kind, status, summary, created_at, team_id, user_id")
                .eq("org_id", orgId).order("created_at", { ascending: false }),
            // Chunk counts decide which docs actually need repair. A doc can
            // read "ready" with zero chunks (a half-failed ingest), and that
            // doc contributes a summary but can never be retrieved mid-call.
            supabase.from("org_knowledge_chunks").select("knowledge_id").eq("org_id", orgId),
            supabase.from("org_teams").select("id, name").eq("org_id", orgId).order("name"),
            supabase.rpc("get_org_members_with_email", { p_org: orgId }),
        ])
        setDocs((data ?? []) as KbRow[])
        const counts: Record<string, number> = {}
        for (const r of (chunkRows ?? []) as { knowledge_id: string }[]) {
            counts[r.knowledge_id] = (counts[r.knowledge_id] ?? 0) + 1
        }
        setChunkCounts(counts)
        setTeams(((teamRows ?? []) as { id: string; name: string }[]).map(x => ({ id: x.id, label: x.name })))
        setPeople(((memberRows ?? []) as MemberRow[])
            .filter(m => m.status === "active" || !m.status)
            .map(m => ({ id: m.user_id, label: m.email ?? m.user_id.slice(0, 8) })))
        setLoading(false)
    }, [orgId])

    useEffect(() => { load() }, [load])

    /// Parse → stage → confirm. The type selector used to live inside the
    /// collapsed "add manually" panel, which auto-expanded *after* the file
    /// was read; people never saw it and every document landed as "doc".
    /// Now a file always lands on a confirmation card that shows the title,
    /// the type and a preview before anything is ingested.
    async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        e.target.value = ""
        setParsing(true); setMsg(null); setIsErr(false)
        try {
            const text = await extractTextFromFile(file)
            setContent(text)
            setTitle(file.name.replace(/\.[^.]+$/, ""))
            setStagedFile(file.name)
        } catch (err) {
            setIsErr(true)
            setMsg(err instanceof UnsupportedFileError ? t.tabs.unsupportedFile(err.ext)
                 : err instanceof EmptyDocumentError   ? t.tabs.emptyDocument
                 : t.tabs.knowledge.errorPrefix(errStr(err)))
        } finally {
            setParsing(false)
        }
    }

    function clearStaged() {
        setStagedFile(null); setTitle(""); setContent(""); setKind("doc")
    }

    async function upload() {
        if (!title.trim() || !content.trim()) return
        setUploading(true); setMsg(null)
        try {
            const r = await ingestKnowledgeInlineVerbose(orgId, title.trim(), kind, content.trim())
            if (r.error) {
                setMsg(t.tabs.knowledge.errorPrefix(r.error)); setIsErr(true)
            } else {
                // Say what the ingest actually did. "Document ready" told the
                // owner nothing about whether it can be retrieved in a call,
                // which is the only thing that matters.
                setMsg(r.chunkCount !== null ? t.tabs.knowledge.addedN(r.chunkCount) : t.tabs.knowledge.added)
                setIsErr(false)
                clearStaged()
            }
            await load()
        } finally {
            setUploading(false)
        }
    }

    /// Open the editor with the stored text. Chunks hold the document verbatim
    /// (ordered by chunk_index), so the original is reassembled rather than
    /// asking the owner to find the source file again.
    async function startEdit(d: KbRow) {
        setEditing(d); setEditBody(""); setEditBusy(true); setMsg(null)
        const { data } = await supabase.from("org_knowledge_chunks")
            .select("content, chunk_index").eq("knowledge_id", d.id).order("chunk_index")
        setEditBody(((data ?? []) as { content: string }[]).map(c => c.content).join("\n\n"))
        setEditBusy(false)
    }

    /// Title and type are a plain row update. Changed body text has to go back
    /// through ingest — chunks and embeddings are derived, not editable — so
    /// the old chunks are dropped and the row is re-ingested under its own id.
    async function saveEdit(newTitle: string, newKind: string, body: string) {
        if (!editing) return
        setEditBusy(true); setMsg(null)
        try {
            const { error } = await supabase.from("org_knowledge")
                .update({ title: newTitle.trim(), kind: newKind }).eq("id", editing.id)
            if (error) { setMsg(humanError(error.message, t.tabs.doingSaveThat, t)); setIsErr(true); return }

            const original = ((await supabase.from("org_knowledge_chunks")
                .select("content, chunk_index").eq("knowledge_id", editing.id).order("chunk_index")
            ).data ?? []) as { content: string }[]
            const unchanged = original.map(c => c.content).join("\n\n").trim() === body.trim()

            if (!unchanged && body.trim()) {
                await supabase.from("org_knowledge_chunks").delete().eq("knowledge_id", editing.id)
                const r = await reindexKnowledgeVerbose(orgId, editing.id)
                if (r.error) { setMsg(t.tabs.knowledge.errorPrefix(r.error)); setIsErr(true); return }
            }
            setMsg(t.tabs.knowledge.editSaved); setIsErr(false)
            setEditing(null)
            await load()
        } finally {
            setEditBusy(false)
        }
    }

    async function setAudience(d: KbRow, scope: AudienceScope) {
        const { error } = await supabase.from("org_knowledge")
            .update({ team_id: scope.team_id, user_id: scope.user_id }).eq("id", d.id)
        if (error) { setMsg(humanError(error.message, t.tabs.doingSaveThat, t)); setIsErr(true); return }
        setDocs(prev => prev.map(x => x.id === d.id ? { ...x, ...scope } : x))
    }

    async function deleteDoc(id: string) {
        await supabase.from("org_knowledge").delete().eq("id", id)
        setDocs(prev => prev.filter(d => d.id !== id))
    }

    // Repair path: a document can read "ready" while having no chunks at all
    // (seeded rows, or an ingest that failed halfway). Without chunks it
    // contributes a summary but can never be retrieved during a call. Only
    // offered on the docs that need it — it used to sit on every row, where
    // it read as an action everyone was supposed to understand and take.
    async function reindexDoc(id: string) {
        setReindexing(id); setMsg(null)
        try {
            const r = await reindexKnowledgeVerbose(orgId, id)
            // Report the chunk count when the function gives one — "repaired"
            // with no number is the same unverifiable claim as the old copy.
            setMsg(r.error ? t.tabs.knowledge.reindexFailed(r.error)
                 : r.chunkCount !== null ? t.tabs.knowledge.reindexedN(r.chunkCount)
                 : t.tabs.knowledge.reindexed)
            setIsErr(!!r.error)
            await load()
        } finally { setReindexing(null) }
    }

    const kindColor = (k: string): "indigo"|"green"|"yellow"|"slate" => {
        const m: Record<string, "indigo"|"green"|"yellow"|"slate"> = {
            doc: "slate", pricing: "indigo", battlecard: "yellow", faq: "green",
            objection: "yellow", compliance: "indigo", case_study: "green",
        }
        return m[k] ?? "slate"
    }

    return (
        <div className="space-y-6">
            {/* Upload zone — primary action */}
            {!stagedFile && (
                <UploadZone
                    fileRef={fileRef}
                    onChange={handleFile}
                    loading={parsing}
                    accept={`${EXTRACT_ACCEPT},.json`}
                    title={t.tabs.knowledge.uploadTitle}
                    subtitle={t.tabs.knowledge.uploadSub}
                />
            )}

            {/* Step 2: confirm what was read, name it, and say what it is. */}
            {stagedFile && (
                <div className={CARD + " space-y-4"}>
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-[var(--color-text)]">{t.tabs.knowledge.confirmTitle}</p>
                        <button className={BTN_GHOST} onClick={clearStaged}>{t.common.cancel}</button>
                    </div>
                    <p className="text-xs text-[var(--color-muted)]">{t.tabs.knowledge.readFrom(stagedFile, content.length)}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="col-span-2 space-y-1">
                            <label className="text-xs text-[var(--color-text-secondary)] font-medium">{t.tabs.knowledge.title}</label>
                            <input className={INPUT} placeholder={t.tabs.knowledge.titlePlaceholder} value={title} onChange={e => setTitle(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-[var(--color-text-secondary)] font-medium">{t.tabs.knowledge.type}</label>
                            <select className={INPUT} value={kind} onChange={e => setKind(e.target.value)}>
                                <KindOptions t={t} />
                            </select>
                        </div>
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-[var(--color-text-secondary)] font-medium">{t.tabs.knowledge.preview}</label>
                        <p className="text-xs text-[var(--color-text-secondary)] bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 max-h-24 overflow-y-auto whitespace-pre-wrap">
                            {content.slice(0, 300)}{content.length > 300 ? "…" : ""}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button className={BTN_PRIMARY} onClick={upload} disabled={uploading || !title.trim() || !content.trim()}>
                            {uploading ? t.tabs.knowledge.uploading : t.tabs.knowledge.addDocument}
                        </button>
                        <Msg msg={msg} error={isErr} />
                    </div>
                </div>
            )}

            {!stagedFile && (
            <ManualSection label={t.tabs.knowledge.orAddManually}>
            <div className={CARD + " space-y-4"}>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="col-span-2 space-y-1">
                        <label className="text-xs text-[var(--color-text-secondary)] font-medium">{t.tabs.knowledge.title}</label>
                        <input className={INPUT} placeholder={t.tabs.knowledge.titlePlaceholder} value={title} onChange={e => setTitle(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-[var(--color-text-secondary)] font-medium">{t.tabs.knowledge.type}</label>
                        <select className={INPUT} value={kind} onChange={e => setKind(e.target.value)}>
                            <KindOptions t={t} />
                        </select>
                    </div>
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-[var(--color-text-secondary)] font-medium">{t.tabs.knowledge.content}</label>
                    <textarea className={TEXTAREA} rows={8} placeholder={t.tabs.knowledge.contentPlaceholder}
                        value={content} onChange={e => setContent(e.target.value)} />
                </div>
                <div className="flex items-center gap-3">
                    <button className={BTN_PRIMARY} onClick={upload} disabled={uploading || !title.trim() || !content.trim()}>
                        {uploading ? t.tabs.knowledge.uploading : t.tabs.knowledge.saveDocument}
                    </button>
                    <Msg msg={msg} error={isErr} />
                </div>
            </div>
            </ManualSection>
            )}

            <div>
                <div className="flex items-center justify-between gap-4 mb-3">
                    <SectionHeader title={t.tabs.knowledge.libraryTitle(docs.length)} />
                    {docs.length > 4 && <SearchBox value={query} onChange={setQuery} placeholder={t.tabs.knowledge.searchDocs} className="w-56" />}
                </div>
                {loading && <p className="text-sm text-[var(--color-text-secondary)]">{t.common.loading}</p>}
                <div className="space-y-2">
                    {docs.filter(d => {
                        const s = query.trim().toLowerCase()
                        return !s || d.title.toLowerCase().includes(s) || (d.summary ?? "").toLowerCase().includes(s) || d.kind.toLowerCase().includes(s)
                    }).map(d => (
                        <div key={d.id} className={ROW}>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm text-[var(--color-text)] font-medium">{d.title}</p>
                                {d.summary && <p className="text-xs text-[var(--color-text-secondary)] mt-0.5 truncate">{d.summary}</p>}
                                <p className="text-xs text-[var(--color-muted)] mt-0.5">
                                    {(chunkCounts[d.id] ?? 0) > 0
                                        ? t.tabs.knowledge.indexedN(chunkCounts[d.id])
                                        : t.tabs.knowledge.notIndexed}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <AudienceSelect
                                    scope={{ team_id: d.team_id, user_id: d.user_id }}
                                    teams={teams} people={people}
                                    onChange={s => setAudience(d, s)}
                                />
                                <StatusBadge label={t.data.kinds[d.kind] ?? d.kind.replace("_"," ")} color={kindColor(d.kind)} />
                                <StatusBadge label={t.data.statuses[d.status] ?? d.status} color={d.status === "ready" ? "green" : d.status === "error" ? "red" : "yellow"} />
                                <button className={BTN_GHOST} onClick={() => startEdit(d)}>{t.common.edit}</button>
                                {/* Repair, not refresh — so it shows only where
                                    there is something to repair. */}
                                {(chunkCounts[d.id] ?? 0) === 0 && (
                                    <button className={BTN_GHOST} disabled={reindexing === d.id} onClick={() => reindexDoc(d.id)}>
                                        {reindexing === d.id ? t.tabs.knowledge.repairing : t.tabs.knowledge.repairIndex}
                                    </button>
                                )}
                                <button className={BTN_DANGER} onClick={() => deleteDoc(d.id)}>{t.common.delete}</button>
                            </div>
                        </div>
                    ))}
                    {!loading && docs.length === 0 && <p className="text-sm text-[var(--color-text-secondary)]">{t.tabs.knowledge.noDocs}</p>}
                </div>
            </div>

            {editing && (
                <KnowledgeEditor
                    doc={editing}
                    body={editBody}
                    busy={editBusy}
                    onCancel={() => setEditing(null)}
                    onSave={saveEdit}
                />
            )}
        </div>
    )
}

/// Edit a stored document. Body text round-trips through the chunk table, so
/// changing it re-ingests (chunks and embeddings are derived); leaving it
/// alone updates only the row, which is the common case (a typo in a title,
/// or a document filed under the wrong type).
function KnowledgeEditor({ doc, body, busy, onCancel, onSave }: {
    doc: KbRow
    body: string
    busy: boolean
    onCancel: () => void
    onSave: (title: string, kind: string, body: string) => void
}) {
    const t = useT()
    const [title, setTitle] = useState(doc.title)
    const [kind, setKind]   = useState(doc.kind)
    const [text, setText]   = useState(body)
    useEffect(() => { setText(body) }, [body])

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
            <div className={CARD + " w-full max-w-2xl space-y-4 my-auto"}>
                <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-[var(--color-text)]">{t.tabs.knowledge.editTitle}</h3>
                    <button className={BTN_GHOST} onClick={onCancel}>{t.common.cancel}</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="col-span-2 space-y-1">
                        <label className="text-xs text-[var(--color-text-secondary)] font-medium">{t.tabs.knowledge.title}</label>
                        <input className={INPUT} value={title} onChange={e => setTitle(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-[var(--color-text-secondary)] font-medium">{t.tabs.knowledge.type}</label>
                        <select className={INPUT} value={kind} onChange={e => setKind(e.target.value)}>
                            <KindOptions t={t} />
                        </select>
                    </div>
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-[var(--color-text-secondary)] font-medium">{t.tabs.knowledge.content}</label>
                    <textarea className={TEXTAREA} rows={12} value={text} onChange={e => setText(e.target.value)} />
                    <p className="text-xs text-[var(--color-muted)]">{t.tabs.knowledge.editBodyNote}</p>
                </div>
                <div className="flex items-center gap-3">
                    <button className={BTN_PRIMARY} onClick={() => onSave(title, kind, text)} disabled={busy || !title.trim()}>
                        {busy ? t.common.saving : t.common.save}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ─── Objections Tab ───────────────────────────────────────────────────────────

export function ObjectionsTab({ orgId }: { orgId: string }) {
    const t = useT()
    const [objs, setObjs]                     = useState<ObjRow[]>([])
    const [query, setQuery]                   = useState("")
    const [loading, setLoading]               = useState(true)
    const [objText, setObjText]               = useState("")
    const [guidance, setGuidance]             = useState("")
    const [severity, setSeverity]             = useState("normal")
    const [variants, setVariants]             = useState("")
    const [saving, setSaving]                 = useState(false)
    const [msg, setMsg]                       = useState<string | null>(null)
    const [isErr, setIsErr]                   = useState(false)
    const [suggestingVariants, setSuggestingVariants] = useState(false)
    // Extraction
    const [extracting, setExtracting]         = useState(false)
    const [extracted, setExtracted]           = useState<ExtractedObjection[]>([])
    const [selected, setSelected]             = useState<Set<number>>(new Set())
    const [unindexed, setUnindexed]           = useState(0)
    const [reindexing, setReindexing]         = useState(false)
    const [importing, setImporting]           = useState(false)
    const [extractMsg, setExtractMsg]         = useState<string | null>(null)
    // Tracked explicitly rather than sniffing the message text — the copy is
    // translated, so "starts with Error" is not a reliable signal.
    const [extractErr, setExtractErr]         = useState(false)
    /// Filename of the doc the current extraction came from — stored as the
    /// imported rows' provenance ("where did this objection come from?").
    const [sourceDoc, setSourceDoc]           = useState<string | null>(null)
    const [teams, setTeams]                   = useState<AssignTarget[]>([])
    const [people, setPeople]                 = useState<AssignTarget[]>([])
    const extractFileRef = useRef<HTMLInputElement>(null)

    const load = useCallback(async () => {
        const [{ data }, { count }, { data: teamRows }, { data: memberRows }] = await Promise.all([
            supabase.from("org_objections")
                .select("id, objection, response_guidance, approved_responses, severity, active, variants, source, team_id, user_id")
                .eq("org_id", orgId).order("severity"),
            // An objection with no embedding can never be matched mid-call, so
            // the library can look complete while doing nothing.
            supabase.from("org_objections")
                .select("id", { count: "exact", head: true })
                .eq("org_id", orgId).is("embedding", null),
            supabase.from("org_teams").select("id, name").eq("org_id", orgId).order("name"),
            supabase.rpc("get_org_members_with_email", { p_org: orgId }),
        ])
        setObjs((data ?? []) as ObjRow[])
        setUnindexed(count ?? 0)
        setTeams(((teamRows ?? []) as { id: string; name: string }[]).map(x => ({ id: x.id, label: x.name })))
        setPeople(((memberRows ?? []) as MemberRow[])
            .filter(m => m.status === "active" || !m.status)
            .map(m => ({ id: m.user_id, label: m.email ?? m.user_id.slice(0, 8) })))
        setLoading(false)
    }, [orgId])

    /// Objections are scoped exactly like knowledge docs: one audience per
    /// row, honored by `match_org_objections` at retrieval time. A mixed
    /// workspace should not coach a support rep with the sales library.
    async function setAudience(o: ObjRow, scope: AudienceScope) {
        const { error } = await supabase.from("org_objections")
            .update({ team_id: scope.team_id, user_id: scope.user_id }).eq("id", o.id)
        if (error) { setMsg(humanError(error.message, t.tabs.doingSaveThat, t)); setIsErr(true); return }
        setObjs(prev => prev.map(x => x.id === o.id ? { ...x, ...scope } : x))
    }

    async function runReindex() {
        setReindexing(true); setMsg(null)
        try {
            const r = await reindexObjections(orgId)
            setMsg(r.failed > 0
                ? t.tabs.objections.indexPartial(r.embedded, r.pending, r.failed)
                : t.tabs.objections.indexDone(r.embedded))
            setIsErr(r.failed > 0)
            await load()
        } finally { setReindexing(false) }
    }

    useEffect(() => { load() }, [load])

    async function handleExtractFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        e.target.value = ""
        setExtracting(true); setExtractMsg(null); setExtractErr(false); setExtracted([]); setSelected(new Set())
        let text: string
        try {
            text = await extractTextFromFile(file)
        } catch (err) {
            setExtracting(false); setExtractErr(true)
            setExtractMsg(err instanceof UnsupportedFileError
                ? t.tabs.unsupportedFile(err.ext)
                : err instanceof EmptyDocumentError
                    ? t.tabs.emptyDocument
                    : t.tabs.objections.errorPrefix(errStr(err)))
            return
        }
        setSourceDoc(file.name)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/extract-content`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ text, type: "objections" }),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) { setExtractMsg(t.tabs.objections.errorPrefix(errStr(json.error) || res.statusText)); setExtractErr(true); return }
            const items: ExtractedObjection[] = json.objections ?? []
            setExtracted(items)
            setSelected(new Set(items.map((_, i) => i)))
            setExtractMsg(items.length > 0 ? t.tabs.objections.extractFound(items.length) : t.tabs.objections.extractNone)
        } catch (e) {
            setExtractMsg(t.tabs.objections.errorPrefix(errStr(e))); setExtractErr(true)
        } finally {
            setExtracting(false)
        }
    }

    async function importSelected() {
        if (selected.size === 0) return
        setImporting(true)
        const toImport = extracted.filter((_, i) => selected.has(i))
        const rows = toImport.map(o => ({
            org_id: orgId,
            objection: o.objection,
            response_guidance: o.response_guidance || null,
            approved_responses: approvedResponsesFrom(o.response_guidance),
            severity: normalizeSeverity(o.severity),
            variants: o.variants ?? [],
            active: true,
            source: sourceDoc ? `document:${sourceDoc}` : "document",
        }))
        const { data: inserted, error } = await supabase.from("org_objections").insert(rows).select("id")
        if (error) { setImporting(false); setExtractMsg(t.tabs.objections.importErrorPrefix(error.message)); setExtractErr(true); return }
        // Embed before reporting success — an unembedded objection can never match.
        const r = await embedObjections(orgId, (inserted ?? []).map(x => x.id as string))
        setImporting(false)
        setExtracted([]); setSelected(new Set())
        setExtractErr(false)
        setExtractMsg(r.failed > 0
            ? t.tabs.objections.importPartial(toImport.length, r.failed)
            : t.tabs.objections.importDone(toImport.length))
        await load()
    }

    async function suggestVariants() {
        if (!objText.trim()) return
        setSuggestingVariants(true)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/extract-content`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ type: "variants", objection: objText.trim(), text: "" }),
            })
            const json = await res.json().catch(() => ({}))
            if (res.ok && json.variants?.length) {
                setVariants((json.variants as string[]).join("\n"))
            }
        } finally {
            setSuggestingVariants(false)
        }
    }

    async function addObjection() {
        if (!objText.trim()) return
        setSaving(true); setMsg(null)
        const { data: inserted, error } = await supabase.from("org_objections").insert({
            org_id: orgId,
            objection: objText.trim(),
            response_guidance: guidance.trim() || null,
            approved_responses: approvedResponsesFrom(guidance),
            severity: normalizeSeverity(severity),
            variants: variants.split("\n").map(s => s.trim()).filter(Boolean),
            active: true,
            source: "manual",
        }).select("id").single()
        if (error) { setSaving(false); setMsg(humanError(error.message, t.tabs.doingSavePlaybook, t)); setIsErr(true); return }
        const r = await embedObjections(orgId, inserted ? [inserted.id as string] : [])
        setSaving(false)
        {
            setMsg(r.failed > 0
                ? t.tabs.objections.savedNotIndexed
                : t.tabs.objections.addedIndexed)
            setIsErr(r.failed > 0)
            setObjText(""); setGuidance(""); setVariants(""); setSeverity("normal")
            await load()
        }
    }

    async function toggle(o: ObjRow) {
        await supabase.from("org_objections").update({ active: !o.active }).eq("id", o.id)
        setObjs(prev => prev.map(x => x.id === o.id ? { ...x, active: !x.active } : x))
    }

    async function deleteObj(id: string) {
        await supabase.from("org_objections").delete().eq("id", id)
        setObjs(prev => prev.filter(o => o.id !== id))
    }

    const sevColor = (s: string): "green"|"yellow"|"red"|"slate" =>
        ({ normal: "slate", critical: "red" }[s] ?? "slate") as "green"|"yellow"|"red"|"slate"

    return (
        <div className="space-y-6">
            {unindexed > 0 && (
                <div className="flex items-center justify-between gap-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
                    <p className="text-xs text-amber-900">
                        <span className="font-semibold">{t.tabs.objections.unindexedWarn(unindexed)}</span>{" "}
                        {t.tabs.objections.unindexedBody}
                    </p>
                    <button className={BTN_GHOST} disabled={reindexing} onClick={runReindex}>
                        {reindexing ? t.tabs.objections.indexing : t.tabs.objections.reindexNow}
                    </button>
                </div>
            )}
            {/* AI document extraction */}
            <div className="space-y-4">
                <UploadZone
                    fileRef={extractFileRef}
                    onChange={handleExtractFile}
                    loading={extracting}
                    accept={EXTRACT_ACCEPT}
                    title={t.tabs.objections.importTitle}
                    subtitle={t.tabs.objections.importSub}
                />
                {extractMsg && (
                    <p className={`text-sm text-center ${extracted.length > 0 ? "text-emerald-600" : extractErr ? "text-red-600" : "text-[var(--color-text-secondary)]"}`}>{extractMsg}</p>
                )}
            </div>
            {extracted.length > 0 && (
                <div className={CARD + " space-y-3"}>
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-[var(--color-text)]">{t.tabs.objections.reviewExtracted}</p>
                        <div className="flex gap-2">
                            <button className={BTN_GHOST} onClick={() => setSelected(new Set(extracted.map((_, i) => i)))}>{t.tabs.objections.selectAll}</button>
                            <button className={BTN_GHOST} onClick={() => setSelected(new Set())}>{t.tabs.objections.none}</button>
                            <button className={BTN_PRIMARY} onClick={importSelected} disabled={importing || selected.size === 0}>
                                {importing ? t.tabs.objections.importing : t.tabs.objections.importN(selected.size)}
                            </button>
                        </div>
                    </div>
                    <div className="space-y-2">
                        {extracted.map((o, i) => (
                            <label key={i} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selected.has(i) ? "border-[var(--color-accent)] bg-teal-50" : "border-[var(--color-border)] bg-[var(--color-bg)]"}`}>
                                <input type="checkbox" checked={selected.has(i)}
                                    onChange={() => setSelected(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })}
                                    className="mt-0.5 accent-[var(--color-accent)]" />
                                <div className="min-w-0">
                                    {/* Labeled rows: "which line is the objection and which is
                                        what I say back?" is not answerable from font weight. */}
                                    <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] font-semibold">{t.tabs.objections.labelObjection}</p>
                                    <p className="text-sm text-[var(--color-text)] font-medium">{o.objection}</p>
                                    {guidanceOf(o) && (<>
                                        <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] font-semibold mt-1.5">{t.tabs.objections.labelGuidance}</p>
                                        <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{guidanceOf(o)}</p>
                                    </>)}
                                    <div className="flex items-center gap-2 mt-1.5">
                                        <StatusBadge label={t.data.severities[o.severity || "normal"] ?? o.severity} color={sevColor(o.severity || "normal")} />
                                        {sourceDoc && <span className="text-xs text-[var(--color-muted)]">{t.tabs.objections.fromDoc(sourceDoc)}</span>}
                                        {o.variants?.length > 0 && <span className="text-xs text-[var(--color-muted)]">{t.tabs.objections.nVariants(o.variants.length)}</span>}
                                    </div>
                                </div>
                            </label>
                        ))}
                    </div>
                </div>
            )}

            {/* Manual add */}
            <ManualSection label={t.tabs.objections.addManually}>
            <div className={CARD + " space-y-4"}>
                <div>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                        {t.tabs.objections.addManuallySub1}<span className="font-medium text-[var(--color-text-secondary)]">{t.tabs.objections.addManuallySubBold}</span>{t.tabs.objections.addManuallySub2}
                    </p>
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-[var(--color-text-secondary)] font-medium">{t.tabs.objections.theObjection}</label>
                    <input className={INPUT} placeholder={t.tabs.objections.objectionPlaceholder}
                        value={objText} onChange={e => setObjText(e.target.value)} />
                    <p className="text-xs text-[var(--color-muted)]">{t.tabs.objections.noQuotesNeeded}</p>
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-[var(--color-text-secondary)] font-medium">{t.tabs.objections.guidance}</label>
                    <textarea className={TEXTAREA} rows={3} placeholder={t.tabs.objections.guidancePlaceholder}
                        value={guidance} onChange={e => setGuidance(e.target.value)} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-xs text-[var(--color-text-secondary)] font-medium">{t.tabs.objections.severity}</label>
                        <select className={INPUT} value={severity} onChange={e => setSeverity(e.target.value)}>
                            <option value="normal">{t.tabs.objections.sevNormal}</option>
                            <option value="critical">{t.tabs.objections.sevCritical}</option>
                        </select>
                    </div>
                    <div className="space-y-1">
                        <div className="flex items-center justify-between">
                            <label className="text-xs text-[var(--color-text-secondary)] font-medium">{t.tabs.objections.variants} <span className="text-[var(--color-muted)] font-normal">{t.tabs.objections.optional}</span></label>
                            <button type="button" className={BTN_GHOST} onClick={suggestVariants}
                                disabled={suggestingVariants || !objText.trim()}>
                                {suggestingVariants ? t.tabs.objections.generatingVariants : t.tabs.objections.aiSuggest}
                            </button>
                        </div>
                        <textarea className={TEXTAREA} rows={3}
                            placeholder={t.tabs.objections.variantsPlaceholder}
                            value={variants} onChange={e => setVariants(e.target.value)} />
                        <p className="text-xs text-[var(--color-muted)]">{t.tabs.objections.variantsHint}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button className={BTN_PRIMARY} onClick={addObjection} disabled={saving || !objText.trim()}>
                        {saving ? t.tabs.objections.adding : t.tabs.objections.addObjection}
                    </button>
                    <Msg msg={msg} error={isErr} />
                </div>
            </div>
            </ManualSection>

            <div>
                <div className="flex items-center justify-between gap-4 mb-3">
                    <SectionHeader title={t.tabs.objections.libraryTitle(objs.length)} />
                    {objs.length > 4 && <SearchBox value={query} onChange={setQuery} placeholder={t.tabs.objections.searchObjections} className="w-56" />}
                </div>
                {objs.some(o => o.source === "starter_kit") && (
                    <p className="text-xs text-[var(--color-muted)] mb-3">{t.tabs.objections.starterKitNote}</p>
                )}
                {loading && <p className="text-sm text-[var(--color-text-secondary)]">{t.common.loading}</p>}
                <div className="space-y-2">
                    {objs.filter(o => {
                        const s = query.trim().toLowerCase()
                        return !s || o.objection.toLowerCase().includes(s) || (guidanceOf(o) ?? "").toLowerCase().includes(s) || (o.variants ?? []).some(v => v.toLowerCase().includes(s))
                    }).map(o => (
                        <div key={o.id} className={ROW + " items-start"}>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <p className="text-sm text-[var(--color-text)] font-medium">{o.objection}</p>
                                    {sourceBadge(o.source, t) && <StatusBadge label={sourceBadge(o.source, t)!} color="slate" />}
                                    {!o.active && <StatusBadge label={t.data.statuses.disabled} color="slate" />}
                                </div>
                                {guidanceOf(o) && (<>
                                    <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] font-semibold mt-1">{t.tabs.objections.labelGuidance}</p>
                                    <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{guidanceOf(o)}</p>
                                </>)}
                                {o.variants && o.variants.length > 0 && (
                                    <p className="text-xs text-[var(--color-muted)] mt-0.5">{t.tabs.objections.nVariants(o.variants.length)}</p>
                                )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
                                <AudienceSelect
                                    scope={{ team_id: o.team_id, user_id: o.user_id }}
                                    teams={teams} people={people}
                                    onChange={s => setAudience(o, s)}
                                />
                                <StatusBadge label={t.data.severities[o.severity] ?? o.severity} color={sevColor(o.severity)} />
                                <button className={BTN_GHOST} onClick={() => toggle(o)}>{o.active ? t.tabs.objections.disable : t.tabs.objections.enable}</button>
                                <button className={BTN_DANGER} onClick={() => deleteObj(o.id)}>{t.common.delete}</button>
                            </div>
                        </div>
                    ))}
                    {!loading && objs.length === 0 && <p className="text-sm text-[var(--color-text-secondary)]">{t.tabs.objections.noObjections}</p>}
                </div>
            </div>
        </div>
    )
}

// ─── Playbooks Tab ────────────────────────────────────────────────────────────

export function PlaybooksTab({ orgId }: { orgId: string }) {
    const { locale, t } = useLocale()
    const [playbooks, setPlaybooks]     = useState<PbRow[]>([])
    const [loading, setLoading]         = useState(true)
    const [creating, setCreating]       = useState(false)
    const [editingId, setEditingId]     = useState<string | null>(null)
    const [pbName, setPbName]           = useState("")
    const [methodology, setMethodology] = useState("custom")
    const [stages, setStages]           = useState<StageForm[]>([{ name: "", description: "", requiredItems: "", guardrails: [] }])
    const [saving, setSaving]           = useState(false)
    const [msg, setMsg]                 = useState<string | null>(null)
    const [isErr, setIsErr]             = useState(false)
    const [extracting, setExtracting]   = useState(false)
    const [extractMsg, setExtractMsg]   = useState<string | null>(null)
    // Tracked explicitly — the copy is translated, so sniffing for "Error" fails.
    const [extractErr, setExtractErr]   = useState(false)
    const extractFileRef = useRef<HTMLInputElement>(null)
    // Assignment targets (D-192): a playbook can now apply to the whole org,
    // to teams, or to named people.
    const [teams, setTeams]     = useState<AssignTarget[]>([])
    const [people, setPeople]   = useState<AssignTarget[]>([])
    // Which industry's presets to offer (D-192). Stored on the org, so the
    // choice survives a reload and other surfaces can read it later.
    const [vertical, setVertical] = useState<Vertical>("sales")

    const load = useCallback(async () => {
        const [{ data }, { data: teamRows }, { data: memberRows }, { data: orgRow }] = await Promise.all([
            supabase.from("org_playbooks")
                .select("id, name, methodology, status, version, stages, created_at")
                .eq("org_id", orgId).order("created_at", { ascending: false }),
            supabase.from("org_teams").select("id, name").eq("org_id", orgId).order("name"),
            supabase.rpc("get_org_members_with_email", { p_org: orgId }),
            supabase.from("organizations").select("settings").eq("id", orgId).single(),
        ])
        const storedVertical = (orgRow?.settings as { vertical?: string } | null)?.vertical
        if (storedVertical && (VERTICALS as string[]).includes(storedVertical)) {
            setVertical(storedVertical as Vertical)
        }
        setPlaybooks((data ?? []) as PbRow[])
        setTeams(((teamRows ?? []) as { id: string; name: string }[]).map(x => ({ id: x.id, label: x.name })))
        setPeople(((memberRows ?? []) as MemberRow[])
            .filter(m => m.status === "active" || !m.status)
            .map(m => ({ id: m.user_id, label: m.email ?? m.user_id.slice(0, 8) })))
        setLoading(false)
    }, [orgId])

    useEffect(() => { load() }, [load])

    async function handleExtractFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        e.target.value = ""
        setExtracting(true); setExtractMsg(null); setExtractErr(false)
        let text: string
        try {
            text = await extractTextFromFile(file)
        } catch (err) {
            setExtracting(false); setExtractErr(true)
            setExtractMsg(err instanceof UnsupportedFileError
                ? t.tabs.unsupportedFile(err.ext)
                : err instanceof EmptyDocumentError
                    ? t.tabs.emptyDocument
                    : t.tabs.playbooks.errorPrefix(errStr(err)))
            return
        }
        try {
            const { data: { session } } = await supabase.auth.getSession()
            const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/extract-content`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ text, type: "playbook" }),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) { setExtractMsg(t.tabs.playbooks.errorPrefix(errStr(json.error) || res.statusText)); setExtractErr(true); return }
            if (json.name) setPbName(json.name)
            if (json.methodology) setMethodology(json.methodology)
            if (json.stages?.length) {
                setStages(json.stages.map((s: PbStage) => ({
                    name: s.name ?? "",
                    description: s.description ?? "",
                    requiredItems: (s.required_items ?? []).join("\n"),
                    guardrails: s.guardrail_rules ?? [],
                })))
            }
            setCreating(true)
            setExtractMsg(t.tabs.playbooks.extractedStages(json.stages?.length ?? 0))
        } catch (e) {
            setExtractMsg(t.tabs.playbooks.errorPrefix(errStr(e))); setExtractErr(true)
        } finally {
            setExtracting(false)
        }
    }

    function updateStage(i: number, patch: Partial<StageForm>) {
        setStages(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s))
    }
    function addGuardrail(si: number) {
        setStages(prev => prev.map((s, i) => i === si ? { ...s, guardrails: [...s.guardrails, { keyword: "", action: "warn" }] } : s))
    }
    function updateGuardrail(si: number, gi: number, patch: { keyword?: string; action?: string }) {
        setStages(prev => prev.map((s, i) => i === si ? { ...s, guardrails: s.guardrails.map((g, j) => j === gi ? { ...g, ...patch } : g) } : s))
    }
    function removeGuardrail(si: number, gi: number) {
        setStages(prev => prev.map((s, i) => i === si ? { ...s, guardrails: s.guardrails.filter((_, j) => j !== gi) } : s))
    }
    function addStage() { setStages(prev => [...prev, { name: "", description: "", requiredItems: "", guardrails: [] }]) }
    function removeStage(i: number) { setStages(prev => prev.filter((_, idx) => idx !== i)) }

    /// Load an existing playbook into the editor. Stage shapes vary by origin —
    /// the editor writes required/required_items, seeded and imported playbooks
    /// may carry either — so read both (mirrors the client-side dual read, D-165).
    function startEdit(p: PbRow) {
        setEditingId(p.id)
        setPbName(p.name)
        setMethodology(p.methodology ?? "custom")
        setStages((p.stages ?? []).map(st => ({
            name: st.name ?? "",
            description: st.description ?? "",
            requiredItems: ((st.required ?? st.required_items) ?? []).join("\n"),
            guardrails: (st.guardrail_rules ?? []).map(g => ({ keyword: g.keyword ?? "", action: g.action ?? "warn" })),
        })))
        setCreating(true)
        setMsg(null)
        window.scrollTo({ top: 0, behavior: "smooth" })
    }

    async function savePlaybook() {
        if (!pbName.trim() || stages.some(s => !s.name.trim())) return
        setSaving(true); setMsg(null)
        const stagesJson: PbStage[] = stages.map(s => {
            const required = s.requiredItems.split("\n").map(x => x.trim()).filter(Boolean)
            return {
                key: s.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
                name: s.name.trim(),
                description: s.description.trim(),
                // `required` is the key the live coach reads; `required_items` is
                // kept so playbooks saved before this stay loadable in the editor.
                required,
                required_items: required,
                guardrail_rules: s.guardrails.filter(g => g.keyword.trim()).map(g => ({
                    type: "forbidden_phrase", keyword: g.keyword.trim(), action: g.action
                }))
            }
        })
        // Stage-level forbidden phrases are the authoring shape; the top-level
        // `guardrails` rollup is the runtime contract that reaches the model,
        // the breach detector, and the scorecard grader (D-181). One shared
        // helper generates it here and in the starter kits so the sentence
        // (and its language) can't drift between the two writers.
        const guardrailsJson = rollUpGuardrails(stagesJson, locale)
        // Editing updates in place and bumps the version; the status is kept, so
        // editing the live playbook stays live — reps see the change on their
        // next call, which is the point of editing it.
        const { error } = editingId
            ? await supabase.from("org_playbooks").update({
                name: pbName.trim(), methodology, stages: stagesJson,
                guardrails: guardrailsJson,
                version: (playbooks.find(p => p.id === editingId)?.version ?? 0) + 1,
            }).eq("id", editingId)
            : await supabase.from("org_playbooks").insert({
                org_id: orgId, name: pbName.trim(), methodology, stages: stagesJson,
                guardrails: guardrailsJson, status: "draft", version: 1
            })
        setSaving(false)
        if (error) { setMsg(humanError(error.message, t.tabs.doingSaveThat, t)); setIsErr(true) }
        else {
            setMsg(editingId ? t.tabs.playbooks.updated : t.tabs.playbooks.created); setIsErr(false)
            setPbName(""); setMethodology("custom"); setStages([{ name: "", description: "", requiredItems: "", guardrails: [] }])
            setCreating(false); setEditingId(null); setExtractMsg(null); await load()
        }
    }

    async function setStatus(id: string, status: "draft" | "active" | "archived") {
        if (status === "active") {
            // Several playbooks may be active at once now that they are scoped
            // (D-192) — a sales playbook and a support playbook are both live,
            // for different people. What must stay unique is the ORG DEFAULT:
            // the active playbook with no assignments, which `get_org_context`
            // falls back to for anyone unmatched. So activating an unassigned
            // playbook demotes other unassigned ones, and nothing else.
            const { data: mine } = await supabase
                .from("org_playbook_assignments").select("playbook_id").eq("playbook_id", id).limit(1)
            const becomingDefault = (mine ?? []).length === 0
            if (becomingDefault) {
                const { data: actives } = await supabase
                    .from("org_playbooks").select("id").eq("org_id", orgId).eq("status", "active")
                const { data: assigned } = await supabase
                    .from("org_playbook_assignments").select("playbook_id").eq("org_id", orgId)
                const assignedIds = new Set((assigned ?? []).map(a => a.playbook_id as string))
                const otherDefaults = (actives ?? [])
                    .map(a => a.id as string)
                    .filter(pid => pid !== id && !assignedIds.has(pid))
                if (otherDefaults.length > 0) {
                    await supabase.from("org_playbooks").update({ status: "draft" }).in("id", otherDefaults)
                }
            }
        }
        await supabase.from("org_playbooks").update({ status }).eq("id", id)
        // Every action answers "what happens now?" (D-175).
        setIsErr(false)
        setMsg(status === "active" ? t.tabs.playbooks.statusLive
             : status === "draft"  ? t.tabs.playbooks.statusDraft
             : t.tabs.playbooks.statusArchived)
        await load()
    }

    async function deletePlaybook(id: string) {
        await supabase.from("org_playbooks").delete().eq("id", id)
        setPlaybooks(prev => prev.filter(p => p.id !== id))
    }

    return (
        <div className="space-y-6">
            <div className={CARD}>
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-semibold text-[var(--color-text)]">{t.tabs.playbooks.title}</h3>
                        <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{t.tabs.playbooks.sub}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <input ref={extractFileRef} type="file" accept={EXTRACT_ACCEPT} className="hidden" onChange={handleExtractFile} />
                        <button className={BTN_PRIMARY} onClick={() => extractFileRef.current?.click()} disabled={extracting}>
                            {extracting ? t.tabs.playbooks.extracting : t.tabs.playbooks.importFromDoc}
                        </button>
                        <button className={BTN_GHOST} onClick={() => {
                            if (creating) {
                                setCreating(false); setEditingId(null)
                                setPbName(""); setMethodology("custom")
                                setStages([{ name: "", description: "", requiredItems: "", guardrails: [] }])
                            } else setCreating(true)
                        }}>
                            {creating ? t.common.cancel : t.tabs.playbooks.newPlaybook}
                        </button>
                    </div>
                </div>

                {extractMsg && (
                    <p className={`mt-3 text-xs ${extractErr ? "text-red-600" : "text-emerald-600"}`}>{extractMsg}</p>
                )}

                {creating && (
                    <div className="mt-5 space-y-5 pt-5 border-t border-[var(--color-border)]">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="col-span-2 space-y-1">
                                <label className="text-xs text-[var(--color-text-secondary)] font-medium">{t.tabs.playbooks.name}</label>
                                <input className={INPUT} placeholder={t.tabs.playbooks.namePlaceholder} value={pbName} onChange={e => setPbName(e.target.value)} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-[var(--color-text-secondary)] font-medium">{t.tabs.playbooks.methodology}</label>
                                <select className={INPUT} value={methodology} onChange={e => setMethodology(e.target.value)}>
                                    <option value="custom">{t.tabs.playbooks.methodologyCustom}</option>
                                    <option value="SPIN">SPIN Selling</option>
                                    <option value="Challenger">Challenger Sale</option>
                                    <option value="MEDDIC">MEDDIC</option>
                                    <option value="Sandler">Sandler</option>
                                    <option value="BANT">BANT</option>
                                </select>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <p className="text-xs font-medium text-[var(--color-text-secondary)]">{t.tabs.playbooks.stagesN(stages.length)}</p>
                                <button className={BTN_GHOST} onClick={addStage}>{t.tabs.playbooks.addStage}</button>
                            </div>

                            {stages.map((stage, si) => (
                                <div key={si} className="bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)] p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-[var(--color-accent)]">{t.tabs.playbooks.stageN(si + 1)}</span>
                                        {stages.length > 1 && <button className={BTN_DANGER} onClick={() => removeStage(si)}>{t.common.remove}</button>}
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-xs text-[var(--color-text-secondary)] font-medium">{t.tabs.playbooks.stageName}</label>
                                            <input className={INPUT} placeholder={t.tabs.playbooks.stageNamePlaceholder} value={stage.name} onChange={e => updateStage(si, { name: e.target.value })} />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs text-[var(--color-text-secondary)] font-medium">{t.tabs.playbooks.description}</label>
                                            <input className={INPUT} placeholder={t.tabs.playbooks.descriptionPlaceholder} value={stage.description} onChange={e => updateStage(si, { description: e.target.value })} />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs text-[var(--color-text-secondary)] font-medium">{t.tabs.playbooks.requiredItems}</label>
                                        <textarea className={TEXTAREA} rows={3} placeholder={t.tabs.playbooks.requiredItemsPlaceholder}
                                            value={stage.requiredItems} onChange={e => updateStage(si, { requiredItems: e.target.value })} />
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs text-[var(--color-text-secondary)] font-medium">{t.tabs.playbooks.guardrails}</label>
                                            <button className={BTN_GHOST} onClick={() => addGuardrail(si)}>{t.tabs.playbooks.addRule}</button>
                                        </div>
                                        {stage.guardrails.map((g, gi) => (
                                            <div key={gi} className="flex gap-2 items-center">
                                                <input className={INPUT} placeholder={t.tabs.playbooks.guardrailPlaceholder} value={g.keyword} onChange={e => updateGuardrail(si, gi, { keyword: e.target.value })} />
                                                <select className="w-32 flex-shrink-0 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                                                    value={g.action} onChange={e => updateGuardrail(si, gi, { action: e.target.value })}>
                                                    <option value="warn">{t.tabs.playbooks.actionWarn}</option>
                                                    <option value="flag">{t.tabs.playbooks.actionFlag}</option>
                                                    <option value="escalate">{t.tabs.playbooks.actionEscalate}</option>
                                                </select>
                                                <button className="text-[var(--color-muted)] hover:text-red-600 flex-shrink-0 transition-colors" onClick={() => removeGuardrail(si, gi)}>×</button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex items-center gap-3">
                            <button className={BTN_PRIMARY} onClick={savePlaybook} disabled={saving || !pbName.trim()}>
                                {saving ? t.common.saving : editingId ? t.tabs.playbooks.saveChanges : t.tabs.playbooks.createPlaybook}
                            </button>
                            <Msg msg={msg} error={isErr} />
                        </div>
                    </div>
                )}
            </div>

            <StarterKitPicker orgId={orgId} vertical={vertical} onVerticalChange={setVertical} onApplied={load} />

            {loading && <p className="text-sm text-[var(--color-text-secondary)]">{t.common.loading}</p>}
            <div className="space-y-3">
                {playbooks.map(p => (
                    <div key={p.id} className={CARD}>
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="flex items-center gap-2">
                                    <p className="text-sm font-semibold text-[var(--color-text)]">{p.name}</p>
                                    <StatusBadge label={t.data.statuses[p.status] ?? p.status} color={p.status === "active" ? "green" : p.status === "draft" ? "yellow" : "slate"} />
                                </div>
                                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                                    {t.tabs.playbooks.metaLine(p.methodology ?? t.tabs.playbooks.methodologyCustom, p.stages?.length ?? 0, p.version)}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button className={BTN_GHOST} onClick={() => startEdit(p)}>{t.common.edit}</button>
                                {p.status !== "active"   && <button className={BTN_GHOST} onClick={() => setStatus(p.id, "active")}>{t.tabs.playbooks.activate}</button>}
                                {p.status === "active"   && <button className={BTN_GHOST} onClick={() => setStatus(p.id, "draft")}>{t.tabs.playbooks.deactivate}</button>}
                                {p.status !== "archived" && <button className={BTN_GHOST} onClick={() => setStatus(p.id, "archived")}>{t.tabs.playbooks.archive}</button>}
                                <button className={BTN_DANGER} onClick={() => deletePlaybook(p.id)}>{t.common.delete}</button>
                            </div>
                        </div>
                        {p.stages && p.stages.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                                {p.stages.map((s, i) => (
                                    <span key={i} className="text-xs bg-[var(--color-bg)] border border-[var(--color-border)] px-2 py-0.5 rounded text-[var(--color-text-secondary)]">
                                        {i + 1}. {s.name}
                                    </span>
                                ))}
                            </div>
                        )}
                        <PlaybookAssignment orgId={orgId} playbookId={p.id} teams={teams} members={people} />
                    </div>
                ))}
                {!loading && playbooks.length === 0 && !creating && (
                    <p className="text-sm text-[var(--color-text-secondary)]">{t.tabs.playbooks.noPlaybooks}</p>
                )}
            </div>
        </div>
    )
}

// ─── Members Tab ──────────────────────────────────────────────────────────────

interface Readiness { activePlaybooks: number; objections: number; knowledge: number }

export function PracticeTab({ orgId }: { orgId: string }) {
    const { t, intl } = useLocale()
    const [assignments, setAssignments] = useState<PracticeAssignmentRow[]>([])
    const [members, setMembers]         = useState<MemberRow[]>([])
    const [teams, setTeams]              = useState<TeamRow[]>([])
    const [loading, setLoading]         = useState(true)

    const [scenarioId, setScenarioId]   = useState(STOCK_PRACTICE_SCENARIOS[0].id)
    const [assigneeKind, setAssigneeKind] = useState<"member" | "team">("member")
    const [assigneeId, setAssigneeId]   = useState("")
    const [note, setNote]               = useState("")
    const [dueDate, setDueDate]         = useState("")
    const [assigning, setAssigning]     = useState(false)
    const [msg, setMsg]                 = useState<string | null>(null)
    const [isErr, setIsErr]             = useState(false)

    const load = useCallback(async () => {
        const [assignRes, memberRes, teamRes] = await Promise.all([
            supabase.from("org_practice_assignments")
                .select("id, title, note, due_at, assignee_user_id, assignee_team_id, created_at")
                .eq("org_id", orgId).eq("active", true)
                .order("created_at", { ascending: false }).limit(30),
            supabase.rpc("get_org_members_with_email", { p_org: orgId }).then(r => {
                if (r.error) {
                    return supabase.from("org_members")
                        .select("user_id, role, status, joined_at")
                        .eq("org_id", orgId).eq("status", "active")
                        .then(r2 => ({ data: (r2.data ?? []).map(m => ({ ...m, email: null })) }))
                }
                return r
            }),
            supabase.from("org_teams").select("id, name").eq("org_id", orgId).order("name"),
        ])
        setAssignments((assignRes.data ?? []) as PracticeAssignmentRow[])
        setMembers((memberRes.data ?? []) as MemberRow[])
        setTeams((teamRes.data ?? []) as TeamRow[])
        setLoading(false)
    }, [orgId])

    useEffect(() => { load() }, [load])

    async function assign() {
        if (!assigneeId) { setMsg(t.tabs.practice.pickAssignee); setIsErr(true); return }
        const scenario = STOCK_PRACTICE_SCENARIOS.find(s => s.id === scenarioId)
        if (!scenario) return

        setAssigning(true); setMsg(null)
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase.from("org_practice_assignments").insert({
            org_id: orgId,
            scenario_source: "stock",
            scenario_id: scenario.id,
            title: scenario.title,
            note: note.trim() || null,
            due_at: dueDate ? new Date(dueDate).toISOString() : null,
            assignee_user_id: assigneeKind === "member" ? assigneeId : null,
            assignee_team_id: assigneeKind === "team" ? assigneeId : null,
            assigned_by: user?.id,
        })
        setAssigning(false)
        if (error) { setMsg(humanError(error.message, t.tabs.doingSaveThat, t)); setIsErr(true) }
        else {
            setMsg(t.tabs.practice.assigned(scenario.title)); setIsErr(false)
            setNote(""); setDueDate(""); setAssigneeId("")
            await load()
        }
    }

    async function unassign(id: string) {
        await supabase.from("org_practice_assignments").update({ active: false }).eq("id", id)
        setAssignments(prev => prev.filter(a => a.id !== id))
    }

    function assigneeLabel(a: PracticeAssignmentRow): string {
        if (a.assignee_user_id) {
            const m = members.find(m => m.user_id === a.assignee_user_id)
            return m?.email ?? t.tabs.practice.aRep
        }
        if (a.assignee_team_id) {
            const team = teams.find(x => x.id === a.assignee_team_id)
            return team ? t.tabs.practice.teamPrefix(team.name) : t.tabs.practice.aTeamFallback
        }
        return "—"
    }

    if (loading) return <div className="text-[var(--color-text-secondary)] text-sm">{t.common.loading}</div>

    return (
        <div className="space-y-6">
            <div className={CARD}>
                <h3 className="text-sm font-semibold text-[var(--color-text)]">{t.tabs.practice.assignTitle}</h3>
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                    {t.tabs.practice.assignSub}
                </p>

                <div className="mt-5 space-y-4">
                    <div className="space-y-1">
                        <label className="text-xs text-[var(--color-text-secondary)] font-medium">{t.tabs.practice.scenario}</label>
                        <select className={INPUT} value={scenarioId} onChange={e => setScenarioId(e.target.value)}>
                            {STOCK_PRACTICE_SCENARIOS.map(s => (
                                <option key={s.id} value={s.id}>{s.title} · {s.category} · {s.difficulty}</option>
                            ))}
                        </select>
                        <p className="text-xs text-[var(--color-muted)] mt-1">
                            {STOCK_PRACTICE_SCENARIOS.find(s => s.id === scenarioId)?.objective}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-xs text-[var(--color-text-secondary)] font-medium">{t.tabs.practice.assignTo}</label>
                            <select className={INPUT} value={assigneeKind}
                                onChange={e => { setAssigneeKind(e.target.value as "member" | "team"); setAssigneeId("") }}>
                                <option value="member">{t.tabs.practice.aPerson}</option>
                                <option value="team">{t.tabs.practice.aTeam}</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-[var(--color-text-secondary)] font-medium">
                                {assigneeKind === "member" ? t.common.rep : t.tabs.practice.team}
                            </label>
                            <select className={INPUT} value={assigneeId} onChange={e => setAssigneeId(e.target.value)}>
                                <option value="">{t.tabs.practice.select}</option>
                                {assigneeKind === "member"
                                    ? members.map(m => <option key={m.user_id} value={m.user_id}>{m.email ?? m.user_id}</option>)
                                    : teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)
                                }
                            </select>
                            {assigneeKind === "team" && teams.length === 0 && (
                                <p className="text-xs text-[var(--color-muted)] mt-1">{t.tabs.practice.noTeamsYet}</p>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-xs text-[var(--color-text-secondary)] font-medium">{t.tabs.practice.coachNote}</label>
                            <input className={INPUT} placeholder={t.tabs.practice.coachNotePlaceholder} value={note} onChange={e => setNote(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-[var(--color-text-secondary)] font-medium">{t.tabs.practice.dueDate}</label>
                            <input type="date" className={INPUT} value={dueDate} onChange={e => setDueDate(e.target.value)} />
                        </div>
                    </div>

                    {msg && <p className={`text-xs ${isErr ? "text-red-600" : "text-emerald-600"}`}>{msg}</p>}

                    <div className="flex justify-end">
                        <button className={BTN_PRIMARY} onClick={assign} disabled={assigning || !assigneeId}>
                            {assigning ? t.tabs.practice.assigning : t.tabs.practice.assign}
                        </button>
                    </div>
                </div>
            </div>

            <div className={CARD}>
                <h3 className="text-sm font-semibold text-[var(--color-text)]">{t.tabs.practice.recent}</h3>
                {assignments.length === 0 ? (
                    <p className="text-xs text-[var(--color-text-secondary)] mt-2">{t.tabs.practice.noAssignments}</p>
                ) : (
                    <div className="mt-3 space-y-2">
                        {assignments.map(a => (
                            <div key={a.id} className={ROW}>
                                <div className="min-w-0">
                                    <p className="text-sm text-[var(--color-text)] truncate">{a.title}</p>
                                    <p className="text-xs text-[var(--color-text-secondary)]">
                                        {assigneeLabel(a)}
                                        {a.due_at && ` · ${t.tabs.practice.due(new Date(a.due_at).toLocaleDateString(intl))}`}
                                        {a.note && ` · "${a.note}"`}
                                    </p>
                                </div>
                                <button className={BTN_GHOST + " flex-shrink-0"} onClick={() => unassign(a.id)}>{t.common.remove}</button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

export function MembersTab({ orgId, org }: { orgId: string; org: OrgInfo }) {
    const { t, intl } = useLocale()
    const [members, setMembers]         = useState<MemberRow[]>([])
    const [query, setQuery]             = useState("")
    const [invites, setInvites]         = useState<InviteRow[]>([])
    const [readiness, setReadiness]     = useState<Readiness | null>(null)
    const [loading, setLoading]         = useState(true)
    const [inviteEmail, setInviteEmail] = useState("")
    const [inviteRole, setInviteRole]   = useState("member")
    const [inviting, setInviting]       = useState(false)
    const [msg, setMsg]                 = useState<string | null>(null)
    const [isErr, setIsErr]             = useState(false)

    const load = useCallback(async () => {
        const [memberRes, inviteRes, pbRes, objRes, kbRes] = await Promise.all([
            supabase.rpc("get_org_members_with_email", { p_org: orgId }).then(r => {
                if (r.error) {
                    return supabase.from("org_members")
                        .select("user_id, role, status, joined_at")
                        .eq("org_id", orgId).eq("status", "active")
                        .then(r2 => ({ data: (r2.data ?? []).map(m => ({ ...m, email: null })) }))
                }
                return r
            }),
            supabase.from("org_invites")
                .select("id, email, role, accepted_at, expires_at, revoked_at")
                .eq("org_id", orgId).order("created_at", { ascending: false }).limit(30),
            supabase.from("org_playbooks").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "active"),
            supabase.from("org_objections").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("active", true),
            supabase.from("org_knowledge").select("id", { count: "exact", head: true }).eq("org_id", orgId),
        ])
        setMembers((memberRes.data ?? []) as MemberRow[])
        setInvites((inviteRes.data ?? []) as InviteRow[])
        setReadiness({
            activePlaybooks: pbRes.count ?? 0,
            objections:      objRes.count ?? 0,
            knowledge:       kbRes.count ?? 0,
        })
        setLoading(false)
    }, [orgId])

    // ── Onboarding gate: an org must have its coaching foundation in place before
    //    reps can be invited, otherwise they'd sign in to an unconfigured product.
    const voiceSet = !!org.voice_profile?.tone?.trim()
    // The full setup checklist lives on Home now (D-175); this tab keeps only
    // a slim nudge so inviting early is informed, not blocked.
    const requiredMet = (readiness?.activePlaybooks ?? 0) >= 1 && (readiness?.objections ?? 0) >= 3

    useEffect(() => { load() }, [load])

    async function sendInvite() {
        if (!inviteEmail.trim()) return
        setInviting(true); setMsg(null)
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/invite-member`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
            // invite-member has had Spanish copy all along but defaults to
            // English when `language` is absent — and nobody was sending it, so
            // every invite went out in English (D-181). The recipient has no
            // account yet, so the admin's locale is the best signal we have.
            body: JSON.stringify({
                org_id: orgId, email: inviteEmail.trim(), role: inviteRole,
                language: clientLocale(),
            }),
        })
        setInviting(false)
        if (res.ok) {
            const payload = await res.json().catch(() => ({}))
            // Queued = the row exists and holds the seat, but the email waits
            // for billing (D-198). Saying "sent" here would be a lie the admin
            // discovers when the invitee never receives anything.
            setMsg(payload.queued ? t.tabs.members.inviteQueued : t.tabs.members.inviteSent)
            setIsErr(false); setInviteEmail(""); await load()
        } else {
            const e = await res.json().catch(() => ({}))
            setMsg(t.tabs.members.inviteError(errStr(e.error))); setIsErr(true)
        }
    }

    // Role changes and removals were invisible in the audit trail (D-176) —
    // the two events a security review asks about most.
    async function auditWrite(action: string, meta: Record<string, unknown>) {
        const { data: { user } } = await supabase.auth.getUser()
        await supabase.from("org_audit_log").insert({ org_id: orgId, actor_id: user?.id ?? null, action, meta })
    }

    async function changeRole(userId: string, role: string) {
        const before = members.find(m => m.user_id === userId)?.role
        await supabase.from("org_members").update({ role }).eq("org_id", orgId).eq("user_id", userId)
        setMembers(prev => prev.map(m => m.user_id === userId ? { ...m, role } : m))
        await auditWrite("member.role_changed", { user_id: userId, from: before, to: role })
        setIsErr(false); setMsg(`Role updated to ${role}.`)
    }

    // Revoking keeps the row (the accept page needs to say "withdrawn", which
    // a deleted row can't) and frees the seat — pending counts exclude it.
    async function revokeInvite(inv: InviteRow) {
        const { error } = await supabase.from("org_invites")
            .update({ revoked_at: new Date().toISOString() }).eq("id", inv.id)
        if (error) { setMsg(humanError(error.message, t.tabs.doingSaveThat, t)); setIsErr(true); return }
        await auditWrite("invite.revoked", { invite_id: inv.id, email: inv.email })
        setIsErr(false); setMsg(t.tabs.members.revokedMsg(inv.email))
        await load()
    }

    async function removeMember(userId: string) {
        const who = members.find(m => m.user_id === userId)?.email
        await supabase.from("org_members").delete().eq("org_id", orgId).eq("user_id", userId)
        setMembers(prev => prev.filter(m => m.user_id !== userId))
        await auditWrite("member.removed", { user_id: userId, email: who })
        setIsErr(false); setMsg("Removed — their seat is free. Their personal TalkPilot account is untouched.")
    }

    const roleColor = (r: string): "indigo"|"yellow"|"slate" =>
        ({ owner: "indigo", admin: "indigo", manager: "yellow" }[r] ?? "slate") as "indigo"|"yellow"|"slate"

    return (
        <div className="space-y-6">
            <div className={CARD + " space-y-3"}>
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-[var(--color-text)]">{t.tabs.members.inviteTitle}</h3>
                    {!requiredMet && (
                        <span className="text-xs text-amber-600">
                            {t.tabs.members.setupUnfinished} <Link href="/" className="font-semibold underline">{t.tabs.members.finishOnHome}</Link>
                        </span>
                    )}
                </div>
                <div className="flex gap-2">
                    <input
                        type="email"
                        placeholder={t.tabs.members.invitePlaceholder}
                        value={inviteEmail}
                        onChange={e => setInviteEmail(e.target.value)}
                        className="flex-1 min-w-0 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <select
                        value={inviteRole}
                        onChange={e => setInviteRole(e.target.value)}
                        className="w-32 flex-shrink-0 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <option value="member">{t.data.roles.member}</option>
                        <option value="manager">{t.data.roles.manager}</option>
                        <option value="admin">{t.data.roles.admin}</option>
                    </select>
                    <button className={BTN_PRIMARY + " flex-shrink-0"} onClick={sendInvite} disabled={inviting || !inviteEmail.trim()}>
                        {inviting ? t.tabs.members.sendingInvite : t.tabs.members.sendInvite}
                    </button>
                </div>
                <Msg msg={msg} error={isErr} />
            </div>

            {/* Teams live here because "who is on which team" is a roster
                question. Nothing created teams before (D-192), so the practice
                picker and playbook scoping both read an always-empty table. */}
            <div className={CARD}>
                <TeamsSection orgId={orgId} onChanged={load} />
            </div>

            <div>
                <div className="flex items-center justify-between gap-4 mb-3">
                    <SectionHeader title={t.tabs.members.activeMembers(members.length)} />
                    {members.length > 5 && <SearchBox value={query} onChange={setQuery} placeholder={t.tabs.members.searchMembers} className="w-56" />}
                </div>
                {loading && <p className="text-sm text-[var(--color-text-secondary)]">{t.common.loading}</p>}
                {(() => {
                    const s = query.trim().toLowerCase()
                    const shown = s ? members.filter(m => (m.email ?? "").toLowerCase().includes(s) || m.role.toLowerCase().includes(s) || m.user_id.toLowerCase().includes(s)) : members
                    return (
                <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden shadow-sm">
                    {shown.length === 0 && !loading && (
                        <div className="px-4 py-6 text-sm text-[var(--color-text-secondary)]">{s ? t.tabs.members.noMembersMatch(query) : t.tabs.members.noMembers}</div>
                    )}
                    {shown.map((m, i) => (
                        <div key={m.user_id} className={`flex items-center justify-between px-4 py-3 gap-4 ${i < shown.length - 1 ? "border-b border-[var(--color-border)]" : ""}`}>
                            <div>
                                <p className="text-sm text-[var(--color-text)] font-medium">{m.email ?? m.user_id.slice(0, 8) + "…"}</p>
                                <p className="text-xs text-[var(--color-muted)]">{t.tabs.members.joined(new Date(m.joined_at).toLocaleDateString(intl))}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <StatusBadge label={t.data.roles[m.role] ?? m.role} color={roleColor(m.role)} />
                                <select
                                    value={m.role}
                                    onChange={e => changeRole(m.user_id, e.target.value)}
                                    className="w-24 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-accent)]"
                                >
                                    <option value="member">{t.data.roles.member}</option>
                                    <option value="manager">{t.data.roles.manager}</option>
                                    <option value="admin">{t.data.roles.admin}</option>
                                    <option value="owner">{t.data.roles.owner}</option>
                                </select>
                                <button className={BTN_DANGER} onClick={() => removeMember(m.user_id)}>{t.common.remove}</button>
                            </div>
                        </div>
                    ))}
                </div>
                    )
                })()}
            </div>

            {invites.length > 0 && (
                <div>
                    <SectionHeader title={t.tabs.members.invites} />
                    <div className="space-y-1.5">
                        {invites.map(inv => (
                            <div key={inv.id} className="flex items-center justify-between text-sm px-4 py-2.5 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] shadow-sm">
                                <span className="text-[var(--color-text-secondary)]">{inv.email}</span>
                                <div className="flex items-center gap-3 text-xs">
                                    <span className="text-[var(--color-text-secondary)] capitalize">{t.data.roles[inv.role] ?? inv.role}</span>
                                    {inv.revoked_at ? (
                                        <StatusBadge label={t.tabs.members.revoked} color="slate" />
                                    ) : inv.accepted_at ? (
                                        <StatusBadge label={t.tabs.members.accepted} color="green" />
                                    ) : new Date(inv.expires_at) < new Date() ? (
                                        <StatusBadge label={t.tabs.members.expired} color="red" />
                                    ) : (
                                        <>
                                            <StatusBadge label={t.tabs.members.pending} color="yellow" />
                                            <button className={BTN_DANGER} onClick={() => revokeInvite(inv)}>{t.tabs.members.revoke}</button>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── TeamDNATab ───────────────────────────────────────────────────────────────

/// Speaker-attributed line: `Name: text`.
///
/// Unicode-aware on purpose. The original `[A-Za-z]` class silently failed on
/// every accented name — Tomás, José, Martín, Muñoz — so in a Spanish
/// transcript that speaker's lines were invisible: they never appeared in the
/// "who is the expert" picker, and they did not count as dialogue. For a
/// product whose second market is LATAM (D-177) that is not an edge case.
const SPEAKER_LINE = /^(\p{L}[\p{L}\p{M}0-9 _.'-]{0,30}):\s/u

function detectSpeakers(text: string): string[] {
    const matches = new Set<string>()
    for (const line of text.split("\n")) {
        const m = line.match(SPEAKER_LINE)
        if (m) matches.add(m[1].trim())
    }
    return Array.from(matches).slice(0, 10)
}

/// Does this text actually look like a call transcript?
///
/// It used to be enough to be longer than 100 characters, so any document at
/// all was accepted and the model dutifully produced a "playbook" out of it —
/// a resume, an invoice, a real-estate listing. The output looked plausible
/// and became the org's ACTIVE playbook, which is worse than a visible error.
///
/// The checks are deliberately structural rather than semantic: a transcript is
/// a dialogue, so it has speaker-attributed lines, more than one speaker, and
/// enough back-and-forth to have a shape. That is cheap, runs as you type, and
/// cannot be fooled by subject matter — which is the point, because we do not
/// want to reject a legitimate call for being about an unusual topic.
export type TranscriptIssue = "empty" | "tooShort" | "noSpeakers" | "oneSpeaker" | "tooFewTurns"

export function transcriptIssue(text: string): TranscriptIssue | null {
    const trimmed = text.trim()
    if (!trimmed) return "empty"

    const lines = trimmed.split("\n").map(l => l.trim()).filter(Boolean)
    const speakerLines = lines.filter(l => SPEAKER_LINE.test(l))
    const words = trimmed.split(/\s+/).filter(Boolean).length

    // No attributed lines at all means this is prose, not a dialogue — the
    // single strongest signal, and the one the PDF-of-anything case trips.
    if (speakerLines.length === 0) return "noSpeakers"
    // A transcript is mostly dialogue. A document with one stray "Note:" line
    // would otherwise pass on the check above.
    if (speakerLines.length < Math.max(6, lines.length * 0.5)) return "tooFewTurns"
    if (detectSpeakers(trimmed).length < 2) return "oneSpeaker"
    // Short enough that there is nothing to learn from, even if well-formed.
    if (words < 150) return "tooShort"
    return null
}

/// Extensions we can read as text in the browser. `.doc`/`.docx`/`.pdf` are
/// containers, not text — `file.text()` on them yields binary noise that would
/// then fail validation with a confusing message, so they are refused by name
/// with instructions instead.
// PDFs and .docx now parse for real (extractTextFromFile); only the formats
// with no browser-side parser stay refused, by name, with the fix in the copy.
const TRANSCRIPT_TEXT_EXTENSIONS = ["txt", "md", "markdown", "srt", "vtt", "csv", "tsv", "text", "log", "json", "pdf", "docx"]

function TranscriptCard({ index, entry, onChange, onRemove }: {
    index: number
    entry: TranscriptEntry
    onChange: (field: "text" | "expertSpeaker" | "repLabel", val: string) => void
    onRemove?: () => void
}) {
    const { t, intl } = useLocale()
    const fileRef = useRef<HTMLInputElement>(null)
    const [loadingFile, setLoadingFile] = useState(false)
    const [fileError, setFileError]     = useState("")

    async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        setFileError("")
        setLoadingFile(true)
        try {
            const text = await extractTextFromFile(file)
            onChange("text", text)
        } catch (err) {
            setFileError(err instanceof UnsupportedFileError
                ? t.tabs.dna.binaryError(err.ext.toUpperCase())
                : t.tabs.dna.fileError)
        } finally {
            setLoadingFile(false)
            e.target.value = ""
        }
    }

    const hasText = entry.text.trim().length > 50
    const wordCount = entry.text.split(/\s+/).filter(Boolean).length
    const issue = hasText ? transcriptIssue(entry.text) : null
    const issueMessage = issue ? t.tabs.dna.issues[issue] : null

    return (
        <div className={CARD + " space-y-3"}>
            <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-[var(--color-text)]">{t.tabs.dna.transcriptN(index + 1)}</p>
                {onRemove && (
                    <button onClick={onRemove} className="text-xs text-[var(--color-muted)] hover:text-red-500 transition-colors">{t.common.remove}</button>
                )}
            </div>

            {/* Upload zone — shown when empty */}
            {!hasText && (
                <div className="space-y-3">
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={loadingFile}
                        className="w-full border-2 border-dashed border-[var(--color-accent)] rounded-xl p-5 flex flex-col items-center gap-2 bg-teal-50/50 hover:bg-teal-50 transition-colors disabled:opacity-60">
                        <input ref={fileRef} type="file" accept={TRANSCRIPT_TEXT_EXTENSIONS.map(x => "." + x).join(",")} className="hidden" onChange={handleFile} />
                        <div className="w-10 h-10 bg-[var(--color-accent)] rounded-xl flex items-center justify-center">
                            {loadingFile
                                ? <svg className="w-5 h-5 text-white animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                                : <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                            }
                        </div>
                        <p className="text-sm font-semibold text-[var(--color-accent)]">{loadingFile ? t.tabs.dna.reading : t.tabs.dna.uploadFile}</p>
                        <p className="text-xs text-[var(--color-text-secondary)]">{t.tabs.dna.uploadFormats}</p>
                    </button>
                    <div className="relative flex items-center gap-3">
                        <div className="flex-1 border-t border-[var(--color-border)]" />
                        <span className="text-xs text-[var(--color-muted)]">{t.tabs.dna.orPaste}</span>
                        <div className="flex-1 border-t border-[var(--color-border)]" />
                    </div>
                    <textarea rows={5}
                        placeholder={t.tabs.dna.pastePlaceholder}
                        value={entry.text}
                        onChange={e => onChange("text", e.target.value)}
                        className={INPUT + " resize-y"} />
                    {fileError && <p className="text-xs text-amber-600">{fileError}</p>}
                </div>
            )}

            {/* Does this read like a call? Said before the speaker question,
                because if it isn't a transcript the speaker question is moot. */}
            {issueMessage && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
                    <p className="text-xs text-amber-900">{issueMessage}</p>
                </div>
            )}

            {/* Compact text view — shown after text is entered */}
            {hasText && (
                <div className="space-y-1">
                    <div className="flex items-center justify-between">
                        <p className="text-xs text-[var(--color-muted)]">{t.tabs.dna.nWords(wordCount.toLocaleString(intl))}</p>
                        <button onClick={() => { onChange("text", ""); onChange("expertSpeaker", "") }}
                            className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]">{t.tabs.dna.clearReplace}</button>
                    </div>
                    <textarea rows={3} value={entry.text}
                        onChange={e => onChange("text", e.target.value)}
                        className={INPUT + " resize-y text-xs text-[var(--color-text-secondary)]"} />
                </div>
            )}

            {/* Speaker selection — only once the text reads like a call */}
            {hasText && !issue && (
                <div className="border-t border-[var(--color-border)] pt-3 space-y-2">
                    <label className="text-xs font-semibold text-[var(--color-text-secondary)] block">
                        {t.tabs.dna.whoIsExpert}
                    </label>
                    {entry.detectedSpeakers.length > 0 ? (
                        <>
                            <div className="flex flex-wrap gap-2">
                                {entry.detectedSpeakers.map(speaker => (
                                    <button key={speaker}
                                        onClick={() => onChange("expertSpeaker", entry.expertSpeaker === speaker ? "" : speaker)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                            entry.expertSpeaker === speaker
                                                ? "bg-[var(--btn-bg)] text-[var(--btn-ink)] border-[var(--btn-bg)]"
                                                : "bg-[var(--color-bg)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                                        }`}>
                                        {speaker}
                                    </button>
                                ))}
                            </div>
                            {entry.expertSpeaker
                                ? <p className="text-xs text-green-600">✓ {t.tabs.dna.learningFrom} <span className="font-medium">{entry.expertSpeaker}</span></p>
                                : <p className="text-xs text-amber-600">{t.tabs.dna.tapAName}</p>
                            }
                        </>
                    ) : (
                        <p className="text-xs text-amber-600">
                            {t.tabs.dna.noSpeakers}
                        </p>
                    )}
                    <div className="pt-1 space-y-1">
                        <label className="text-xs font-semibold text-[var(--color-text-secondary)] block">
                            {t.tabs.dna.repLabel}
                        </label>
                        <input type="text" value={entry.repLabel}
                            placeholder={t.tabs.dna.repLabelPlaceholder}
                            onChange={e => onChange("repLabel", e.target.value)}
                            className={INPUT} />
                    </div>
                </div>
            )}
        </div>
    )
}

/// Shape of the `transcripts` jsonb column on org_team_dna. Snake_case on the
/// wire like every other row shape; the camelCase TranscriptEntry is UI state.
interface StoredTranscript { text: string; expert_speaker: string; rep_label: string | null }

function freshEntry(): TranscriptEntry {
    return { id: crypto.randomUUID(), text: "", expertSpeaker: "", repLabel: "", detectedSpeakers: [] }
}

function allIndices(n: number): Set<number> {
    return new Set(Array.from({ length: n }, (_, i) => i))
}

function toggleIndex(setSel: React.Dispatch<React.SetStateAction<Set<number>>>, i: number) {
    setSel(prev => {
        const n = new Set(prev)
        if (n.has(i)) n.delete(i); else n.add(i)
        return n
    })
}

/// Same Select all / None pair the objection-extraction review uses — per-item
/// apply keeps "everything" one click away in both directions.
function SelectAllNone({ t, count, setSel }: { t: Dict; count: number; setSel: (s: Set<number>) => void }) {
    return (
        <div className="flex gap-2 flex-shrink-0">
            <button className={BTN_GHOST} onClick={() => setSel(allIndices(count))}>{t.tabs.dna.selectAll}</button>
            <button className={BTN_GHOST} onClick={() => setSel(new Set())}>{t.tabs.dna.none}</button>
        </div>
    )
}

export function TeamDNATab({ orgId, org, onApplied }: { orgId: string; org: OrgInfo; onApplied: () => void }) {
    const { t, intl } = useLocale()
    const [step, setStep]               = useState<DNAStep>("collect")
    const [expertName, setExpertName]   = useState("")
    const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([freshEntry()])
    const [dnaResult, setDnaResult]     = useState<DNAResult | null>(null)
    const [error, setError]             = useState("")
    const [reviewTab, setReviewTab]     = useState<DNAReviewTab>("tone")
    const [applyingTone, setApplyingTone]           = useState(false)
    const [applyingPhrases, setApplyingPhrases]     = useState(false)
    const [applyingObjections, setApplyingObjections] = useState(false)
    const [applyingFlow, setApplyingFlow]           = useState(false)
    const [appliedSections, setAppliedSections]     = useState<Set<string>>(new Set())
    // The exact transcripts the model saw (valid ones only) — what the Sources
    // card shows. Kept separate from the collect-step entries, which may
    // include the auto-opened empty slot.
    const [analyzedTranscripts, setAnalyzedTranscripts] = useState<StoredTranscript[]>([])
    const [analyzedAt, setAnalyzedAt]   = useState<string | null>(null)
    // Restoring a stored analysis has to gate the first paint: rendering the
    // collect step and then jumping to review reads as a glitch.
    const [loadingStored, setLoadingStored] = useState(true)
    // Per-item selection, one set per section, everything pre-checked —
    // "apply all" stays the default and unticking is the exception.
    const [selPower, setSelPower]           = useState<Set<number>>(new Set())
    const [selAvoid, setSelAvoid]           = useState<Set<number>>(new Set())
    const [selObjections, setSelObjections] = useState<Set<number>>(new Set())
    const [selFlow, setSelFlow]             = useState<Set<number>>(new Set())
    // Where the flow playbook landed ("draft" vs "active") — the manager has
    // to be told, because a draft is invisible until activated.
    const [flowLanded, setFlowLanded]       = useState<"draft" | "active" | null>(null)

    function enterReview(result: DNAResult, applied: Set<string>) {
        setDnaResult(result)
        setAppliedSections(applied)
        setSelPower(allIndices(result.power_phrases.length))
        setSelAvoid(allIndices(result.phrases_to_avoid.length))
        setSelObjections(allIndices(result.objections.length))
        setSelFlow(allIndices(result.conversation_flow.stages.length))
        setFlowLanded(null)
        setStep("review")
    }

    // An analysis is minutes of work by the model and the manager; the tab
    // unmounts on every navigation, so it lives in org_team_dna, not in state.
    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const { data } = await supabase.from("org_team_dna")
                    .select("result, transcripts, expert_name, applied_sections, analyzed_at")
                    .eq("org_id", orgId).maybeSingle()
                if (cancelled || !data) return
                const stored = (data.transcripts ?? []) as StoredTranscript[]
                setAnalyzedTranscripts(stored)
                setTranscripts(stored.length > 0
                    ? stored.map(s => ({
                        id: crypto.randomUUID(), text: s.text, expertSpeaker: s.expert_speaker,
                        repLabel: s.rep_label ?? "", detectedSpeakers: detectSpeakers(s.text),
                    }))
                    : [freshEntry()])
                setExpertName((data.expert_name as string | null) ?? "")
                setAnalyzedAt((data.analyzed_at as string | null) ?? null)
                enterReview(data.result as DNAResult, new Set((data.applied_sections ?? []) as string[]))
            } finally {
                if (!cancelled) setLoadingStored(false)
            }
        })()
        return () => { cancelled = true }
        // enterReview is stable in behavior; listing it would force useCallback noise.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orgId])

    function addTranscript() {
        setTranscripts(prev => [...prev, freshEntry()])
    }
    function removeTranscript(id: string) {
        setTranscripts(prev => prev.filter(t => t.id !== id))
    }
    function updateTranscript(id: string, field: "text" | "expertSpeaker" | "repLabel", value: string) {
        setTranscripts(prev => {
            const next = prev.map(t => {
                if (t.id !== id) return t
                if (field === "text") return { ...t, text: value, detectedSpeakers: detectSpeakers(value) }
                return { ...t, [field]: value }
            })
            // Open the next slot as soon as this one is genuinely done, so the
            // requirement teaches itself: you finish one, the next appears, and
            // the counter moves. Previously the only way to reach three was to
            // notice a muted dashed button below the fold and press it twice —
            // people got to "1 of 3" and stopped, with no idea what was wrong.
            const complete = next.filter(t => !transcriptIssue(t.text) && t.expertSpeaker)
            if (complete.length < MIN && complete.length === next.length) {
                return [...next, freshEntry()]
            }
            return next
        })
    }

    /// Green "applied" markers must survive navigation like the analysis
    /// itself does, so every Apply writes the section list back to the row.
    async function persistApplied(section: string) {
        const next = new Set(appliedSections); next.add(section)
        setAppliedSections(next)
        await supabase.from("org_team_dna")
            .update({ applied_sections: Array.from(next) }).eq("org_id", orgId)
    }

    async function analyze() {
        setError("")
        const valid = transcripts.filter(t => !transcriptIssue(t.text) && t.expertSpeaker)
        if (valid.length < MIN) {
            setError(t.tabs.dna.need3)
            return
        }
        setStep("analyzing")
        try {
            const { data: { session } } = await supabase.auth.getSession()
            const res = await fetch(
                `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/learn-from-transcripts`,
                {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
                    body: JSON.stringify({
                        transcripts: valid.map(t => ({ text: t.text, expert_speaker: t.expertSpeaker })),
                        expert_name: expertName.trim() || "Expert",
                    }),
                }
            )
            const json = await res.json().catch(() => ({}))
            if (!res.ok) { setError(errStr((json as Record<string, unknown>).error) || t.tabs.dna.analysisFailed); setStep("collect"); return }
            const stored: StoredTranscript[] = valid.map(t =>
                ({ text: t.text, expert_speaker: t.expertSpeaker, rep_label: t.repLabel.trim() || null }))
            const now = new Date().toISOString()
            setAnalyzedTranscripts(stored)
            setAnalyzedAt(now)
            enterReview(json as DNAResult, new Set())
            // One row per org: a new analysis overwrites the previous one.
            // Persist failure is non-fatal — the review is already on screen.
            const { data: { user } } = await supabase.auth.getUser()
            await supabase.from("org_team_dna").upsert({
                org_id: orgId,
                result: json,
                transcripts: stored,
                expert_name: expertName.trim() || null,
                applied_sections: [],
                analyzed_at: now,
                analyzed_by: user?.id ?? null,
            })
        } catch (e) {
            setError(errStr(e))
            setStep("collect")
        }
    }

    async function applyTone() {
        if (!dnaResult) return
        setApplyingTone(true)
        try {
            const newDescriptors = dnaResult.tone.descriptors.join(", ")
            const existing = org.voice_profile?.tone ?? ""
            const merged = existing ? `${existing}, ${newDescriptors}` : newDescriptors
            await supabase.from("organizations").update({ voice_profile: { ...org.voice_profile, tone: merged } }).eq("id", orgId)
            await persistApplied("tone")
            onApplied()
        } finally { setApplyingTone(false) }
    }

    async function applyPhrases() {
        if (!dnaResult || selPower.size + selAvoid.size === 0) return
        setApplyingPhrases(true)
        try {
            const required = [...(org.voice_profile?.required_phrases ?? []), ...dnaResult.power_phrases.filter((_, i) => selPower.has(i)).map(p => p.phrase)]
            const banned   = [...(org.voice_profile?.banned_phrases   ?? []), ...dnaResult.phrases_to_avoid.filter((_, i) => selAvoid.has(i)).map(p => p.pattern)]
            await supabase.from("organizations").update({ voice_profile: { ...org.voice_profile, required_phrases: required, banned_phrases: banned } }).eq("id", orgId)
            await persistApplied("phrases")
            onApplied()
        } finally { setApplyingPhrases(false) }
    }

    async function applyObjections() {
        if (!dnaResult || selObjections.size === 0) return
        setApplyingObjections(true)
        try {
            const { data: inserted } = await supabase.from("org_objections").insert(
                dnaResult.objections.filter((_, i) => selObjections.has(i)).map(o => ({
                    org_id: orgId, objection: o.objection, response_guidance: o.response_guidance,
                    // The expert's verbatim line is the strongest approved
                    // response there is — it used to be shown on the review
                    // card and then dropped on save.
                    approved_responses: [
                        ...approvedResponsesFrom(o.response_guidance),
                        ...(o.example_quote?.trim() ? [{ text: o.example_quote.trim() }] : []),
                    ],
                    severity: normalizeSeverity(o.severity), variants: null, active: true,
                    source: "team_dna",
                }))
            ).select("id")
            await embedObjections(orgId, (inserted ?? []).map(x => x.id as string))
            await persistApplied("objections")
        } finally { setApplyingObjections(false) }
    }

    async function applyFlow() {
        if (!dnaResult || selFlow.size === 0) return
        setApplyingFlow(true)
        try {
            // Never demote what's already active: under D-192 scoping an org
            // can have correctly-scoped team playbooks live, and a blanket
            // "active → draft" here silently un-assigned all of them. Mirror
            // applyStarterKit instead — land as draft when anything is active,
            // active only into an empty slot — and say where it landed.
            const { data: activeExisting } = await supabase.from("org_playbooks")
                .select("id").eq("org_id", orgId).eq("status", "active").limit(1)
            const status = (activeExisting?.length ?? 0) > 0 ? "draft" : "active"
            await supabase.from("org_playbooks").insert({
                org_id: orgId,
                name: `${expertName.trim() || "Expert"} Playbook (Team DNA)`,
                methodology: dnaResult.conversation_flow.methodology_guess,
                status, version: 1,
                // Same stage shape the coach reads (required / talking_points /
                // exit_criteria). The old `required_items` key was silently
                // dropped on the way into the prompt.
                stages: dnaResult.conversation_flow.stages.filter((_, i) => selFlow.has(i)).map(s => ({
                    key: s.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
                    name: s.name,
                    description: s.description,
                    required: s.required_items ?? [],
                    talking_points: [],
                    exit_criteria: "",
                })),
            })
            setFlowLanded(status)
            await persistApplied("flow")
        } finally { setApplyingFlow(false) }
    }

    // "Complete" means it passes the same check the analyze button enforces —
    // a card can't count toward 3 of 3 and then be rejected on submit.
    const completedCount = transcripts.filter(t => !transcriptIssue(t.text) && t.expertSpeaker).length
    const MIN = 3

    if (loadingStored) {
        return <div className="text-[var(--color-text-secondary)] text-sm">{t.tabs.dna.loadingStored}</div>
    }

    if (step === "analyzing") {
        return (
            <div className={CARD + " flex flex-col items-center justify-center gap-6 py-20"}>
                <div className="w-14 h-14 border-4 border-teal-200 border-t-[var(--color-accent)] rounded-full animate-spin" />
                <div className="text-center">
                    <p className="text-[var(--color-text)] font-semibold text-lg">{t.tabs.dna.analyzingTitle}</p>
                    <p className="text-[var(--color-text-secondary)] text-sm mt-1">{t.tabs.dna.analyzingSub}</p>
                </div>
            </div>
        )
    }

    if (step === "review" && dnaResult) {
        // Tone → Flow → Objections → Phrases: the framework before the
        // vocabulary. Leading with phrases right after tone front-loaded the
        // two shallowest sections and buried the playbook.
        const reviewTabs: { key: DNAReviewTab; label: string }[] = [
            { key: "tone",       label: t.tabs.dna.reviewTabs.tone       },
            { key: "flow",       label: t.tabs.dna.reviewTabs.flow       },
            { key: "objections", label: t.tabs.dna.reviewTabs.objections },
            { key: "phrases",    label: t.tabs.dna.reviewTabs.phrases    },
        ]
        return (
            <div className="space-y-4">
                <div className={CARD}>
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-xs font-medium text-[var(--color-accent)] uppercase tracking-wide mb-1">{t.tabs.dna.analysisComplete}</p>
                            {analyzedAt && (
                                <p className="text-xs text-[var(--color-muted)] mb-1">
                                    {t.tabs.dna.analysisOf(new Date(analyzedAt).toLocaleDateString(intl, { dateStyle: "long" }))}
                                </p>
                            )}
                            <p className="text-[var(--color-text)] text-sm leading-relaxed">{dnaResult.summary}</p>
                        </div>
                        {/* Back to collect with the analyzed transcripts pre-filled.
                            The stored row stays — only a new analysis replaces it,
                            so backing out costs nothing. */}
                        <button onClick={() => setStep("collect")}
                            className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] whitespace-nowrap flex-shrink-0">
                            {t.tabs.dna.newAnalysis}
                        </button>
                    </div>
                </div>
                <div className="border-b border-[var(--color-border)] flex gap-1">
                    {reviewTabs.map(rt => (
                        <button key={rt.key} onClick={() => setReviewTab(rt.key)}
                            className={`px-4 py-2 text-sm border-b-2 transition-colors -mb-px flex items-center gap-1.5 ${
                                reviewTab === rt.key
                                    ? "border-[var(--color-accent)] text-[var(--color-accent)] font-medium"
                                    : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                            }`}>
                            {rt.label}
                            {appliedSections.has(rt.key) && <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />}
                        </button>
                    ))}
                </div>

                {reviewTab === "tone" && (
                    <div className={CARD + " space-y-4"}>
                        <div>
                            <p className="text-sm font-semibold text-[var(--color-text)] mb-1">{t.tabs.dna.detectedStyle}</p>
                            <p className="text-xs text-[var(--color-text-secondary)]">{dnaResult.tone.evidence}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {dnaResult.tone.descriptors.map(d => (
                                <span key={d} className="px-3 py-1 rounded-full bg-teal-50 text-[var(--color-accent)] text-sm font-medium border border-teal-200">{d}</span>
                            ))}
                        </div>
                        {org.voice_profile?.tone && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                <p className="text-xs font-medium text-amber-700 mb-1">{t.tabs.dna.currentTone}</p>
                                <p className="text-xs text-amber-600">{org.voice_profile.tone}</p>
                                <p className="text-xs text-amber-500 mt-1">{t.tabs.dna.mergeNote}</p>
                            </div>
                        )}
                        <button onClick={applyTone} disabled={applyingTone || appliedSections.has("tone")}
                            className={BTN_PRIMARY + (appliedSections.has("tone") ? " opacity-60" : "")}>
                            {appliedSections.has("tone") ? t.tabs.dna.applied : applyingTone ? t.tabs.dna.applying : t.tabs.dna.applyTone}
                        </button>
                    </div>
                )}

                {reviewTab === "phrases" && (
                    <div className="space-y-4">
                        <div className={CARD + " space-y-3"}>
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-semibold text-[var(--color-text)]">{t.tabs.dna.powerPhrases(dnaResult.power_phrases.length)}</p>
                                    <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{t.tabs.dna.powerPhrasesSub}</p>
                                </div>
                                <SelectAllNone t={t} count={dnaResult.power_phrases.length} setSel={setSelPower} />
                            </div>
                            <div className="space-y-2">
                                {dnaResult.power_phrases.map((p, i) => (
                                    <label key={i} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selPower.has(i) ? "border-[var(--color-accent)] bg-teal-50" : "border-[var(--color-border)] bg-[var(--color-bg)]"}`}>
                                        <input type="checkbox" checked={selPower.has(i)}
                                            onChange={() => toggleIndex(setSelPower, i)}
                                            className="mt-0.5 accent-[var(--color-accent)]" />
                                        <div className="min-w-0">
                                            <p className="text-sm text-[var(--color-text)] font-medium">"{p.phrase}"</p>
                                            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{p.context} · {p.appears_in}</p>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div className={CARD + " space-y-3"}>
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-semibold text-[var(--color-text)]">{t.tabs.dna.avoidPhrases(dnaResult.phrases_to_avoid.length)}</p>
                                    <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{t.tabs.dna.avoidPhrasesSub}</p>
                                </div>
                                <SelectAllNone t={t} count={dnaResult.phrases_to_avoid.length} setSel={setSelAvoid} />
                            </div>
                            <div className="space-y-2">
                                {dnaResult.phrases_to_avoid.map((p, i) => (
                                    <label key={i} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selAvoid.has(i) ? "border-[var(--color-accent)] bg-teal-50" : "border-[var(--color-border)] bg-[var(--color-bg)]"}`}>
                                        <input type="checkbox" checked={selAvoid.has(i)}
                                            onChange={() => toggleIndex(setSelAvoid, i)}
                                            className="mt-0.5 accent-[var(--color-accent)]" />
                                        <div className="min-w-0">
                                            <p className="text-sm text-[var(--color-text)] font-medium">{p.pattern}</p>
                                            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{p.why}</p>
                                            <p className="text-xs text-teal-600 mt-0.5">{t.tabs.dna.instead} {p.better_alternative}</p>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>
                        {(org.voice_profile?.required_phrases?.length || org.voice_profile?.banned_phrases?.length) && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                <p className="text-xs font-medium text-amber-700 mb-1">{t.tabs.dna.existingPhrases}</p>
                                <p className="text-xs text-amber-600">
                                    {t.tabs.dna.existingPhrasesBody(org.voice_profile.required_phrases?.length ?? 0, org.voice_profile.banned_phrases?.length ?? 0)}
                                </p>
                            </div>
                        )}
                        <button onClick={applyPhrases} disabled={applyingPhrases || appliedSections.has("phrases") || selPower.size + selAvoid.size === 0}
                            className={BTN_PRIMARY + (appliedSections.has("phrases") ? " opacity-60" : "")}>
                            {appliedSections.has("phrases") ? t.tabs.dna.applied : applyingPhrases ? t.tabs.dna.applying : t.tabs.dna.applyPhrasesN(selPower.size + selAvoid.size)}
                        </button>
                    </div>
                )}

                {reviewTab === "objections" && (
                    <div className={CARD + " space-y-4"}>
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold text-[var(--color-text)]">{t.tabs.dna.objectionHandlers(dnaResult.objections.length)}</p>
                                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{t.tabs.dna.objectionHandlersSub}</p>
                            </div>
                            <SelectAllNone t={t} count={dnaResult.objections.length} setSel={setSelObjections} />
                        </div>
                        <div className="space-y-3">
                            {dnaResult.objections.map((o, i) => (
                                <label key={i} className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${selObjections.has(i) ? "border-[var(--color-accent)] bg-teal-50/40" : "border-[var(--color-border)] bg-[var(--color-bg)]"}`}>
                                    <input type="checkbox" checked={selObjections.has(i)}
                                        onChange={() => toggleIndex(setSelObjections, i)}
                                        className="mt-0.5 accent-[var(--color-accent)]" />
                                    <div className="min-w-0 flex-1 space-y-2">
                                        {/* Labeled rows, same rule as the doc-extraction review
                                            list: which line is the objection, which is the
                                            technique, and which is what you say back is not
                                            answerable from font weight alone. */}
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] font-semibold">{t.tabs.objections.labelObjection}</p>
                                                <p className="text-sm font-medium text-[var(--color-text)]">{o.objection}</p>
                                            </div>
                                            <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                                                o.severity === "critical" ? "bg-red-100 text-red-700" :
                                                                            "bg-[var(--color-line-soft)] text-[var(--color-text-secondary)]"
                                            }`}>{t.data.severities[o.severity] ?? o.severity}</span>
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] font-semibold">{t.tabs.dna.labelTechnique}</p>
                                            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{o.expert_response_summary}</p>
                                        </div>
                                        {o.example_quote && (
                                            <div>
                                                <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] font-semibold">{t.tabs.dna.labelQuote}</p>
                                                <p className="text-xs text-teal-700 bg-teal-50 rounded-lg px-3 py-2 italic mt-0.5">"{o.example_quote}"</p>
                                            </div>
                                        )}
                                        <div className="border-t border-[var(--color-border)] pt-2">
                                            <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted)] font-semibold">{t.tabs.objections.labelGuidance}</p>
                                            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{o.response_guidance}</p>
                                        </div>
                                    </div>
                                </label>
                            ))}
                        </div>
                        <button onClick={applyObjections} disabled={applyingObjections || appliedSections.has("objections") || selObjections.size === 0}
                            className={BTN_PRIMARY + (appliedSections.has("objections") ? " opacity-60" : "")}>
                            {appliedSections.has("objections") ? t.tabs.dna.applied : applyingObjections ? t.tabs.dna.addingObjections : t.tabs.dna.addObjections(selObjections.size)}
                        </button>
                    </div>
                )}

                {reviewTab === "flow" && (
                    <div className={CARD + " space-y-4"}>
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold text-[var(--color-text)]">{t.tabs.dna.convFramework}</p>
                                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                                    {t.tabs.dna.detectedMethodology} <span className="font-medium text-[var(--color-text-secondary)]">{dnaResult.conversation_flow.methodology_guess}</span> {t.tabs.dna.savedAsPlaybook}
                                </p>
                            </div>
                            <SelectAllNone t={t} count={dnaResult.conversation_flow.stages.length} setSel={setSelFlow} />
                        </div>
                        <div className="space-y-3">
                            {dnaResult.conversation_flow.stages.map((s, i) => (
                                <label key={i} className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${selFlow.has(i) ? "border-[var(--color-accent)] bg-teal-50/40" : "border-[var(--color-border)] bg-[var(--color-bg)]"}`}>
                                    <input type="checkbox" checked={selFlow.has(i)}
                                        onChange={() => toggleIndex(setSelFlow, i)}
                                        className="mt-1 accent-[var(--color-accent)]" />
                                    <div className="min-w-0 flex-1 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <span className="w-6 h-6 rounded-full bg-teal-100 text-[var(--color-accent)] text-xs font-semibold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                                            <p className="text-sm font-semibold text-[var(--color-text)]">{s.name}</p>
                                        </div>
                                        <p className="text-xs text-[var(--color-text-secondary)] pl-8">{s.description}</p>
                                        {s.required_items.length > 0 && (
                                            <ul className="pl-8 space-y-0.5">
                                                {s.required_items.map((item, j) => (
                                                    <li key={j} className="text-xs text-[var(--color-text-secondary)] flex items-start gap-1.5">
                                                        <span className="text-[var(--color-accent)] flex-shrink-0">·</span>{item}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                        {s.transition_signal && (
                                            <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-1.5 pl-8">
                                                <span className="font-medium">{t.tabs.dna.moveOnWhen}</span> {s.transition_signal}
                                            </p>
                                        )}
                                    </div>
                                </label>
                            ))}
                        </div>
                        <button onClick={applyFlow} disabled={applyingFlow || appliedSections.has("flow") || selFlow.size === 0}
                            className={BTN_PRIMARY + (appliedSections.has("flow") ? " opacity-60" : "")}>
                            {appliedSections.has("flow") ? t.tabs.dna.applied : applyingFlow ? t.tabs.dna.savingFlow : t.tabs.dna.addAsPlaybook}
                        </button>
                        {flowLanded && (
                            <Msg msg={flowLanded === "draft" ? t.tabs.dna.flowSavedDraft : t.tabs.dna.flowSavedActive} />
                        )}
                    </div>
                )}

                {/* Sources — the transcripts this analysis is built from. Honest
                    display only: label, size, expert speaker. The model returns
                    one blended result, so no per-rep breakdown is invented. */}
                {analyzedTranscripts.length > 0 && (
                    <div className={CARD + " space-y-3"}>
                        <div>
                            <p className="text-sm font-semibold text-[var(--color-text)]">{t.tabs.dna.sources}</p>
                            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{t.tabs.dna.sourcesSub}</p>
                        </div>
                        <div className="divide-y divide-[var(--color-border)]">
                            {analyzedTranscripts.map((s, i) => {
                                const words = s.text.split(/\s+/).filter(Boolean).length
                                return (
                                    <div key={i} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                                        <p className="text-sm text-[var(--color-text)] font-medium truncate">{s.rep_label || t.tabs.dna.transcriptN(i + 1)}</p>
                                        <p className="text-xs text-[var(--color-text-secondary)] whitespace-nowrap flex-shrink-0">
                                            {t.tabs.dna.nWords(words.toLocaleString(intl))} · {t.tabs.dna.sourceExpert(s.expert_speaker)}
                                        </p>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}
            </div>
        )
    }

    // Step 1: Collect
    return (
        <div className="space-y-4">
            <div className={CARD + " space-y-4"}>
                <div>
                    <p className="text-sm font-semibold text-[var(--color-text)]">{t.tabs.dna.title}</p>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                        {t.tabs.dna.sub}
                    </p>
                </div>
                <ManualSection label={t.tabs.dna.playbookName} forceOpen={!!expertName}>
                    <input type="text" placeholder={t.tabs.dna.playbookNamePlaceholder}
                        value={expertName} onChange={e => setExpertName(e.target.value)}
                        className={INPUT} />
                    <p className="text-xs text-[var(--color-muted)] mt-1">{t.tabs.dna.playbookNameHint}</p>
                </ManualSection>
                <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-[var(--color-line-soft)] rounded-full overflow-hidden">
                        <div className="h-full bg-[var(--color-accent)] transition-all rounded-full"
                            style={{ width: `${Math.min((completedCount / MIN) * 100, 100)}%` }} />
                    </div>
                    <span className="text-xs text-[var(--color-text-secondary)] whitespace-nowrap">
                        {t.tabs.dna.progress(completedCount, MIN)}
                    </span>
                </div>
            </div>

            {transcripts.map((tr, i) => (
                <TranscriptCard key={tr.id} index={i} entry={tr}
                    onChange={(field, val) => updateTranscript(tr.id, field, val)}
                    onRemove={transcripts.length > 1 ? () => removeTranscript(tr.id) : undefined}
                />
            ))}

            <div className="flex gap-3">
                <button onClick={addTranscript}
                    className="flex-1 border-2 border-dashed border-[var(--color-border)] rounded-xl py-3 text-sm text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors">
                    {t.tabs.dna.addTranscript}
                </button>
                <button onClick={analyze} disabled={completedCount < MIN}
                    className={BTN_PRIMARY + " flex-shrink-0" + (completedCount < MIN ? " opacity-50 cursor-not-allowed" : "")}>
                    {completedCount < MIN ? t.tabs.dna.needMore(MIN - completedCount) : t.tabs.dna.analyzeN(completedCount)}
                </button>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
    )
}

// ─── Billing Tab ──────────────────────────────────────────────────────────────

interface BillingInfo {
    org_name: string
    plan: string
    seats_purchased: number
    seats_members: number
    seats_pending: number
    has_stripe: boolean
    stripe: {
        status: string
        quantity: number
        unit_amount: number | null
        currency: string
        interval: string
        current_period_end: number
        cancel_at_period_end: boolean
    } | null
}

export function BillingTab({ orgId, trialEndsAt }: { orgId: string; trialEndsAt?: string | null }) {
    const { t, intl } = useLocale()
    const [info, setInfo]         = useState<BillingInfo | null>(null)
    const [loading, setLoading]   = useState(true)
    const [seatDraft, setSeatDraft] = useState<number>(0)
    const [saving, setSaving]     = useState(false)
    const [portalBusy, setPortalBusy] = useState(false)
    const [checkoutBusy, setCheckoutBusy] = useState(false)
    const [interval_, setInterval_]   = useState<"month" | "year">("year")
    const [msg, setMsg]           = useState<string | null>(null)
    const [isErr, setIsErr]       = useState(false)


    const call = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/org-billing`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ action, org_id: orgId, ...extra }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(errStr(json.error) || res.statusText)
        return json
    }, [orgId])

    const load = useCallback(async () => {
        try {
            const data = await call("info") as BillingInfo
            setInfo(data)
            setSeatDraft(data.seats_purchased)
        } catch (e) {
            setMsg(errStr(e)); setIsErr(true)
        } finally {
            setLoading(false)
        }
    }, [call])

    useEffect(() => { load() }, [load])

    // Back from Stripe Checkout.
    //
    // This used to only print "payment received" and stop — so the page kept
    // rendering the pre-payment state (still asking for billing, gate still
    // up) under a green success line, and the only way out was a manual
    // reload. Reported as "I paid and nothing changed".
    //
    // The subscription is attached asynchronously by stripe-webhook, so poll
    // for it instead of asserting it. On success reload the whole page rather
    // than just this tab: the shell resolves entitlement independently, and
    // the activation gate has to come down too. If the webhook has not landed
    // within the window, say exactly that instead of leaving a success message
    // over a workspace that is still unpaid.
    const [confirming, setConfirming] = useState(false)
    useEffect(() => {
        const q = new URLSearchParams(window.location.search)
        if (q.get("checkout") === "canceled") { setMsg(t.tabs.billing.checkoutCanceled); setIsErr(false); return }
        if (q.get("checkout") !== "success") return

        let cancelled = false
        setConfirming(true); setMsg(t.tabs.billing.checkoutSuccess); setIsErr(false)
        ;(async () => {
            for (let attempt = 0; attempt < 8 && !cancelled; attempt++) {
                await new Promise(r => setTimeout(r, attempt === 0 ? 1500 : 2500))
                if (cancelled) return
                try {
                    const data = await call("info") as BillingInfo
                    if (data.has_stripe) {
                        window.location.replace("/settings?tab=billing")
                        return
                    }
                } catch { /* keep polling — a transient failure is not an answer */ }
            }
            if (!cancelled) {
                setConfirming(false)
                setMsg(t.tabs.billing.checkoutPending); setIsErr(true)
            }
        })()
        return () => { cancelled = true }
    }, [t, call])

    async function updateSeats() {
        if (!info || seatDraft === info.seats_purchased) return
        setSaving(true); setMsg(null)
        try {
            await call("set_seats", { seats: seatDraft })
            setMsg(seatDraft > info.seats_purchased
                ? t.tabs.billing.seatsUpdatedUp(seatDraft)
                : t.tabs.billing.seatsUpdatedDown(seatDraft))
            setIsErr(false)
            await load()
        } catch (e) {
            setMsg(errStr(e)); setIsErr(true)
        } finally {
            setSaving(false)
        }
    }

    async function openPortal() {
        setPortalBusy(true); setMsg(null)
        try {
            const { url } = await call("portal") as { url: string }
            window.open(url, "_blank", "noopener")
        } catch (e) {
            setMsg(errStr(e)); setIsErr(true)
        } finally {
            setPortalBusy(false)
        }
    }

    async function startCheckout() {
        setCheckoutBusy(true); setMsg(null)
        try {
            const { url } = await call("checkout", { interval: interval_ }) as { url: string }
            window.location.href = url
        } catch (e) {
            setMsg(errStr(e)); setIsErr(true)
            setCheckoutBusy(false)
        }
    }

    if (loading) return <div className="text-[var(--color-text-secondary)] text-sm">{t.tabs.billing.loadingBilling}</div>
    if (!info)   return <div className="text-red-600 text-sm">{msg ?? t.tabs.billing.couldntLoad}</div>

    const used   = info.seats_members + info.seats_pending
    const total  = Math.max(info.seats_purchased, used, 1)
    const memberPct  = Math.min(100, (info.seats_members / total) * 100)
    const pendingPct = Math.min(100 - memberPct, (info.seats_pending / total) * 100)
    const perSeat = info.stripe?.unit_amount != null
        ? `${(info.stripe.unit_amount / 100).toLocaleString(intl, { style: "currency", currency: info.stripe.currency.toUpperCase() })}/seat/${info.stripe.interval}`
        : null
    const renewal = info.stripe?.current_period_end
        ? new Date(info.stripe.current_period_end * 1000).toLocaleDateString(intl, { dateStyle: "long" })
        : null

    return (
        <div className="space-y-6">
            {/* Seats */}
            <div className={CARD}>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h3 className="text-sm font-semibold text-[var(--color-text)]">{t.tabs.billing.seats}</h3>
                        <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                            {t.tabs.billing.seatUsage(info.seats_members, info.seats_pending, info.seats_purchased)}
                        </p>
                    </div>
                    <StatusBadge label={t.tabs.billing.planBadge(info.plan)} color="indigo" />
                </div>

                <div className="mt-4 h-2.5 rounded-full bg-[var(--color-line-soft)] overflow-hidden flex">
                    <div className="bg-[var(--color-accent)] h-full" style={{ width: `${memberPct}%` }} />
                    <div className="bg-amber-400 h-full" style={{ width: `${pendingPct}%` }} />
                </div>
                {/* Three colours with no key is a puzzle, not a chart: the bar
                    was shipping green/amber/grey and expecting the sentence
                    above it to be decoded backwards into them. */}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
                        <span className="w-2.5 h-2.5 rounded-sm bg-[var(--color-accent)]" aria-hidden="true" />
                        {t.tabs.billing.legendMembers(info.seats_members)}
                    </span>
                    {info.seats_pending > 0 && (
                        <span className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
                            <span className="w-2.5 h-2.5 rounded-sm bg-amber-400" aria-hidden="true" />
                            {t.tabs.billing.legendPending(info.seats_pending)}
                        </span>
                    )}
                    {info.seats_purchased > used && (
                        <span className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
                            <span className="w-2.5 h-2.5 rounded-sm bg-[var(--color-line-soft)] border border-[var(--color-border)]" aria-hidden="true" />
                            {t.tabs.billing.legendFree(info.seats_purchased - used)}
                        </span>
                    )}
                </div>
                {used >= info.seats_purchased && (
                    <p className="text-xs text-amber-700 mt-2">
                        {t.tabs.billing.allSeatsUsed}
                    </p>
                )}

                {info.has_stripe ? (() => {
                    // Teams caps at 20 seats (mirrored in org-billing and
                    // create-org); Enterprise has no plan cap — 500 is a
                    // fat-finger ceiling only.
                    const seatCap = info.plan === "team" ? 20 : 500
                    return (
                    <div className="mt-5 pt-4 border-t border-[var(--color-border)]">
                    <div className="flex flex-wrap items-end gap-3">
                        <div className="space-y-1">
                            <label className="text-xs text-[var(--color-text-secondary)] font-medium">{t.tabs.billing.seats}</label>
                            <div className="flex items-center gap-1">
                                <button className={BTN_GHOST} onClick={() => setSeatDraft(s => Math.max(info.seats_members, s - 1))} disabled={saving || seatDraft <= info.seats_members}>−</button>
                                <input
                                    type="number"
                                    value={seatDraft}
                                    min={info.seats_members}
                                    max={seatCap}
                                    onChange={e => setSeatDraft(Math.max(1, Math.min(seatCap, Number(e.target.value) || 1)))}
                                    className="w-20 text-center bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
                                />
                                <button className={BTN_GHOST} onClick={() => setSeatDraft(s => Math.min(seatCap, s + 1))} disabled={saving || seatDraft >= seatCap}>+</button>
                            </div>
                        </div>
                        <button className={BTN_PRIMARY} onClick={updateSeats} disabled={saving || seatDraft === info.seats_purchased}>
                            {saving ? t.tabs.billing.updating : seatDraft > info.seats_purchased ? t.tabs.billing.addSeats(seatDraft - info.seats_purchased) : seatDraft < info.seats_purchased ? t.tabs.billing.reduceTo(seatDraft) : t.tabs.billing.updateSeats}
                        </button>
                        {perSeat && <span className="text-xs text-[var(--color-text-secondary)] pb-2.5">{t.tabs.billing.perSeatNote(perSeat)}</span>}
                    </div>
                    {info.plan === "team" && seatDraft >= seatCap && (
                        <p className="text-xs text-[var(--color-text-secondary)] mt-2">
                            {t.tabs.billing.seatCapNote}{" "}
                            <EmailLink email="hello@talkpilot.co" subject="TalkPilot Enterprise" className="font-semibold text-[var(--color-accent-deep)] hover:underline">
                                {t.tabs.billing.seatCapCta}
                            </EmailLink>
                        </p>
                    )}
                    </div>
                    )
                })() : info.plan === "team" ? (
                    <div className="mt-5 pt-4 border-t border-[var(--color-border)]">
                        {/* Keyed on plan, not on the trial: a demo-first org
                            (D-192 #8) has neither trial nor subscription, and
                            keying on trialEndsAt sent its owner into the
                            "billed by invoice, email us" branch — a workspace
                            with literally no way to pay for itself. */}
                        {trialEndsAt ? (() => {
                            const days = Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400e3)
                            return (
                                <p className="text-sm text-[var(--color-text-secondary)]">
                                    {days > 0
                                        ? <>{t.tabs.billing.trialActive1} <strong className="text-[var(--color-text)]">{t.tabs.billing.trialDaysLeft(days)}</strong>{t.tabs.billing.trialActive2}</>
                                        : <>{t.tabs.billing.trialEnded1} <strong className="text-[var(--color-text)]">{t.tabs.billing.trialEnded2}</strong> {t.tabs.billing.trialEnded3}</>}
                                </p>
                            )
                        })() : (
                            <p className="text-sm text-[var(--color-text-secondary)]">
                                {t.tabs.billing.notActiveYet}
                            </p>
                        )}
                        <div className="flex flex-wrap items-center gap-3 mt-4">
                            <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden text-xs font-medium">
                                <button onClick={() => setInterval_("month")}
                                    className={`px-3.5 py-2 transition-colors ${interval_ === "month" ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent-deep)] font-semibold" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)]"}`}>
                                    {t.tabs.billing.monthly}
                                </button>
                                <button onClick={() => setInterval_("year")}
                                    className={`px-3.5 py-2 transition-colors border-l border-[var(--color-border)] ${interval_ === "year" ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent-deep)] font-semibold" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)]"}`}>
                                    {t.tabs.billing.annual}
                                </button>
                            </div>
                            <button className={BTN_PRIMARY} onClick={startCheckout} disabled={checkoutBusy || confirming}>
                                {confirming ? t.tabs.billing.confirmingPayment
                                 : checkoutBusy ? t.tabs.billing.openingCheckout
                                 : t.tabs.billing.startSubscription}
                            </button>
                            <span className="text-xs text-[var(--color-muted)]">
                                {t.tabs.billing.secureCheckout(info.seats_purchased)}
                            </span>
                        </div>
                    </div>
                ) : (
                    <div className="mt-5 pt-4 border-t border-[var(--color-border)]">
                        <p className="text-sm text-[var(--color-text-secondary)]">
                            {t.tabs.billing.invoiceBilled1}{" "}
                            <EmailLink email="alexis@talkpilot.co" subject="Seat change request" className="text-[var(--color-accent)] hover:underline">alexis@talkpilot.co</EmailLink>
                            {" "}{t.tabs.billing.invoiceBilled2}
                        </p>
                    </div>
                )}
            </div>

            {/* Subscription */}
            {info.has_stripe && info.stripe && (
                <div className={CARD}>
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h3 className="text-sm font-semibold text-[var(--color-text)]">{t.tabs.billing.subscription}</h3>
                            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                                {t.tabs.billing.status} <span className="capitalize">{t.data.statuses[info.stripe.status] ?? info.stripe.status}</span>
                                {renewal && <> {t.tabs.billing.renews(renewal)}</>}
                                {info.stripe.cancel_at_period_end && <> · <span className="text-red-600">{t.tabs.billing.cancelsAtEnd}</span></>}
                            </p>
                        </div>
                        <button className={BTN_GHOST} onClick={openPortal} disabled={portalBusy}>
                            {portalBusy ? t.tabs.billing.opening : t.tabs.billing.manageBilling}
                        </button>
                    </div>
                    <p className="text-xs text-[var(--color-muted)] mt-3">
                        {t.tabs.billing.portalNote}
                    </p>
                </div>
            )}

            {msg && <p className={`text-sm ${isErr ? "text-red-600" : "text-emerald-600"}`}>{msg}</p>}
        </div>
    )
}

// ─── Main page ────────────────────────────────────────────────────────────────

