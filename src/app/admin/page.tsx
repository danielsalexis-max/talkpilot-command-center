"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { STOCK_PRACTICE_SCENARIOS } from "@/lib/stockPracticeScenarios"

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrgInfo {
    id: string; name: string; slug: string; plan: string
    visibility: string; seats_purchased: number
    voice_profile: { tone?: string; values?: string; self_reference?: string; banned_phrases?: string[]; required_phrases?: string[] }
}
interface KbRow    { id: string; title: string; kind: string; status: string; summary: string | null; created_at: string }
interface ObjRow   { id: string; objection: string; response_guidance: string | null; severity: string; active: boolean; variants: string[] | null }
interface PbStage  { name: string; description: string; required_items: string[]; guardrail_rules: Array<{type: string; keyword: string; action: string}> }
interface PbRow    { id: string; name: string; methodology: string | null; status: string; version: number; stages: PbStage[]; created_at: string }
interface MemberRow { user_id: string; email: string | null; role: string; status: string; joined_at: string }
interface InviteRow { id: string; email: string; role: string; accepted_at: string | null; expires_at: string }
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

type AdminTab = "settings" | "knowledge" | "objections" | "playbooks" | "practice" | "members" | "dna"
type DNAStep = "collect" | "analyzing" | "review"
type DNAReviewTab = "tone" | "phrases" | "objections" | "flow"

interface TranscriptEntry {
    id: string
    text: string
    expertSpeaker: string
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

const INPUT = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
const TEXTAREA = INPUT + " resize-none"
const BTN_PRIMARY = "px-4 py-2 bg-[var(--color-accent)] hover:bg-[var(--color-accent-light)] disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
const BTN_GHOST = "px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900 border border-[var(--color-border)] hover:border-gray-400 rounded-lg transition-colors disabled:opacity-40"
const BTN_DANGER = "px-3 py-1.5 text-xs text-red-600 hover:text-red-700 border border-red-200 hover:border-red-300 rounded-lg transition-colors disabled:opacity-40"
const CARD = "bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm"
const ROW = "flex items-center justify-between bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] px-4 py-3 gap-4 shadow-sm"

function StatusBadge({ label, color }: { label: string; color: "green" | "yellow" | "red" | "slate" | "indigo" }) {
    const colors = {
        green:  "border-emerald-200 text-emerald-700 bg-emerald-50",
        yellow: "border-amber-200 text-amber-700 bg-amber-50",
        red:    "border-red-200 text-red-700 bg-red-50",
        slate:  "border-gray-200 text-gray-600 bg-gray-50",
        indigo: "border-indigo-200 text-indigo-700 bg-indigo-50",
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
            <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
            {action}
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
    return (
        <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={loading}
            className="w-full border-2 border-dashed border-[var(--color-accent)] rounded-xl p-8 flex flex-col items-center gap-3 bg-indigo-50/50 hover:bg-indigo-50 transition-colors disabled:opacity-60 disabled:cursor-wait group"
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
                    {loading ? "Analyzing with AI…" : title}
                </p>
                <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
            </div>
            {!loading && (
                <span className="text-xs text-[var(--color-accent)] border border-[var(--color-accent)] rounded-lg px-3 py-1.5 font-medium">
                    Choose file
                </span>
            )}
        </button>
    )
}

function errStr(e: unknown): string {
    if (!e) return ""
    if (typeof e === "string") return e
    if (typeof e === "object" && "message" in (e as Record<string, unknown>)) return String((e as Record<string, unknown>).message)
    return JSON.stringify(e)
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

const TONE_PRESETS = [
    "Consultative", "Empathetic", "Direct", "Data-driven", "Challenger",
    "Friendly", "Authoritative", "Confident", "Assertive", "Collaborative",
    "Professional", "Warm", "Analytical", "Strategic", "Persuasive",
    "Educational", "Casual", "Concise", "Transparent", "Energetic",
]

function SettingsTab({ org, onSaved }: { org: OrgInfo; onSaved: () => void }) {
    const existingTone = org.voice_profile?.tone ?? ""
    const matchedChips = TONE_PRESETS.filter(p => existingTone.toLowerCase().includes(p.toLowerCase()))
    const customRemainder = TONE_PRESETS.reduce(
        (acc, p) => acc.replace(new RegExp(p + ",?\\s*", "gi"), ""),
        existingTone
    ).trim().replace(/^,+|,+$/g, "").trim()

    const [name, setName]                 = useState(org.name)
    const [visibility, setVisibility]     = useState(org.visibility)
    const [toneChips, setToneChips]       = useState<string[]>(matchedChips)
    const [toneCustom, setToneCustom]     = useState(customRemainder)
    const [values, setValues]             = useState(org.voice_profile?.values ?? "")
    const [selfRef, setSelfRef]           = useState(org.voice_profile?.self_reference ?? "")
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
            name, visibility,
            voice_profile: { tone: toneParts.join(", "), values, self_reference: selfRef, banned_phrases: banned, required_phrases: required },
        }).eq("id", org.id)
        setSaving(false)
        if (error) { setMsg(error.message); setIsErr(true) }
        else { setMsg("Saved."); setIsErr(false); onSaved() }
    }

    return (
        <div className="space-y-6 max-w-2xl">
            <div className={CARD + " space-y-4"}>
                <h3 className="text-sm font-semibold text-gray-900">Organization</h3>
                <div className="space-y-1">
                    <label className="text-xs text-gray-500 font-medium">Name</label>
                    <input className={INPUT} value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-gray-500 font-medium">Transcript visibility for managers</label>
                    <select className={INPUT} value={visibility} onChange={e => setVisibility(e.target.value)}>
                        <option value="scores_only">Scores only — no transcript access</option>
                        <option value="flagged_moments">Flagged moments — highlights only</option>
                        <option value="full_transcripts">Full transcripts — unrestricted</option>
                    </select>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500 bg-[var(--color-bg)] rounded-lg px-3 py-2">
                    <span>Plan: <span className="text-gray-900 font-medium capitalize">{org.plan}</span></span>
                    <span>·</span>
                    <span>Seats: <span className="text-gray-900 font-medium">{org.seats_purchased}</span></span>
                    <span>·</span>
                    <span>Slug: <span className="text-gray-900 font-medium">{org.slug}</span></span>
                </div>
            </div>

            <div className={CARD + " space-y-5"}>
                <div>
                    <h3 className="text-sm font-semibold text-gray-900">Company Voice & Culture</h3>
                    <p className="text-xs text-gray-500 mt-1">Injected into every rep&apos;s AI coaching prompts to enforce your brand identity.</p>
                </div>

                {/* Tone of voice */}
                <div className="space-y-2">
                    <label className="text-xs text-gray-500 font-medium">Tone of voice</label>
                    <div className="flex flex-wrap gap-2">
                        {TONE_PRESETS.map(chip => (
                            <button key={chip} type="button" onClick={() => toggleChip(chip)}
                                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                                    toneChips.includes(chip)
                                        ? "bg-[var(--color-accent)] border-[var(--color-accent)] text-white"
                                        : "bg-[var(--color-bg)] border-[var(--color-border)] text-gray-600 hover:border-gray-400"
                                }`}
                            >{chip}</button>
                        ))}
                    </div>
                    <input className={INPUT} placeholder="Add custom tone descriptor…"
                        value={toneCustom} onChange={e => setToneCustom(e.target.value)} />
                </div>

                <div className="space-y-1">
                    <label className="text-xs text-gray-500 font-medium">Company values</label>
                    <textarea className={TEXTAREA} rows={2} placeholder="e.g. We believe sales is about solving problems, not closing deals."
                        value={values} onChange={e => setValues(e.target.value)} />
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-gray-500 font-medium">Self-reference (how reps should name the company)</label>
                    <input className={INPUT} placeholder='"TalkPilot" — not "we" or "the company"'
                        value={selfRef} onChange={e => setSelfRef(e.target.value)} />
                </div>

                {/* Phrases */}
                <div className="grid grid-cols-2 gap-4">
                    {/* Banned */}
                    <div className="space-y-2">
                        <label className="text-xs text-gray-500 font-medium">Banned phrases</label>
                        <div className="space-y-1.5 min-h-[2rem]">
                            {banned.map((p, i) => (
                                <div key={i} className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5">
                                    <span className="text-xs text-red-700 flex-1 truncate">{p}</span>
                                    <button type="button" onClick={() => setBanned(banned.filter((_, j) => j !== i))}
                                        className="text-red-400 hover:text-red-600 flex-shrink-0 leading-none">×</button>
                                </div>
                            ))}
                            {banned.length === 0 && <p className="text-xs text-gray-400">No banned phrases yet.</p>}
                        </div>
                        <div className="flex gap-2">
                            <input
                                className="flex-1 min-w-0 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                                placeholder="e.g. cheap, sorry to bother"
                                value={bannedInput}
                                onChange={e => setBannedInput(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addPhrase(banned, setBanned, bannedInput, setBannedInput) } }}
                            />
                            <button type="button" className={BTN_GHOST} onClick={() => addPhrase(banned, setBanned, bannedInput, setBannedInput)}>Add</button>
                        </div>
                    </div>
                    {/* Required */}
                    <div className="space-y-2">
                        <label className="text-xs text-gray-500 font-medium">Required language</label>
                        <div className="space-y-1.5 min-h-[2rem]">
                            {required.map((p, i) => (
                                <div key={i} className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-1.5">
                                    <span className="text-xs text-emerald-700 flex-1 truncate">{p}</span>
                                    <button type="button" onClick={() => setRequired(required.filter((_, j) => j !== i))}
                                        className="text-emerald-400 hover:text-emerald-600 flex-shrink-0 leading-none">×</button>
                                </div>
                            ))}
                            {required.length === 0 && <p className="text-xs text-gray-400">No required phrases yet.</p>}
                        </div>
                        <div className="flex gap-2">
                            <input
                                className="flex-1 min-w-0 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                                placeholder="e.g. ROI, success team"
                                value={requiredInput}
                                onChange={e => setRequiredInput(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addPhrase(required, setRequired, requiredInput, setRequiredInput) } }}
                            />
                            <button type="button" className={BTN_GHOST} onClick={() => addPhrase(required, setRequired, requiredInput, setRequiredInput)}>Add</button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-3">
                <button className={BTN_PRIMARY} onClick={save} disabled={saving}>
                    {saving ? "Saving…" : "Save settings"}
                </button>
                <Msg msg={msg} error={isErr} />
            </div>
        </div>
    )
}

// ─── Knowledge Tab ────────────────────────────────────────────────────────────

function KnowledgeTab({ orgId }: { orgId: string }) {
    const [docs, setDocs]           = useState<KbRow[]>([])
    const [loading, setLoading]     = useState(true)
    const [title, setTitle]         = useState("")
    const [kind, setKind]           = useState("product")
    const [content, setContent]     = useState("")
    const [uploading, setUploading] = useState(false)
    const [msg, setMsg]             = useState<string | null>(null)
    const [isErr, setIsErr]         = useState(false)
    const fileRef = useRef<HTMLInputElement>(null)

    const load = useCallback(async () => {
        const { data } = await supabase.from("org_knowledge")
            .select("id, title, kind, status, summary, created_at")
            .eq("org_id", orgId).order("created_at", { ascending: false })
        setDocs((data ?? []) as KbRow[])
        setLoading(false)
    }, [orgId])

    useEffect(() => { load() }, [load])

    function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""))
        const reader = new FileReader()
        reader.onload = () => setContent(reader.result as string)
        reader.readAsText(file)
        e.target.value = ""
    }

    async function upload() {
        if (!title.trim() || !content.trim()) return
        setUploading(true); setMsg(null)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ingest-knowledge`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ org_id: orgId, title: title.trim(), kind, content: content.trim() }),
            })
            if (res.ok) {
                setMsg("Document uploaded and processing."); setIsErr(false)
                setTitle(""); setContent(""); setKind("product")
                await load()
            } else {
                const e = await res.json().catch(() => ({}))
                setMsg(`Error: ${errStr(e.error) || res.statusText}`); setIsErr(true)
            }
        } finally {
            setUploading(false)
        }
    }

    async function deleteDoc(id: string) {
        await supabase.from("org_knowledge").delete().eq("id", id)
        setDocs(prev => prev.filter(d => d.id !== id))
    }

    const kindColor = (k: string): "indigo"|"green"|"yellow"|"slate" => {
        const m: Record<string, "indigo"|"green"|"yellow"|"slate"> = {
            product: "indigo", case_study: "green", competitive: "yellow",
            methodology: "indigo", objection_playbook: "slate", other: "slate"
        }
        return m[k] ?? "slate"
    }

    return (
        <div className="space-y-6">
            {/* Upload zone — primary action */}
            <UploadZone
                fileRef={fileRef}
                onChange={handleFile}
                loading={false}
                accept=".txt,.md,.csv,.json"
                title="Upload a document"
                subtitle="Drop your pricing sheets, case studies, product docs, or battle cards. We'll read the file and let you review before saving."
            />

            <div className={CARD + " space-y-4"}>
                <div>
                    <h3 className="text-sm font-semibold text-gray-900">
                        {content ? "Review & save" : "Or add manually"}
                    </h3>
                    {content && <p className="text-xs text-emerald-600 mt-0.5">File loaded — fill in the title and type, then save.</p>}
                </div>
                <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2 space-y-1">
                        <label className="text-xs text-gray-500 font-medium">Title</label>
                        <input className={INPUT} placeholder="Q3 Pricing Sheet" value={title} onChange={e => setTitle(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-gray-500 font-medium">Type</label>
                        <select className={INPUT} value={kind} onChange={e => setKind(e.target.value)}>
                            <option value="product">Product</option>
                            <option value="case_study">Case study</option>
                            <option value="competitive">Competitive intel</option>
                            <option value="methodology">Methodology</option>
                            <option value="objection_playbook">Objection playbook</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-gray-500 font-medium">Content</label>
                    <textarea className={TEXTAREA} rows={8} placeholder="Paste text here, or upload a file above…"
                        value={content} onChange={e => setContent(e.target.value)} />
                </div>
                <div className="flex items-center gap-3">
                    <button className={BTN_PRIMARY} onClick={upload} disabled={uploading || !title.trim() || !content.trim()}>
                        {uploading ? "Uploading…" : "Save document"}
                    </button>
                    <Msg msg={msg} error={isErr} />
                </div>
            </div>

            <div>
                <SectionHeader title={`Knowledge base (${docs.length})`} />
                {loading && <p className="text-sm text-gray-500">Loading…</p>}
                <div className="space-y-2">
                    {docs.map(d => (
                        <div key={d.id} className={ROW}>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm text-gray-900 font-medium">{d.title}</p>
                                {d.summary && <p className="text-xs text-gray-500 mt-0.5 truncate">{d.summary}</p>}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <StatusBadge label={d.kind.replace("_"," ")} color={kindColor(d.kind)} />
                                <StatusBadge label={d.status} color={d.status === "ready" ? "green" : d.status === "error" ? "red" : "yellow"} />
                                <button className={BTN_DANGER} onClick={() => deleteDoc(d.id)}>Delete</button>
                            </div>
                        </div>
                    ))}
                    {!loading && docs.length === 0 && <p className="text-sm text-gray-500">No documents yet. Upload your first one above.</p>}
                </div>
            </div>
        </div>
    )
}

// ─── Objections Tab ───────────────────────────────────────────────────────────

function ObjectionsTab({ orgId }: { orgId: string }) {
    const [objs, setObjs]                     = useState<ObjRow[]>([])
    const [loading, setLoading]               = useState(true)
    const [objText, setObjText]               = useState("")
    const [guidance, setGuidance]             = useState("")
    const [severity, setSeverity]             = useState("medium")
    const [variants, setVariants]             = useState("")
    const [saving, setSaving]                 = useState(false)
    const [msg, setMsg]                       = useState<string | null>(null)
    const [isErr, setIsErr]                   = useState(false)
    const [suggestingVariants, setSuggestingVariants] = useState(false)
    // Extraction
    const [extracting, setExtracting]         = useState(false)
    const [extracted, setExtracted]           = useState<ExtractedObjection[]>([])
    const [selected, setSelected]             = useState<Set<number>>(new Set())
    const [importing, setImporting]           = useState(false)
    const [extractMsg, setExtractMsg]         = useState<string | null>(null)
    const extractFileRef = useRef<HTMLInputElement>(null)

    const load = useCallback(async () => {
        const { data } = await supabase.from("org_objections")
            .select("id, objection, response_guidance, severity, active, variants")
            .eq("org_id", orgId).order("severity")
        setObjs((data ?? []) as ObjRow[])
        setLoading(false)
    }, [orgId])

    useEffect(() => { load() }, [load])

    async function handleExtractFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        e.target.value = ""
        setExtracting(true); setExtractMsg(null); setExtracted([]); setSelected(new Set())
        const text = await file.text()
        try {
            const { data: { session } } = await supabase.auth.getSession()
            const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/extract-content`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ text, type: "objections" }),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) { setExtractMsg(`Error: ${errStr(json.error) || res.statusText}`); return }
            const items: ExtractedObjection[] = json.objections ?? []
            setExtracted(items)
            setSelected(new Set(items.map((_, i) => i)))
            setExtractMsg(items.length > 0 ? `Found ${items.length} objections — review and import below.` : "No objections found in document.")
        } catch (e) {
            setExtractMsg(`Error: ${errStr(e)}`)
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
            severity: o.severity || "medium",
            variants: o.variants ?? [],
            active: true,
        }))
        const { error } = await supabase.from("org_objections").insert(rows)
        setImporting(false)
        if (error) { setExtractMsg(`Import error: ${error.message}`); return }
        setExtracted([]); setSelected(new Set())
        setExtractMsg(`Imported ${toImport.length} objections.`)
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
        const { error } = await supabase.from("org_objections").insert({
            org_id: orgId,
            objection: objText.trim(),
            response_guidance: guidance.trim() || null,
            severity,
            variants: variants.split("\n").map(s => s.trim()).filter(Boolean),
            active: true,
        })
        setSaving(false)
        if (error) { setMsg(error.message); setIsErr(true) }
        else {
            setMsg("Objection added."); setIsErr(false)
            setObjText(""); setGuidance(""); setVariants(""); setSeverity("medium")
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
        ({ low: "green", medium: "yellow", high: "red", critical: "red" }[s] ?? "slate") as "green"|"yellow"|"red"|"slate"

    return (
        <div className="space-y-6">
            {/* AI document extraction */}
            <div className="space-y-4">
                <UploadZone
                    fileRef={extractFileRef}
                    onChange={handleExtractFile}
                    loading={extracting}
                    accept=".txt,.md,.csv,.pdf"
                    title="Import objections from a document"
                    subtitle="Upload any sales playbook, objection guide, or battle card. AI will extract every objection and let you pick which ones to import."
                />
                {extractMsg && (
                    <p className={`text-sm text-center ${extracted.length > 0 ? "text-emerald-600" : extractMsg.startsWith("Error") ? "text-red-600" : "text-gray-500"}`}>{extractMsg}</p>
                )}
            </div>
            {extracted.length > 0 && (
                <div className={CARD + " space-y-3"}>
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-gray-900">Review extracted objections</p>
                        <div className="flex gap-2">
                            <button className={BTN_GHOST} onClick={() => setSelected(new Set(extracted.map((_, i) => i)))}>Select all</button>
                            <button className={BTN_GHOST} onClick={() => setSelected(new Set())}>None</button>
                            <button className={BTN_PRIMARY} onClick={importSelected} disabled={importing || selected.size === 0}>
                                {importing ? "Importing…" : `Import ${selected.size}`}
                            </button>
                        </div>
                    </div>
                    <div className="space-y-2">
                        {extracted.map((o, i) => (
                            <label key={i} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selected.has(i) ? "border-[var(--color-accent)] bg-indigo-50" : "border-[var(--color-border)] bg-[var(--color-bg)]"}`}>
                                <input type="checkbox" checked={selected.has(i)}
                                    onChange={() => setSelected(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })}
                                    className="mt-0.5 accent-[var(--color-accent)]" />
                                <div className="min-w-0">
                                    <p className="text-sm text-gray-900 font-medium">{o.objection}</p>
                                    {o.response_guidance && <p className="text-xs text-gray-600 mt-0.5">{o.response_guidance}</p>}
                                    <div className="flex items-center gap-2 mt-1">
                                        <StatusBadge label={o.severity || "medium"} color={sevColor(o.severity || "medium")} />
                                        {o.variants?.length > 0 && <span className="text-xs text-gray-400">+{o.variants.length} variants</span>}
                                    </div>
                                </div>
                            </label>
                        ))}
                    </div>
                </div>
            )}

            {/* Manual add */}
            <div className={CARD + " space-y-4"}>
                <div>
                    <h3 className="text-sm font-semibold text-gray-900">Add objection manually</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                        AI matches by <span className="font-medium text-gray-700">meaning, not exact words</span> — write it naturally, the way a prospect usually raises it.
                    </p>
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-gray-500 font-medium">The objection</label>
                    <input className={INPUT} placeholder="This is too expensive for our budget right now"
                        value={objText} onChange={e => setObjText(e.target.value)} />
                    <p className="text-xs text-gray-400">No quotes needed — any phrasing that means the same thing will be detected automatically.</p>
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-gray-500 font-medium">Ideal response guidance</label>
                    <textarea className={TEXTAREA} rows={3} placeholder="Acknowledge the concern, pivot to ROI. Ask: what would achieving X be worth to you?"
                        value={guidance} onChange={e => setGuidance(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-xs text-gray-500 font-medium">Severity</label>
                        <select className={INPUT} value={severity} onChange={e => setSeverity(e.target.value)}>
                            <option value="low">Low — minor friction</option>
                            <option value="medium">Medium — common objection</option>
                            <option value="high">High — deal-threatening</option>
                            <option value="critical">Critical — must handle perfectly</option>
                        </select>
                    </div>
                    <div className="space-y-1">
                        <div className="flex items-center justify-between">
                            <label className="text-xs text-gray-500 font-medium">Variants <span className="text-gray-400 font-normal">(optional)</span></label>
                            <button type="button" className={BTN_GHOST} onClick={suggestVariants}
                                disabled={suggestingVariants || !objText.trim()}>
                                {suggestingVariants ? "Generating…" : "✦ AI suggest"}
                            </button>
                        </div>
                        <textarea className={TEXTAREA} rows={3}
                            placeholder={"It's too pricey\nWe don't have budget\nCan you do it cheaper?"}
                            value={variants} onChange={e => setVariants(e.target.value)} />
                        <p className="text-xs text-gray-400">AI matches by meaning — variants only help for very unusual phrasings.</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button className={BTN_PRIMARY} onClick={addObjection} disabled={saving || !objText.trim()}>
                        {saving ? "Adding…" : "Add objection"}
                    </button>
                    <Msg msg={msg} error={isErr} />
                </div>
            </div>

            <div>
                <SectionHeader title={`Objection library (${objs.length})`} />
                {loading && <p className="text-sm text-gray-500">Loading…</p>}
                <div className="space-y-2">
                    {objs.map(o => (
                        <div key={o.id} className={ROW + " items-start"}>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <p className="text-sm text-gray-900 font-medium">{o.objection}</p>
                                    {!o.active && <StatusBadge label="disabled" color="slate" />}
                                </div>
                                {o.response_guidance && <p className="text-xs text-gray-600 mt-1">{o.response_guidance}</p>}
                                {o.variants && o.variants.length > 0 && (
                                    <p className="text-xs text-gray-400 mt-0.5">+{o.variants.length} variant{o.variants.length !== 1 ? "s" : ""}</p>
                                )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
                                <StatusBadge label={o.severity} color={sevColor(o.severity)} />
                                <button className={BTN_GHOST} onClick={() => toggle(o)}>{o.active ? "Disable" : "Enable"}</button>
                                <button className={BTN_DANGER} onClick={() => deleteObj(o.id)}>Delete</button>
                            </div>
                        </div>
                    ))}
                    {!loading && objs.length === 0 && <p className="text-sm text-gray-500">No objections yet.</p>}
                </div>
            </div>
        </div>
    )
}

// ─── Playbooks Tab ────────────────────────────────────────────────────────────

function PlaybooksTab({ orgId }: { orgId: string }) {
    const [playbooks, setPlaybooks]     = useState<PbRow[]>([])
    const [loading, setLoading]         = useState(true)
    const [creating, setCreating]       = useState(false)
    const [pbName, setPbName]           = useState("")
    const [methodology, setMethodology] = useState("custom")
    const [stages, setStages]           = useState<StageForm[]>([{ name: "", description: "", requiredItems: "", guardrails: [] }])
    const [saving, setSaving]           = useState(false)
    const [msg, setMsg]                 = useState<string | null>(null)
    const [isErr, setIsErr]             = useState(false)
    const [extracting, setExtracting]   = useState(false)
    const [extractMsg, setExtractMsg]   = useState<string | null>(null)
    const extractFileRef = useRef<HTMLInputElement>(null)

    const load = useCallback(async () => {
        const { data } = await supabase.from("org_playbooks")
            .select("id, name, methodology, status, version, stages, created_at")
            .eq("org_id", orgId).order("created_at", { ascending: false })
        setPlaybooks((data ?? []) as PbRow[])
        setLoading(false)
    }, [orgId])

    useEffect(() => { load() }, [load])

    async function handleExtractFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        e.target.value = ""
        setExtracting(true); setExtractMsg(null)
        const text = await file.text()
        try {
            const { data: { session } } = await supabase.auth.getSession()
            const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/extract-content`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ text, type: "playbook" }),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) { setExtractMsg(`Error: ${errStr(json.error) || res.statusText}`); return }
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
            setExtractMsg(`Extracted ${json.stages?.length ?? 0} stages — review and save below.`)
        } catch (e) {
            setExtractMsg(`Error: ${errStr(e)}`)
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

    async function savePlaybook() {
        if (!pbName.trim() || stages.some(s => !s.name.trim())) return
        setSaving(true); setMsg(null)
        const stagesJson: PbStage[] = stages.map(s => ({
            name: s.name.trim(),
            description: s.description.trim(),
            required_items: s.requiredItems.split("\n").map(x => x.trim()).filter(Boolean),
            guardrail_rules: s.guardrails.filter(g => g.keyword.trim()).map(g => ({
                type: "forbidden_phrase", keyword: g.keyword.trim(), action: g.action
            }))
        }))
        const { error } = await supabase.from("org_playbooks").insert({
            org_id: orgId, name: pbName.trim(), methodology, stages: stagesJson, status: "draft", version: 1
        })
        setSaving(false)
        if (error) { setMsg(error.message); setIsErr(true) }
        else {
            setMsg("Playbook created."); setIsErr(false)
            setPbName(""); setMethodology("custom"); setStages([{ name: "", description: "", requiredItems: "", guardrails: [] }])
            setCreating(false); setExtractMsg(null); await load()
        }
    }

    async function setStatus(id: string, status: "draft" | "active" | "archived") {
        if (status === "active") {
            await supabase.from("org_playbooks").update({ status: "draft" }).eq("org_id", orgId)
        }
        await supabase.from("org_playbooks").update({ status }).eq("id", id)
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
                        <h3 className="text-sm font-semibold text-gray-900">Playbooks</h3>
                        <p className="text-xs text-gray-500 mt-0.5">The active playbook guides reps in real-time and is scored against after each call.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <input ref={extractFileRef} type="file" accept=".txt,.md,.csv,.pdf" className="hidden" onChange={handleExtractFile} />
                        <button className={BTN_GHOST} onClick={() => extractFileRef.current?.click()} disabled={extracting}>
                            {extracting ? "Extracting…" : "Import from doc"}
                        </button>
                        <button className={BTN_PRIMARY} onClick={() => setCreating(!creating)}>
                            {creating ? "Cancel" : "+ New playbook"}
                        </button>
                    </div>
                </div>

                {extractMsg && (
                    <p className={`mt-3 text-xs ${extractMsg.startsWith("Error") ? "text-red-600" : "text-emerald-600"}`}>{extractMsg}</p>
                )}

                {creating && (
                    <div className="mt-5 space-y-5 pt-5 border-t border-[var(--color-border)]">
                        <div className="grid grid-cols-3 gap-3">
                            <div className="col-span-2 space-y-1">
                                <label className="text-xs text-gray-500 font-medium">Playbook name</label>
                                <input className={INPUT} placeholder="Enterprise SaaS Sales Flow" value={pbName} onChange={e => setPbName(e.target.value)} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-gray-500 font-medium">Methodology</label>
                                <select className={INPUT} value={methodology} onChange={e => setMethodology(e.target.value)}>
                                    <option value="custom">Custom</option>
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
                                <p className="text-xs font-medium text-gray-600">Stages ({stages.length})</p>
                                <button className={BTN_GHOST} onClick={addStage}>+ Add stage</button>
                            </div>

                            {stages.map((stage, si) => (
                                <div key={si} className="bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)] p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-[var(--color-accent)]">Stage {si + 1}</span>
                                        {stages.length > 1 && <button className={BTN_DANGER} onClick={() => removeStage(si)}>Remove</button>}
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-xs text-gray-500 font-medium">Stage name</label>
                                            <input className={INPUT} placeholder="Discovery" value={stage.name} onChange={e => updateStage(si, { name: e.target.value })} />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs text-gray-500 font-medium">Description</label>
                                            <input className={INPUT} placeholder="Understand the prospect's pain points" value={stage.description} onChange={e => updateStage(si, { description: e.target.value })} />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs text-gray-500 font-medium">Required items (one per line — rep must cover all of these)</label>
                                        <textarea className={TEXTAREA} rows={3} placeholder={"Ask about current solution\nIdentify main pain point\nUnderstand timeline"}
                                            value={stage.requiredItems} onChange={e => updateStage(si, { requiredItems: e.target.value })} />
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs text-gray-500 font-medium">Guardrails (forbidden words/phrases)</label>
                                            <button className={BTN_GHOST} onClick={() => addGuardrail(si)}>+ Add rule</button>
                                        </div>
                                        {stage.guardrails.map((g, gi) => (
                                            <div key={gi} className="flex gap-2 items-center">
                                                <input className={INPUT} placeholder='e.g. "contract"' value={g.keyword} onChange={e => updateGuardrail(si, gi, { keyword: e.target.value })} />
                                                <select className="w-32 flex-shrink-0 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                                                    value={g.action} onChange={e => updateGuardrail(si, gi, { action: e.target.value })}>
                                                    <option value="warn">Warn</option>
                                                    <option value="flag">Flag</option>
                                                    <option value="escalate">Escalate</option>
                                                </select>
                                                <button className="text-gray-400 hover:text-red-600 flex-shrink-0 transition-colors" onClick={() => removeGuardrail(si, gi)}>×</button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex items-center gap-3">
                            <button className={BTN_PRIMARY} onClick={savePlaybook} disabled={saving || !pbName.trim()}>
                                {saving ? "Creating…" : "Create playbook"}
                            </button>
                            <Msg msg={msg} error={isErr} />
                        </div>
                    </div>
                )}
            </div>

            {loading && <p className="text-sm text-gray-500">Loading…</p>}
            <div className="space-y-3">
                {playbooks.map(p => (
                    <div key={p.id} className={CARD}>
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="flex items-center gap-2">
                                    <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                                    <StatusBadge label={p.status} color={p.status === "active" ? "green" : p.status === "draft" ? "yellow" : "slate"} />
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    {p.methodology ?? "Custom"} · {p.stages?.length ?? 0} stages · v{p.version}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {p.status !== "active"   && <button className={BTN_GHOST} onClick={() => setStatus(p.id, "active")}>Activate</button>}
                                {p.status === "active"   && <button className={BTN_GHOST} onClick={() => setStatus(p.id, "draft")}>Deactivate</button>}
                                {p.status !== "archived" && <button className={BTN_GHOST} onClick={() => setStatus(p.id, "archived")}>Archive</button>}
                                <button className={BTN_DANGER} onClick={() => deletePlaybook(p.id)}>Delete</button>
                            </div>
                        </div>
                        {p.stages && p.stages.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                                {p.stages.map((s, i) => (
                                    <span key={i} className="text-xs bg-[var(--color-bg)] border border-[var(--color-border)] px-2 py-0.5 rounded text-gray-600">
                                        {i + 1}. {s.name}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
                {!loading && playbooks.length === 0 && !creating && (
                    <p className="text-sm text-gray-500">No playbooks yet. Create one above or import from a document.</p>
                )}
            </div>
        </div>
    )
}

// ─── Members Tab ──────────────────────────────────────────────────────────────

interface Readiness { activePlaybooks: number; objections: number; knowledge: number }

function PracticeTab({ orgId }: { orgId: string }) {
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
        if (!assigneeId) { setMsg("Pick a rep or a team."); setIsErr(true); return }
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
        if (error) { setMsg(`Error: ${error.message}`); setIsErr(true) }
        else {
            setMsg(`Assigned "${scenario.title}".`); setIsErr(false)
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
            return m?.email ?? "A rep"
        }
        if (a.assignee_team_id) {
            const t = teams.find(t => t.id === a.assignee_team_id)
            return t ? `Team: ${t.name}` : "A team"
        }
        return "—"
    }

    if (loading) return <div className="text-gray-500 text-sm">Loading…</div>

    return (
        <div className="space-y-6">
            <div className={CARD}>
                <h3 className="text-sm font-semibold text-gray-900">Assign a practice</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                    The rep runs it against an AI character in the TalkPilot app and gets a graded scorecard — the grade rolls up here automatically.
                </p>

                <div className="mt-5 space-y-4">
                    <div className="space-y-1">
                        <label className="text-xs text-gray-500 font-medium">Scenario</label>
                        <select className={INPUT} value={scenarioId} onChange={e => setScenarioId(e.target.value)}>
                            {STOCK_PRACTICE_SCENARIOS.map(s => (
                                <option key={s.id} value={s.id}>{s.title} · {s.category} · {s.difficulty}</option>
                            ))}
                        </select>
                        <p className="text-xs text-gray-400 mt-1">
                            {STOCK_PRACTICE_SCENARIOS.find(s => s.id === scenarioId)?.objective}
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-xs text-gray-500 font-medium">Assign to</label>
                            <select className={INPUT} value={assigneeKind}
                                onChange={e => { setAssigneeKind(e.target.value as "member" | "team"); setAssigneeId("") }}>
                                <option value="member">A person</option>
                                <option value="team">A team</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-gray-500 font-medium">
                                {assigneeKind === "member" ? "Rep" : "Team"}
                            </label>
                            <select className={INPUT} value={assigneeId} onChange={e => setAssigneeId(e.target.value)}>
                                <option value="">Select…</option>
                                {assigneeKind === "member"
                                    ? members.map(m => <option key={m.user_id} value={m.user_id}>{m.email ?? m.user_id}</option>)
                                    : teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)
                                }
                            </select>
                            {assigneeKind === "team" && teams.length === 0 && (
                                <p className="text-xs text-gray-400 mt-1">No teams yet — assign to a person instead.</p>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-xs text-gray-500 font-medium">Coach&apos;s note (optional)</label>
                            <input className={INPUT} placeholder="Focus on holding price, not discounting" value={note} onChange={e => setNote(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-gray-500 font-medium">Due date (optional)</label>
                            <input type="date" className={INPUT} value={dueDate} onChange={e => setDueDate(e.target.value)} />
                        </div>
                    </div>

                    {msg && <p className={`text-xs ${isErr ? "text-red-600" : "text-emerald-600"}`}>{msg}</p>}

                    <div className="flex justify-end">
                        <button className={BTN_PRIMARY} onClick={assign} disabled={assigning || !assigneeId}>
                            {assigning ? "Assigning…" : "Assign"}
                        </button>
                    </div>
                </div>
            </div>

            <div className={CARD}>
                <h3 className="text-sm font-semibold text-gray-900">Recent assignments</h3>
                {assignments.length === 0 ? (
                    <p className="text-xs text-gray-500 mt-2">No practices assigned yet.</p>
                ) : (
                    <div className="mt-3 space-y-2">
                        {assignments.map(a => (
                            <div key={a.id} className={ROW}>
                                <div className="min-w-0">
                                    <p className="text-sm text-gray-900 truncate">{a.title}</p>
                                    <p className="text-xs text-gray-500">
                                        {assigneeLabel(a)}
                                        {a.due_at && ` · Due ${new Date(a.due_at).toLocaleDateString()}`}
                                        {a.note && ` · "${a.note}"`}
                                    </p>
                                </div>
                                <button className={BTN_GHOST + " flex-shrink-0"} onClick={() => unassign(a.id)}>Remove</button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

function MembersTab({ orgId, org, onNavigate }: { orgId: string; org: OrgInfo; onNavigate: (t: AdminTab) => void }) {
    const [members, setMembers]         = useState<MemberRow[]>([])
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
                .select("id, email, role, accepted_at, expires_at")
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
    const checks: { key: string; label: string; done: boolean; required: boolean; tab: AdminTab; hint: string }[] = [
        { key: "playbook",   label: "Activate a playbook",             done: (readiness?.activePlaybooks ?? 0) >= 1, required: true,  tab: "playbooks",  hint: "Reps are guided in real-time by the active playbook and scored against it." },
        { key: "objections", label: "Add at least 3 objections",       done: (readiness?.objections ?? 0) >= 3,      required: true,  tab: "objections", hint: "So the AI can coach reps through pushback the moment it happens." },
        { key: "voice",      label: "Configure company voice & tone",   done: voiceSet,                               required: false, tab: "settings",   hint: "Keeps every rep on-brand in live suggestions." },
        { key: "knowledge",  label: "Upload a knowledge document",      done: (readiness?.knowledge ?? 0) >= 1,       required: false, tab: "knowledge",  hint: "Grounds AI answers in your real product, pricing and case studies." },
    ]
    const requiredMet = checks.filter(c => c.required).every(c => c.done)

    useEffect(() => { load() }, [load])

    async function sendInvite() {
        if (!inviteEmail.trim()) return
        if (!requiredMet) {
            setMsg("Complete the required setup steps below before inviting reps."); setIsErr(true); return
        }
        setInviting(true); setMsg(null)
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/invite-member`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ org_id: orgId, email: inviteEmail.trim(), role: inviteRole }),
        })
        setInviting(false)
        if (res.ok) {
            setMsg("Invite sent."); setIsErr(false); setInviteEmail(""); await load()
        } else {
            const e = await res.json().catch(() => ({}))
            setMsg(`Error: ${errStr(e.error) || "Check RESEND_API_KEY secret."}`); setIsErr(true)
        }
    }

    async function changeRole(userId: string, role: string) {
        await supabase.from("org_members").update({ role }).eq("org_id", orgId).eq("user_id", userId)
        setMembers(prev => prev.map(m => m.user_id === userId ? { ...m, role } : m))
    }

    async function removeMember(userId: string) {
        await supabase.from("org_members").delete().eq("org_id", orgId).eq("user_id", userId)
        setMembers(prev => prev.filter(m => m.user_id !== userId))
    }

    const roleColor = (r: string): "indigo"|"yellow"|"slate" =>
        ({ owner: "indigo", admin: "indigo", manager: "yellow" }[r] ?? "slate") as "indigo"|"yellow"|"slate"

    const requiredChecks = checks.filter(c => c.required)
    const requiredDone   = requiredChecks.filter(c => c.done).length

    return (
        <div className="space-y-6">
            {/* Onboarding readiness — gates inviting until the org is set up */}
            <div className={CARD + " space-y-4"}>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900">Before you invite your team</h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                            Set up your coaching foundation first — reps get a broken experience if they sign in to an empty org.
                        </p>
                    </div>
                    {readiness && (
                        requiredMet
                            ? <StatusBadge label="Ready to invite" color="green" />
                            : <StatusBadge label={`${requiredDone}/${requiredChecks.length} required`} color="yellow" />
                    )}
                </div>
                <div className="space-y-2">
                    {checks.map(c => (
                        <div key={c.key} className="flex items-start gap-3">
                            <span className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                c.done ? "bg-emerald-500 text-white" : c.required ? "bg-amber-100 text-amber-600 border border-amber-300" : "bg-gray-100 text-gray-400 border border-gray-300"
                            }`}>
                                {c.done ? "✓" : ""}
                            </span>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <span className={`text-sm ${c.done ? "text-gray-400 line-through" : "text-gray-900 font-medium"}`}>{c.label}</span>
                                    {c.required
                                        ? <span className="text-[10px] uppercase tracking-wide text-amber-600 font-semibold">Required</span>
                                        : <span className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Recommended</span>}
                                </div>
                                {!c.done && <p className="text-xs text-gray-500 mt-0.5">{c.hint}</p>}
                            </div>
                            {!c.done && (
                                <button className={BTN_GHOST + " flex-shrink-0"} onClick={() => onNavigate(c.tab)}>Set up →</button>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <div className={CARD + " space-y-3"}>
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-900">Invite member</h3>
                    {!requiredMet && <span className="text-xs text-amber-600">🔒 Locked until required setup is complete</span>}
                </div>
                <div className="flex gap-2">
                    <input
                        type="email"
                        placeholder="colleague@company.com"
                        value={inviteEmail}
                        onChange={e => setInviteEmail(e.target.value)}
                        disabled={!requiredMet}
                        className="flex-1 min-w-0 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[var(--color-accent)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <select
                        value={inviteRole}
                        onChange={e => setInviteRole(e.target.value)}
                        disabled={!requiredMet}
                        className="w-32 flex-shrink-0 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[var(--color-accent)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <option value="member">Member</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
                    </select>
                    <button className={BTN_PRIMARY + " flex-shrink-0"} onClick={sendInvite} disabled={inviting || !inviteEmail.trim() || !requiredMet}>
                        {inviting ? "Sending…" : "Send invite"}
                    </button>
                </div>
                <Msg msg={msg} error={isErr} />
            </div>

            <div>
                <SectionHeader title={`Active members (${members.length})`} />
                {loading && <p className="text-sm text-gray-500">Loading…</p>}
                <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden shadow-sm">
                    {members.length === 0 && !loading && (
                        <div className="px-4 py-6 text-sm text-gray-500">No members yet.</div>
                    )}
                    {members.map((m, i) => (
                        <div key={m.user_id} className={`flex items-center justify-between px-4 py-3 gap-4 ${i < members.length - 1 ? "border-b border-[var(--color-border)]" : ""}`}>
                            <div>
                                <p className="text-sm text-gray-900 font-medium">{m.email ?? m.user_id.slice(0, 8) + "…"}</p>
                                <p className="text-xs text-gray-400">Joined {new Date(m.joined_at).toLocaleDateString()}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <StatusBadge label={m.role} color={roleColor(m.role)} />
                                <select
                                    value={m.role}
                                    onChange={e => changeRole(m.user_id, e.target.value)}
                                    className="w-24 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-gray-600 focus:outline-none focus:border-[var(--color-accent)]"
                                >
                                    <option value="member">Member</option>
                                    <option value="manager">Manager</option>
                                    <option value="admin">Admin</option>
                                    <option value="owner">Owner</option>
                                </select>
                                <button className={BTN_DANGER} onClick={() => removeMember(m.user_id)}>Remove</button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {invites.length > 0 && (
                <div>
                    <SectionHeader title="Invites" />
                    <div className="space-y-1.5">
                        {invites.map(inv => (
                            <div key={inv.id} className="flex items-center justify-between text-sm px-4 py-2.5 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] shadow-sm">
                                <span className="text-gray-700">{inv.email}</span>
                                <div className="flex items-center gap-3 text-xs">
                                    <span className="text-gray-500 capitalize">{inv.role}</span>
                                    {inv.accepted_at ? (
                                        <StatusBadge label="Accepted" color="green" />
                                    ) : new Date(inv.expires_at) < new Date() ? (
                                        <StatusBadge label="Expired" color="red" />
                                    ) : (
                                        <StatusBadge label="Pending" color="yellow" />
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

function detectSpeakers(text: string): string[] {
    const matches = new Set<string>()
    for (const line of text.split("\n")) {
        const m = line.match(/^([A-Za-z][A-Za-z0-9 _-]{0,30}):\s/)
        if (m) matches.add(m[1].trim())
    }
    return Array.from(matches).slice(0, 10)
}

function TranscriptCard({ index, entry, onChange, onRemove }: {
    index: number
    entry: TranscriptEntry
    onChange: (field: "text" | "expertSpeaker", val: string) => void
    onRemove?: () => void
}) {
    const fileRef = useRef<HTMLInputElement>(null)
    const [loadingFile, setLoadingFile] = useState(false)
    const [fileError, setFileError]     = useState("")

    async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        setFileError("")
        const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
        if (ext === "pdf") {
            setFileError("PDF can't be read directly — export as .txt from your transcript app, or copy-paste.")
            e.target.value = ""; return
        }
        setLoadingFile(true)
        try {
            const text = await file.text()
            onChange("text", text)
        } catch {
            setFileError("Couldn't read this file. Try copy-pasting the transcript instead.")
        } finally {
            setLoadingFile(false)
            e.target.value = ""
        }
    }

    const hasText = entry.text.trim().length > 50
    const wordCount = entry.text.split(/\s+/).filter(Boolean).length

    return (
        <div className={CARD + " space-y-3"}>
            <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">Transcript {index + 1}</p>
                {onRemove && (
                    <button onClick={onRemove} className="text-xs text-gray-400 hover:text-red-500 transition-colors">Remove</button>
                )}
            </div>

            {/* Upload zone — shown when empty */}
            {!hasText && (
                <div className="space-y-3">
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={loadingFile}
                        className="w-full border-2 border-dashed border-[var(--color-accent)] rounded-xl p-5 flex flex-col items-center gap-2 bg-indigo-50/50 hover:bg-indigo-50 transition-colors disabled:opacity-60">
                        <input ref={fileRef} type="file" accept=".txt,.md,.srt,.text,.csv" className="hidden" onChange={handleFile} />
                        <div className="w-10 h-10 bg-[var(--color-accent)] rounded-xl flex items-center justify-center">
                            {loadingFile
                                ? <svg className="w-5 h-5 text-white animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                                : <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                            }
                        </div>
                        <p className="text-sm font-semibold text-[var(--color-accent)]">{loadingFile ? "Reading…" : "Upload file"}</p>
                        <p className="text-xs text-gray-500">.txt · .md · .srt — Otter, Fireflies, Granola, Gemini, Read AI…</p>
                    </button>
                    <div className="relative flex items-center gap-3">
                        <div className="flex-1 border-t border-[var(--color-border)]" />
                        <span className="text-xs text-gray-400">or paste directly</span>
                        <div className="flex-1 border-t border-[var(--color-border)]" />
                    </div>
                    <textarea rows={5}
                        placeholder={"Paste transcript here…\n\nLines should start with the speaker's name:\nAlex: We've been struggling with response times…\nJordan: I understand — here's how I think about that…"}
                        value={entry.text}
                        onChange={e => onChange("text", e.target.value)}
                        className={INPUT + " resize-y"} />
                    {fileError && <p className="text-xs text-amber-600">{fileError}</p>}
                </div>
            )}

            {/* Compact text view — shown after text is entered */}
            {hasText && (
                <div className="space-y-1">
                    <div className="flex items-center justify-between">
                        <p className="text-xs text-gray-400">{wordCount.toLocaleString()} words</p>
                        <button onClick={() => { onChange("text", ""); onChange("expertSpeaker", "") }}
                            className="text-xs text-gray-400 hover:text-gray-600">Clear &amp; replace</button>
                    </div>
                    <textarea rows={3} value={entry.text}
                        onChange={e => onChange("text", e.target.value)}
                        className={INPUT + " resize-y text-xs text-gray-500"} />
                </div>
            )}

            {/* Speaker selection — only appears after text is entered */}
            {hasText && (
                <div className="border-t border-[var(--color-border)] pt-3 space-y-2">
                    <label className="text-xs font-semibold text-gray-700 block">
                        Who is the expert in this conversation?
                    </label>
                    {entry.detectedSpeakers.length > 0 ? (
                        <>
                            <div className="flex flex-wrap gap-2">
                                {entry.detectedSpeakers.map(speaker => (
                                    <button key={speaker}
                                        onClick={() => onChange("expertSpeaker", entry.expertSpeaker === speaker ? "" : speaker)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                            entry.expertSpeaker === speaker
                                                ? "bg-[var(--color-accent)] text-white border-[var(--color-accent)]"
                                                : "bg-[var(--color-bg)] text-gray-600 border-[var(--color-border)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                                        }`}>
                                        {speaker}
                                    </button>
                                ))}
                            </div>
                            {entry.expertSpeaker
                                ? <p className="text-xs text-green-600">✓ Learning from: <span className="font-medium">{entry.expertSpeaker}</span></p>
                                : <p className="text-xs text-amber-600">Tap a name — this is who we learn from in this transcript.</p>
                            }
                        </>
                    ) : (
                        <p className="text-xs text-amber-600">
                            No speaker labels found. Lines should start with "Name: " (e.g. "Alex: ") for auto-detection, or export as .txt from your transcript app.
                        </p>
                    )}
                </div>
            )}
        </div>
    )
}

function TeamDNATab({ orgId, org, onApplied }: { orgId: string; org: OrgInfo; onApplied: () => void }) {
    const [step, setStep]               = useState<DNAStep>("collect")
    const [expertName, setExpertName]   = useState("")
    const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([
        { id: crypto.randomUUID(), text: "", expertSpeaker: "", detectedSpeakers: [] }
    ])
    const [dnaResult, setDnaResult]     = useState<DNAResult | null>(null)
    const [error, setError]             = useState("")
    const [reviewTab, setReviewTab]     = useState<DNAReviewTab>("tone")
    const [applyingTone, setApplyingTone]           = useState(false)
    const [applyingPhrases, setApplyingPhrases]     = useState(false)
    const [applyingObjections, setApplyingObjections] = useState(false)
    const [applyingFlow, setApplyingFlow]           = useState(false)
    const [appliedSections, setAppliedSections]     = useState<Set<string>>(new Set())

    function addTranscript() {
        setTranscripts(prev => [...prev, { id: crypto.randomUUID(), text: "", expertSpeaker: "", detectedSpeakers: [] }])
    }
    function removeTranscript(id: string) {
        setTranscripts(prev => prev.filter(t => t.id !== id))
    }
    function updateTranscript(id: string, field: "text" | "expertSpeaker", value: string) {
        setTranscripts(prev => prev.map(t => {
            if (t.id !== id) return t
            if (field === "text") return { ...t, text: value, detectedSpeakers: detectSpeakers(value) }
            return { ...t, [field]: value }
        }))
    }

    async function analyze() {
        setError("")
        const valid = transcripts.filter(t => t.text.trim().length > 100 && t.expertSpeaker)
        if (valid.length < 3) {
            setError("Add at least 3 complete transcripts and select the expert speaker in each.")
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
            if (!res.ok) { setError(errStr((json as Record<string, unknown>).error) || "Analysis failed."); setStep("collect"); return }
            setDnaResult(json as DNAResult)
            setStep("review")
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
            setAppliedSections(prev => new Set([...prev, "tone"]))
            onApplied()
        } finally { setApplyingTone(false) }
    }

    async function applyPhrases() {
        if (!dnaResult) return
        setApplyingPhrases(true)
        try {
            const required = [...(org.voice_profile?.required_phrases ?? []), ...dnaResult.power_phrases.map(p => p.phrase)]
            const banned   = [...(org.voice_profile?.banned_phrases   ?? []), ...dnaResult.phrases_to_avoid.map(p => p.pattern)]
            await supabase.from("organizations").update({ voice_profile: { ...org.voice_profile, required_phrases: required, banned_phrases: banned } }).eq("id", orgId)
            setAppliedSections(prev => new Set([...prev, "phrases"]))
            onApplied()
        } finally { setApplyingPhrases(false) }
    }

    async function applyObjections() {
        if (!dnaResult) return
        setApplyingObjections(true)
        try {
            await supabase.from("org_objections").insert(dnaResult.objections.map(o => ({
                org_id: orgId, objection: o.objection, response_guidance: o.response_guidance,
                severity: o.severity, variants: null, active: true,
            })))
            setAppliedSections(prev => new Set([...prev, "objections"]))
        } finally { setApplyingObjections(false) }
    }

    async function applyFlow() {
        if (!dnaResult) return
        setApplyingFlow(true)
        try {
            await supabase.from("org_playbooks").insert({
                org_id: orgId,
                name: `${expertName.trim() || "Expert"} Playbook (Team DNA)`,
                methodology: dnaResult.conversation_flow.methodology_guess,
                status: "active", version: 1,
                stages: dnaResult.conversation_flow.stages.map(s => ({
                    name: s.name, description: s.description,
                    required_items: s.required_items, guardrail_rules: [],
                })),
            })
            setAppliedSections(prev => new Set([...prev, "flow"]))
        } finally { setApplyingFlow(false) }
    }

    const completedCount = transcripts.filter(t => t.text.trim().length > 100 && t.expertSpeaker).length
    const MIN = 3

    if (step === "analyzing") {
        return (
            <div className={CARD + " flex flex-col items-center justify-center gap-6 py-20"}>
                <div className="w-14 h-14 border-4 border-indigo-200 border-t-[var(--color-accent)] rounded-full animate-spin" />
                <div className="text-center">
                    <p className="text-gray-900 font-semibold text-lg">Analyzing with Claude Opus…</p>
                    <p className="text-gray-500 text-sm mt-1">This can take 30–60 seconds for multiple transcripts.</p>
                </div>
            </div>
        )
    }

    if (step === "review" && dnaResult) {
        const reviewTabs: { key: DNAReviewTab; label: string }[] = [
            { key: "tone",       label: "Tone"       },
            { key: "phrases",    label: "Phrases"    },
            { key: "objections", label: "Objections" },
            { key: "flow",       label: "Conv. Flow" },
        ]
        return (
            <div className="space-y-4">
                <div className={CARD}>
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-xs font-medium text-[var(--color-accent)] uppercase tracking-wide mb-1">Team DNA · Analysis complete</p>
                            <p className="text-gray-900 text-sm leading-relaxed">{dnaResult.summary}</p>
                        </div>
                        <button onClick={() => { setStep("collect"); setDnaResult(null); setAppliedSections(new Set()) }}
                            className="text-xs text-gray-400 hover:text-gray-600 whitespace-nowrap flex-shrink-0">
                            Start over
                        </button>
                    </div>
                </div>
                <div className="border-b border-[var(--color-border)] flex gap-1">
                    {reviewTabs.map(t => (
                        <button key={t.key} onClick={() => setReviewTab(t.key)}
                            className={`px-4 py-2 text-sm border-b-2 transition-colors -mb-px flex items-center gap-1.5 ${
                                reviewTab === t.key
                                    ? "border-[var(--color-accent)] text-[var(--color-accent)] font-medium"
                                    : "border-transparent text-gray-500 hover:text-gray-900"
                            }`}>
                            {t.label}
                            {appliedSections.has(t.key) && <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />}
                        </button>
                    ))}
                </div>

                {reviewTab === "tone" && (
                    <div className={CARD + " space-y-4"}>
                        <div>
                            <p className="text-sm font-semibold text-gray-900 mb-1">Detected communication style</p>
                            <p className="text-xs text-gray-500">{dnaResult.tone.evidence}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {dnaResult.tone.descriptors.map(d => (
                                <span key={d} className="px-3 py-1 rounded-full bg-indigo-50 text-[var(--color-accent)] text-sm font-medium border border-indigo-200">{d}</span>
                            ))}
                        </div>
                        {org.voice_profile?.tone && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                <p className="text-xs font-medium text-amber-700 mb-1">Current tone setting</p>
                                <p className="text-xs text-amber-600">{org.voice_profile.tone}</p>
                                <p className="text-xs text-amber-500 mt-1">Applying will merge — existing tones are preserved.</p>
                            </div>
                        )}
                        <button onClick={applyTone} disabled={applyingTone || appliedSections.has("tone")}
                            className={BTN_PRIMARY + (appliedSections.has("tone") ? " opacity-60" : "")}>
                            {appliedSections.has("tone") ? "✓ Applied" : applyingTone ? "Applying…" : "Apply to team settings"}
                        </button>
                    </div>
                )}

                {reviewTab === "phrases" && (
                    <div className="space-y-4">
                        <div className={CARD + " space-y-3"}>
                            <p className="text-sm font-semibold text-gray-900">Power phrases ({dnaResult.power_phrases.length})</p>
                            <p className="text-xs text-gray-500">Phrases this expert uses consistently — will be added as required phrases.</p>
                            <div className="divide-y divide-[var(--color-border)]">
                                {dnaResult.power_phrases.map((p, i) => (
                                    <div key={i} className="py-3 first:pt-0 last:pb-0">
                                        <p className="text-sm text-gray-900 font-medium">"{p.phrase}"</p>
                                        <p className="text-xs text-gray-500 mt-0.5">{p.context} · {p.appears_in}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className={CARD + " space-y-3"}>
                            <p className="text-sm font-semibold text-gray-900">Phrases to avoid ({dnaResult.phrases_to_avoid.length})</p>
                            <p className="text-xs text-gray-500">Patterns NOT used by this expert — will be added as banned phrases.</p>
                            <div className="divide-y divide-[var(--color-border)]">
                                {dnaResult.phrases_to_avoid.map((p, i) => (
                                    <div key={i} className="py-3 first:pt-0 last:pb-0">
                                        <p className="text-sm text-gray-900 font-medium">{p.pattern}</p>
                                        <p className="text-xs text-gray-500 mt-0.5">{p.why}</p>
                                        <p className="text-xs text-indigo-600 mt-0.5">Instead: {p.better_alternative}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                        {(org.voice_profile?.required_phrases?.length || org.voice_profile?.banned_phrases?.length) && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                <p className="text-xs font-medium text-amber-700 mb-1">Existing phrase settings</p>
                                <p className="text-xs text-amber-600">
                                    {org.voice_profile.required_phrases?.length ?? 0} required · {org.voice_profile.banned_phrases?.length ?? 0} banned. Applying adds to these lists, not replaces.
                                </p>
                            </div>
                        )}
                        <button onClick={applyPhrases} disabled={applyingPhrases || appliedSections.has("phrases")}
                            className={BTN_PRIMARY + (appliedSections.has("phrases") ? " opacity-60" : "")}>
                            {appliedSections.has("phrases") ? "✓ Applied" : applyingPhrases ? "Applying…" : "Apply phrases to team"}
                        </button>
                    </div>
                )}

                {reviewTab === "objections" && (
                    <div className={CARD + " space-y-4"}>
                        <div>
                            <p className="text-sm font-semibold text-gray-900">Objection handlers ({dnaResult.objections.length})</p>
                            <p className="text-xs text-gray-500 mt-0.5">How the expert handled real pushback — will be added to your Objections tab.</p>
                        </div>
                        <div className="space-y-3">
                            {dnaResult.objections.map((o, i) => (
                                <div key={i} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl p-4 space-y-2">
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="text-sm font-medium text-gray-900">{o.objection}</p>
                                        <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                                            o.severity === "critical" ? "bg-red-100 text-red-700" :
                                            o.severity === "high"     ? "bg-orange-100 text-orange-700" :
                                            o.severity === "medium"   ? "bg-amber-100 text-amber-700" :
                                                                        "bg-gray-100 text-gray-600"
                                        }`}>{o.severity}</span>
                                    </div>
                                    <p className="text-xs text-gray-600">{o.expert_response_summary}</p>
                                    {o.example_quote && (
                                        <p className="text-xs text-indigo-700 bg-indigo-50 rounded-lg px-3 py-2 italic">"{o.example_quote}"</p>
                                    )}
                                    <p className="text-xs text-gray-500 border-t border-[var(--color-border)] pt-2">{o.response_guidance}</p>
                                </div>
                            ))}
                        </div>
                        <button onClick={applyObjections} disabled={applyingObjections || appliedSections.has("objections")}
                            className={BTN_PRIMARY + (appliedSections.has("objections") ? " opacity-60" : "")}>
                            {appliedSections.has("objections") ? "✓ Applied" : applyingObjections ? "Adding…" : `Add ${dnaResult.objections.length} objections to team`}
                        </button>
                    </div>
                )}

                {reviewTab === "flow" && (
                    <div className={CARD + " space-y-4"}>
                        <div>
                            <p className="text-sm font-semibold text-gray-900">Conversation framework</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                                Detected methodology: <span className="font-medium text-gray-700">{dnaResult.conversation_flow.methodology_guess}</span> · Will be saved as a new playbook.
                            </p>
                        </div>
                        <div className="space-y-3">
                            {dnaResult.conversation_flow.stages.map((s, i) => (
                                <div key={i} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl p-4 space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="w-6 h-6 rounded-full bg-indigo-100 text-[var(--color-accent)] text-xs font-semibold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                                        <p className="text-sm font-semibold text-gray-900">{s.name}</p>
                                    </div>
                                    <p className="text-xs text-gray-600 pl-8">{s.description}</p>
                                    {s.required_items.length > 0 && (
                                        <ul className="pl-8 space-y-0.5">
                                            {s.required_items.map((item, j) => (
                                                <li key={j} className="text-xs text-gray-500 flex items-start gap-1.5">
                                                    <span className="text-[var(--color-accent)] flex-shrink-0">·</span>{item}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    {s.transition_signal && (
                                        <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-1.5 pl-8">
                                            <span className="font-medium">Move on when:</span> {s.transition_signal}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                        <button onClick={applyFlow} disabled={applyingFlow || appliedSections.has("flow")}
                            className={BTN_PRIMARY + (appliedSections.has("flow") ? " opacity-60" : "")}>
                            {appliedSections.has("flow") ? "✓ Applied" : applyingFlow ? "Saving…" : "Add as playbook"}
                        </button>
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
                    <p className="text-sm font-semibold text-gray-900">Team DNA</p>
                    <p className="text-xs text-gray-500 mt-1">
                        Upload transcripts from your best performers. Claude Opus analyzes their tone, key phrases, objection handling, and conversation flow — then translates it into coaching your whole team can use.
                    </p>
                </div>
                <div>
                    <label className="text-xs font-medium text-gray-700 block mb-1">Playbook name (optional)</label>
                    <input type="text" placeholder="e.g. Sarah's Playbook, or Top Performers"
                        value={expertName} onChange={e => setExpertName(e.target.value)}
                        className={INPUT} />
                    <p className="text-xs text-gray-400 mt-1">How the extracted playbook will be named. Each transcript below can be from a different expert — you'll pick the expert speaker in each one.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-[var(--color-accent)] transition-all rounded-full"
                            style={{ width: `${Math.min((completedCount / 5) * 100, 100)}%` }} />
                    </div>
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                        {completedCount} of 5 {completedCount >= MIN ? "· ready to analyze" : `· need ${MIN - completedCount} more`}
                    </span>
                </div>
            </div>

            {transcripts.map((t, i) => (
                <TranscriptCard key={t.id} index={i} entry={t}
                    onChange={(field, val) => updateTranscript(t.id, field, val)}
                    onRemove={transcripts.length > 1 ? () => removeTranscript(t.id) : undefined}
                />
            ))}

            <div className="flex gap-3">
                <button onClick={addTranscript}
                    className="flex-1 border-2 border-dashed border-[var(--color-border)] rounded-xl py-3 text-sm text-gray-400 hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors">
                    + Add transcript
                </button>
                <button onClick={analyze} disabled={completedCount < MIN}
                    className={BTN_PRIMARY + " flex-shrink-0" + (completedCount < MIN ? " opacity-50 cursor-not-allowed" : "")}>
                    Analyze {completedCount > 0 ? completedCount : ""} transcript{completedCount !== 1 ? "s" : ""}
                </button>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
    )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminPage() {
    const [tab, setTab]         = useState<AdminTab>("settings")
    const [org, setOrg]         = useState<OrgInfo | null>(null)
    const [orgId, setOrgId]     = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    const loadOrg = useCallback(async () => {
        const { data: ctx } = await supabase.rpc("get_org_context")
        if (!ctx?.org_id) { setLoading(false); return }
        setOrgId(ctx.org_id)
        const { data } = await supabase.from("organizations")
            .select("id, name, slug, plan, visibility, seats_purchased, voice_profile")
            .eq("id", ctx.org_id).single()
        setOrg(data as OrgInfo)
        setLoading(false)
    }, [])

    useEffect(() => { loadOrg() }, [loadOrg])

    const tabs: { key: AdminTab; label: string }[] = [
        { key: "settings",   label: "Settings"   },
        { key: "knowledge",  label: "Knowledge"  },
        { key: "objections", label: "Objections" },
        { key: "playbooks",  label: "Playbooks"  },
        { key: "practice",   label: "Practice"   },
        { key: "members",    label: "Members"    },
        { key: "dna",        label: "Team DNA"   },
    ]

    if (loading) return <div className="text-gray-500 text-sm">Loading…</div>
    if (!orgId || !org) return (
        <div className="text-red-600 text-sm">
            Admin access required. Make sure you&apos;re an org owner or admin.
        </div>
    )

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold text-gray-900">Admin</h1>
                <p className="text-sm text-gray-500 mt-1">{org.name} · <span className="capitalize">{org.plan}</span> plan</p>
            </div>

            <div className="border-b border-[var(--color-border)] flex gap-1">
                {tabs.map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                        className={`px-4 py-2 text-sm border-b-2 transition-colors -mb-px ${
                            tab === t.key
                                ? "border-[var(--color-accent)] text-[var(--color-accent)] font-medium"
                                : "border-transparent text-gray-500 hover:text-gray-900"
                        }`}
                    >{t.label}</button>
                ))}
            </div>

            {tab === "settings"   && <SettingsTab org={org} onSaved={loadOrg} />}
            {tab === "knowledge"  && <KnowledgeTab orgId={orgId} />}
            {tab === "objections" && <ObjectionsTab orgId={orgId} />}
            {tab === "playbooks"  && <PlaybooksTab orgId={orgId} />}
            {tab === "practice"   && <PracticeTab orgId={orgId} />}
            {tab === "members"    && <MembersTab orgId={orgId} org={org} onNavigate={setTab} />}
            {tab === "dna"        && <TeamDNATab orgId={orgId} org={org} onApplied={loadOrg} />}
        </div>
    )
}
