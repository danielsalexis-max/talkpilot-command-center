"use client"

// Team DNA, as the mockup drew it (D-461): a dark "lab" where the call goes in
// and the machine is seen reading it, then a light profile you explore before
// you apply anything. Pure views: TeamDNATab in orgTabs.tsx owns the state,
// the Supabase calls and the model call; everything here renders what it is
// given and reports clicks back.

import { useEffect, useMemo, useRef, useState } from "react"
import { useLocale } from "@/i18n/LocaleProvider"
import type { ChatTurn } from "@/lib/supabase"

// ─── Shared shapes (mirrors of the ones in orgTabs.tsx) ─────────────────────

export interface DnaEvidence { transcript: number; lines: number[] }
export interface DnaSource { text: string; expert_speaker: string; rep_label: string | null }
export interface DnaResultView {
    summary: string
    tone: { descriptors: string[]; evidence: string }
    power_phrases: Array<{ phrase: string; context: string; appears_in: string; evidence?: DnaEvidence[] }>
    phrases_to_avoid: Array<{ pattern: string; why: string; better_alternative: string }>
    objections: Array<{ objection: string; expert_response_summary: string; example_quote: string; severity: string; response_guidance: string; evidence?: DnaEvidence[] }>
    conversation_flow: { methodology_guess: string; stages: Array<{ name: string; description: string; required_items: string[]; transition_signal: string; evidence?: DnaEvidence[] }> }
}

// ─── Counting (no model involved) ────────────────────────────────────────────

const SPEAKER = /^(\p{L}[\p{L}\p{M}0-9 _.'-]{0,30}):\s/u

export interface DnaStats {
    voices: string[]
    words: number
    talkPct: number
    questions: number
    per10: number
    minutes: number
}

/// What can be counted off the transcripts before (or without) any model:
/// who speaks, how much the expert talks, how many questions they ask.
/// Minutes assume ~150 spoken words a minute — said as "~" wherever shown.
export function dnaStats(sources: Array<{ text: string; expert_speaker: string }>): DnaStats {
    const voices = new Set<string>()
    let expertWords = 0, allWords = 0, questions = 0, words = 0
    for (const s of sources) {
        words += s.text.trim().split(/\s+/).filter(Boolean).length
        for (const raw of s.text.split("\n")) {
            const line = raw.trim()
            const m = line.match(SPEAKER)
            if (!m) continue
            const who = m[1].trim()
            voices.add(who)
            const body = line.slice(m[0].length)
            const w = body.split(/\s+/).filter(Boolean).length
            allWords += w
            if (who === s.expert_speaker) {
                expertWords += w
                questions += (body.match(/\?/g) ?? []).length
            }
        }
    }
    const minutes = Math.max(1, Math.round(words / 150))
    return {
        voices: Array.from(voices).slice(0, 6),
        words,
        talkPct: allWords > 0 ? Math.round((expertWords / allWords) * 100) : 0,
        questions,
        per10: Math.round((questions / minutes) * 10 * 10) / 10,
        minutes,
    }
}

export function initialsOf(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return "?"
    return parts.slice(0, 2).map(p => p[0]!.toUpperCase()).join("")
}

// ─── Lab shell (always dark, like the mockup) ────────────────────────────────

const LAB = {
    bg: "#0A1220", surface: "#0E182B", line: "#24344D", text: "#EDF2F1", muted: "#94A2AB",
    glow: "#37E4C8", gold: "#E2B15A",
}

export function DnaLab({ children }: { children: React.ReactNode }) {
    return (
        <div className="rounded-2xl overflow-hidden border" style={{ background: LAB.bg, color: LAB.text, borderColor: LAB.line, colorScheme: "dark" }}>
            <div className="p-5 sm:p-6 space-y-4">{children}</div>
        </div>
    )
}

function labBtn(primary: boolean) {
    return primary
        ? "px-4 py-2.5 rounded-lg text-sm font-bold transition-opacity disabled:opacity-40"
        : "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-40"
}

// ─── 1 · Drop ────────────────────────────────────────────────────────────────

export interface DropChip { id: string; label: string; words: number; ok: boolean }

export function DnaDropZone({ chips, accept, busy, error, onFiles, onPaste, onOpenChip, onRemoveChip }: {
    chips: DropChip[]
    accept: string
    busy: boolean
    error: string
    onFiles: (files: File[]) => void
    onPaste: () => void
    onOpenChip: (id: string) => void
    onRemoveChip: (id: string) => void
}) {
    const { t, intl } = useLocale()
    const d = t.tabs.dna
    const inputRef = useRef<HTMLInputElement>(null)
    const [over, setOver] = useState(false)
    return (
        <div
            onDragOver={e => { e.preventDefault(); setOver(true) }}
            onDragLeave={() => setOver(false)}
            onDrop={e => { e.preventDefault(); setOver(false); const fs = Array.from(e.dataTransfer.files ?? []); if (fs.length) onFiles(fs) }}
            className="rounded-2xl border-[1.5px] border-dashed px-5 py-9 text-center grid gap-3 justify-items-center transition-colors"
            style={{ borderColor: over ? LAB.glow : LAB.line, background: over ? "rgba(55,228,200,.07)" : "linear-gradient(180deg,rgba(55,228,200,.04),transparent)" }}>
            <input ref={inputRef} type="file" multiple accept={accept} className="hidden"
                onChange={e => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; if (fs.length) onFiles(fs) }} />
            <p className="font-display text-xl sm:text-[22px] font-bold">{d.dropTitle}</p>
            <p className="text-sm max-w-[46ch]" style={{ color: LAB.muted }}>{busy ? d.reading : d.dropSub}</p>
            <div className="flex flex-wrap gap-2 justify-center">
                {chips.map(c => (
                    <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full border font-mono text-[11.5px] pl-2.5 pr-1.5 py-1"
                        style={{ borderColor: c.ok ? "rgba(55,228,200,.5)" : LAB.line, color: c.ok ? LAB.glow : LAB.muted }}>
                        <button onClick={() => onOpenChip(c.id)} className="truncate max-w-[16rem]" title={c.label}>
                            {c.label} · {d.nWords(c.words.toLocaleString(intl))}
                        </button>
                        <button onClick={() => onRemoveChip(c.id)} aria-label={t.common.remove} className="px-1 opacity-70 hover:opacity-100">×</button>
                    </span>
                ))}
                <button onClick={() => inputRef.current?.click()} disabled={busy}
                    className="rounded-full border font-mono text-[11.5px] px-2.5 py-1 hover:opacity-90"
                    style={{ borderColor: LAB.line, color: LAB.muted }}>
                    {chips.length ? d.addAnotherCall : d.chooseFile}
                </button>
                <button onClick={onPaste} className="rounded-full border font-mono text-[11.5px] px-2.5 py-1 hover:opacity-90"
                    style={{ borderColor: LAB.line, color: LAB.muted }}>
                    {d.pasteText}
                </button>
            </div>
            {error && <p className="text-xs" style={{ color: LAB.gold }}>{error}</p>}
        </div>
    )
}

// ─── Calls already in TalkPilot ──────────────────────────────────────────────

export interface PickerCall { id: string; title: string; meta: string; used: boolean; loading: boolean }

export function DnaCallPicker({ calls, note, error, busy, onToggle }: {
    calls: PickerCall[] | null
    note?: string
    error?: string
    busy: boolean
    onToggle: (id: string) => void
}) {
    const { t } = useLocale()
    const d = t.tabs.dna
    return (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: LAB.line, background: LAB.surface }}>
            <div className="px-4 py-2.5 border-b flex flex-wrap items-baseline justify-between gap-2" style={{ borderColor: LAB.line }}>
                <span className="font-display font-bold text-[14.5px]">{d.platformCalls}</span>
                <span className="text-xs" style={{ color: LAB.muted }}>{d.platformCallsSub}</span>
            </div>
            {note && <p className="px-4 py-2 text-xs border-b" style={{ color: LAB.gold, borderColor: LAB.line }}>{note}</p>}
            {calls === null ? (
                <p className="px-4 py-3 text-xs" style={{ color: LAB.muted }}>{d.loadingCalls}</p>
            ) : calls.length === 0 ? (
                <p className="px-4 py-3 text-xs" style={{ color: LAB.muted }}>{d.noPlatformCalls}</p>
            ) : (
                <div className="max-h-64 overflow-y-auto">
                    {calls.map(c => (
                        <div key={c.id} className="grid grid-cols-[1fr_auto] gap-x-3 items-center px-4 py-2.5 border-b last:border-b-0" style={{ borderColor: LAB.line }}>
                            <span className="text-[13.5px] font-semibold truncate">{c.title}</span>
                            <button onClick={() => onToggle(c.id)} disabled={busy && !c.loading}
                                className="row-span-2 text-xs font-bold px-3 py-1.5 rounded-lg border disabled:opacity-40"
                                style={c.used
                                    ? { background: "rgba(55,228,200,.14)", borderColor: "rgba(55,228,200,.5)", color: LAB.glow }
                                    : { borderColor: LAB.line, color: LAB.text }}>
                                {c.loading ? d.usingCall : c.used ? d.callInUse : d.useCall}
                            </button>
                            <span className="font-mono text-[11px]" style={{ color: LAB.muted }}>{c.meta}</span>
                        </div>
                    ))}
                </div>
            )}
            {error && <p className="px-4 py-2 text-xs border-t" style={{ color: LAB.gold, borderColor: LAB.line }}>{error}</p>}
        </div>
    )
}

// ─── Pre-read ────────────────────────────────────────────────────────────────

export function DnaPreRead({ stats, expert }: { stats: DnaStats; expert: string }) {
    const { t, intl } = useLocale()
    const d = t.tabs.dna
    const tile = (label: string, value: React.ReactNode, small?: string) => (
        <div className="rounded-xl border p-3 min-w-0" style={{ background: LAB.surface, borderColor: LAB.line }}>
            <p className="font-mono text-[10.5px] uppercase tracking-[.1em]" style={{ color: LAB.muted }}>{label}</p>
            <p className="font-display text-[22px] font-bold mt-1 tabular-nums truncate">
                {value}{small && <small className="text-xs font-medium ml-1" style={{ color: LAB.muted }}>{small}</small>}
            </p>
        </div>
    )
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            {tile(d.preVoices, stats.voices.length, stats.voices.join(" · "))}
            {tile(d.preTalks(expert), <>{stats.talkPct}<small className="text-xs">%</small></>)}
            {tile(d.preQuestions, stats.questions, d.perTen(stats.per10.toLocaleString(intl)))}
            {tile(d.preLength, <>~{stats.minutes}<small className="text-xs"> min</small></>)}
        </div>
    )
}

// ─── 2 · Reading ─────────────────────────────────────────────────────────────

type FindKind = "phrase" | "objection" | "flow" | "tone"
interface Finding { kind: FindKind; title: string; sub: string; refs: DnaEvidence[] }

function findingsOf(r: DnaResultView): Finding[] {
    const out: Finding[] = []
    for (const p of (r.power_phrases ?? []).slice(0, 2)) out.push({ kind: "phrase", title: `"${p.phrase}"`, sub: p.context, refs: p.evidence ?? [] })
    for (const o of (r.objections ?? []).slice(0, 3)) out.push({ kind: "objection", title: o.objection, sub: o.expert_response_summary, refs: o.evidence ?? [] })
    const stages = r.conversation_flow?.stages ?? []
    if (stages.length) out.push({ kind: "flow", title: stages.map(s => s.name).join(" → "), sub: r.conversation_flow.methodology_guess ?? "", refs: stages.flatMap(s => s.evidence ?? []) })
    if (r.tone?.descriptors?.length) out.push({ kind: "tone", title: r.tone.descriptors.join(" · "), sub: r.tone.evidence ?? "", refs: [] })
    return out
}

const TAG_STYLE: Record<FindKind, { bg: string; fg: string }> = {
    phrase:    { bg: "rgba(55,228,200,.12)", fg: "#37E4C8" },
    flow:      { bg: "rgba(55,228,200,.12)", fg: "#37E4C8" },
    objection: { bg: "rgba(226,177,90,.14)", fg: "#E2B15A" },
    tone:      { bg: "rgba(180,160,255,.14)", fg: "#C7B8FF" },
}

/// The screen the spinner used to be. While the model works, the transcript
/// is shown with the expert's lines marked and a scan line passing over it;
/// that part is decoration and claims nothing. When the result lands, its
/// findings appear one at a time and light up the exact lines they cite —
/// those are the model's real output, only paced.
export function DnaReading({ name, sources, result, totalWords, onOpenProfile }: {
    name: string
    sources: DnaSource[]
    result: DnaResultView | null
    totalWords: number
    onOpenProfile: () => void
}) {
    const { t, intl } = useLocale()
    const d = t.tabs.dna
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    const findings = useMemo(() => result ? findingsOf(result) : [], [result])
    const [shown, setShown] = useState(0)
    const [words, setWords] = useState(0)
    const [tx, setTx] = useState(0)
    const paneRef = useRef<HTMLDivElement>(null)

    // Counter: climbs toward ~90% while waiting (the model has the text, but
    // we don't know how far it is), finishes only when the result is back.
    useEffect(() => {
        const cap = result ? totalWords : Math.round(totalWords * 0.9)
        const id = setInterval(() => {
            setWords(w => w >= cap ? cap : Math.min(cap, w + Math.max(23, Math.round((cap - w) * (result ? 0.25 : 0.02)))))
        }, reduce ? 10 : 120)
        return () => clearInterval(id)
    }, [result, totalWords, reduce])

    useEffect(() => {
        if (!result) return
        setShown(0)
        let i = 0
        const id = setInterval(() => {
            i++
            setShown(i)
            if (i >= findings.length) clearInterval(id)
        }, reduce ? 10 : 650)
        return () => clearInterval(id)
    }, [result, findings.length, reduce])

    const latest = shown > 0 ? findings[shown - 1] : null
    useEffect(() => {
        const ref = latest?.refs.find(r => sources[r.transcript - 1])
        if (!ref) return
        setTx(ref.transcript - 1)
        const first = Math.min(...ref.lines)
        requestAnimationFrame(() => {
            paneRef.current?.querySelector(`[data-l="${first}"]`)?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" })
        })
    }, [latest, sources, reduce])

    // Lines lit so far in the transcript on screen; objection lines in gold.
    const lit = new Map<number, FindKind>()
    for (const f of findings.slice(0, shown)) for (const r of f.refs) if (r.transcript - 1 === tx) for (const n of r.lines) if (!lit.has(n) || f.kind === "objection") lit.set(n, f.kind)

    const src = sources[tx]
    const lines = (src?.text ?? "").split("\n")
    const done = !!result && shown >= findings.length

    return (
        <DnaLab>
            <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4">
                <div className="space-y-2 min-w-0">
                    {sources.length > 1 && (
                        <div className="flex gap-1.5 flex-wrap">
                            {sources.map((s, i) => (
                                <button key={i} onClick={() => setTx(i)} className="font-mono text-[11px] px-2 py-0.5 rounded-md border"
                                    style={{ borderColor: i === tx ? LAB.glow : LAB.line, color: i === tx ? LAB.glow : LAB.muted }}>
                                    {s.rep_label || d.callN(i + 1)}
                                </button>
                            ))}
                        </div>
                    )}
                    <div ref={paneRef} className="relative rounded-xl border p-3 max-h-[440px] overflow-y-auto" style={{ background: LAB.surface, borderColor: LAB.line }}>
                        {!result && !reduce && <div className="dna-scan" />}
                        {lines.map((raw, i) => {
                            const n = i + 1
                            const m = raw.trim().match(SPEAKER)
                            if (!raw.trim()) return null
                            const who = m ? m[1].trim() : ""
                            const body = m ? raw.trim().slice(m[0].length) : raw.trim()
                            const exp = who && who === src.expert_speaker
                            const hl = lit.get(n)
                            return (
                                <div key={n} data-l={n}
                                    className="grid grid-cols-[26px_72px_1fr] gap-2 px-1.5 py-1 rounded-md text-[13px] leading-snug transition-colors duration-300"
                                    style={hl ? { background: hl === "objection" ? "rgba(226,177,90,.12)" : "rgba(55,228,200,.10)", boxShadow: `inset 3px 0 0 ${hl === "objection" ? LAB.gold : LAB.glow}` } : undefined}>
                                    <span className="font-mono text-[11px] pt-0.5" style={{ color: LAB.muted }}>{String(n).padStart(2, "0")}</span>
                                    <span className="font-semibold text-[12.5px] truncate" style={{ color: exp ? LAB.glow : LAB.muted }}>{who}</span>
                                    <span>{body}</span>
                                </div>
                            )
                        })}
                    </div>
                </div>
                <div className="space-y-2 content-start">
                    <div className="flex items-baseline justify-between gap-2">
                        <span className="font-display font-bold text-[15px]">{d.readingName(name)}</span>
                        <span className="font-mono text-[11.5px] tabular-nums" style={{ color: LAB.muted }}>
                            {words.toLocaleString(intl)} / {totalWords.toLocaleString(intl)} {d.wordsUnit}
                        </span>
                    </div>
                    {!result && (
                        <>
                            <p className="text-xs" style={{ color: LAB.muted }}>{d.readingWait}</p>
                            {[0, 1, 2].map(i => (
                                <div key={i} className="rounded-xl border p-3 animate-pulse" style={{ background: LAB.surface, borderColor: LAB.line }}>
                                    <div className="h-3 rounded w-2/3" style={{ background: LAB.line }} />
                                    <div className="h-2.5 rounded w-5/6 mt-2" style={{ background: LAB.line }} />
                                </div>
                            ))}
                        </>
                    )}
                    {findings.slice(0, shown).map((f, i) => (
                        <div key={i} className="dna-find rounded-xl border px-3 py-2.5 grid grid-cols-[auto_1fr] gap-2.5 items-start" style={{ background: LAB.surface, borderColor: LAB.line }}>
                            <span className="font-mono text-[10px] uppercase tracking-[.08em] px-1.5 py-0.5 rounded-md mt-0.5 whitespace-nowrap"
                                style={{ background: TAG_STYLE[f.kind].bg, color: TAG_STYLE[f.kind].fg }}>
                                {d.findTag[f.kind]}
                            </span>
                            <div className="text-[13.5px] min-w-0">
                                {f.title}
                                <small className="block text-xs mt-0.5" style={{ color: LAB.muted }}>
                                    {f.sub}{refsLabel(f.refs, sources.length, d) && <> · {refsLabel(f.refs, sources.length, d)}</>}
                                </small>
                            </div>
                        </div>
                    ))}
                    {done && (
                        <div className="flex justify-end pt-1">
                            <button onClick={onOpenProfile} className={labBtn(true)} style={{ background: LAB.glow, color: "#06221C" }}>
                                {d.openProfile(name)}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </DnaLab>
    )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function refsLabel(refs: DnaEvidence[], nSources: number, d: any): string {
    const lines = refs.flatMap(r => r.lines.map(n => ({ t: r.transcript, n })))
    if (lines.length === 0) return ""
    const uniq = Array.from(new Set(lines.map(x => nSources > 1 ? `${x.t}:${x.n}` : `${x.n}`))).slice(0, 5)
    if (nSources > 1) return d.linesRefMulti(uniq.map(u => { const [a, b] = u.split(":"); return `${d.callShort(a)} L${b}` }).join(", "))
    return d.linesRef(uniq)
}

// ─── 3 · Profile ─────────────────────────────────────────────────────────────

/// "Ver en la transcripción ↗" with the mockup's dark mono popover. Absent
/// citations (analyses from before D-459) render nothing.
export function DnaEvidenceLink({ evidence, sources }: { evidence?: DnaEvidence[]; sources: DnaSource[] }) {
    const { t } = useLocale()
    const d = t.tabs.dna
    const [open, setOpen] = useState(false)
    const refs = (evidence ?? []).filter(e => e && sources[e.transcript - 1] && Array.isArray(e.lines) && e.lines.length)
    if (!refs.length) return null
    return (
        <div>
            <button type="button" onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(o => !o) }}
                className="text-xs font-semibold text-[var(--color-accent-deep)] hover:underline">
                {open ? d.hideEvidence : d.seeInTranscript}
            </button>
            {open && (
                <div className="mt-1.5 rounded-lg px-3 py-2.5 font-mono text-xs whitespace-pre-wrap space-y-1" style={{ background: LAB.bg, color: LAB.text }}>
                    {refs.map((r, i) => {
                        const src = sources[r.transcript - 1]
                        const all = src.text.split("\n")
                        return (
                            <div key={i} className="space-y-0.5">
                                {sources.length > 1 && <p style={{ color: LAB.muted }}>{src.rep_label || d.callN(r.transcript)}</p>}
                                {r.lines.filter(n => n >= 1 && n <= all.length).slice(0, 8).map(n => {
                                    const raw = all[n - 1].trim()
                                    const m = raw.match(SPEAKER)
                                    return (
                                        <p key={n}>
                                            <span style={{ color: LAB.glow }}>{String(n).padStart(2, "0")} {m ? m[1].trim() + ":" : ""}</span>{" "}
                                            {m ? raw.slice(m[0].length) : raw}
                                        </p>
                                    )
                                })}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

export function DnaProfileHead({ name, meta, tones, actions }: {
    name: string; meta: string; tones: string[]; actions: React.ReactNode
}) {
    return (
        <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-full grid place-items-center text-white font-display font-extrabold flex-shrink-0"
                    style={{ background: "linear-gradient(135deg,#0C9482,#1D5C8A)" }}>{initialsOf(name)}</div>
                <div className="min-w-0">
                    <p className="font-display text-lg font-extrabold text-[var(--color-text)] truncate">{name}</p>
                    <p className="text-[12.5px] text-[var(--color-muted)]">{meta}</p>
                    {tones.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {tones.map(x => <span key={x} className="text-xs px-2.5 py-0.5 rounded-full bg-[var(--color-accent-subtle)] text-[var(--color-accent-deep)] font-semibold">{x}</span>)}
                        </div>
                    )}
                </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center">{actions}</div>
        </div>
    )
}

export function DnaStatTile({ label, value, small, note }: { label: string; value: React.ReactNode; small?: string; note?: React.ReactNode }) {
    return (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
            <p className="font-mono text-[10.5px] uppercase tracking-[.1em] text-[var(--color-muted)]">{label}</p>
            <p className="font-display text-2xl font-extrabold text-[var(--color-text)] tabular-nums">
                {value}{small && <small className="text-xs font-medium text-[var(--color-muted)] ml-1">{small}</small>}
            </p>
            {note && <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{note}</p>}
        </div>
    )
}

export function DnaStrand({ stages, sources }: { stages: DnaResultView["conversation_flow"]["stages"]; sources: DnaSource[] }) {
    const { t } = useLocale()
    const d = t.tabs.dna
    if (!stages.length) return null
    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-[10.5px] uppercase tracking-[.1em] text-[var(--color-muted)]">{d.howCallRuns}</span>
                <span className="text-xs font-semibold text-[var(--color-text-secondary)]">{d.nStages(stages.length)}</span>
            </div>
            <div className={`grid grid-cols-1 sm:grid-cols-2 ${stages.length >= 4 ? "lg:grid-cols-4" : stages.length === 3 ? "lg:grid-cols-3" : ""} border border-[var(--color-border)] rounded-xl overflow-hidden`}>
                    {stages.map((s, i) => (
                        <div key={i} className="p-3.5 border-b sm:border-r border-[var(--color-line-soft)] bg-[var(--color-surface)] space-y-1">
                            <p className="font-mono text-[10.5px] text-[var(--color-accent-deep)] tracking-[.08em]">{i + 1}</p>
                            <p className="font-display font-bold text-[14.5px] text-[var(--color-text)]">{s.name}</p>
                            <p className="text-[12.5px] text-[var(--color-text-secondary)]">{s.description}</p>
                            {s.transition_signal && <p className="text-xs italic text-[var(--color-muted)]">{d.movesOnWhen(s.transition_signal)}</p>}
                            <DnaEvidenceLink evidence={s.evidence} sources={sources} />
                        </div>
                    ))}
            </div>
        </div>
    )
}

export function DnaListCard({ title, count, children }: { title: string; count: string; children: React.ReactNode }) {
    return (
        <div className="rounded-xl border border-[var(--color-border)] p-3.5 bg-[var(--color-surface)] grid gap-2.5 content-start">
            <div className="flex items-center justify-between gap-2">
                <p className="font-display text-sm font-bold text-[var(--color-text)]">{title}</p>
                <span className="font-mono text-[11px] text-[var(--color-muted)]">{count}</span>
            </div>
            {children}
        </div>
    )
}

export function DnaEvidenceItem({ quote, body, evidence, sources }: { quote: string; body: string; evidence?: DnaEvidence[]; sources: DnaSource[] }) {
    return (
        <div className="grid gap-1 p-2.5 rounded-lg bg-[var(--color-bg)] border border-[var(--color-line-soft)]">
            <p className="text-[13.5px] text-[var(--color-text)]"><em>{quote}</em></p>
            <p className="text-[12.5px] text-[var(--color-text-secondary)]">{body}</p>
            <DnaEvidenceLink evidence={evidence} sources={sources} />
        </div>
    )
}

// ─── Ask (inline, like the mockup) ───────────────────────────────────────────

export function DnaAsk({ placeholder, suggestions, onAsk }: {
    placeholder: string
    suggestions: string[]
    onAsk: (q: string, history: ChatTurn[]) => Promise<string>
}) {
    const { t } = useLocale()
    const [thread, setThread] = useState<ChatTurn[]>([])
    const [input, setInput] = useState("")
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState("")
    async function ask(q: string) {
        const question = q.trim()
        if (!question || busy) return
        setError(""); setInput(""); setBusy(true)
        const history = thread
        setThread([...history, { role: "user", content: question }])
        try {
            const a = await onAsk(question, history)
            setThread(th => [...th, { role: "assistant", content: a }])
        } catch (e) {
            setError((e as Error).message || t.askPanel.genericError)
            setThread(th => th.slice(0, -1)); setInput(question)
        } finally { setBusy(false) }
    }
    return (
        <div className="grid gap-2">
            <form onSubmit={e => { e.preventDefault(); ask(input) }}
                className="flex gap-2 items-center border border-[var(--color-border)] rounded-xl pl-3 pr-1.5 py-1.5 bg-[var(--color-surface)]">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-accent-subtle)] text-[var(--color-accent)] font-semibold">AI</span>
                <input value={input} onChange={e => setInput(e.target.value)} placeholder={placeholder}
                    className="flex-1 min-w-0 bg-transparent text-[13.5px] text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none" />
                <button type="submit" disabled={busy || !input.trim()}
                    className="px-3.5 py-2 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] disabled:opacity-40 text-[var(--btn-ink)] text-sm font-semibold rounded-lg">
                    {busy ? t.askPanel.thinking : t.tabs.dna.askButton}
                </button>
            </form>
            {thread.length === 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {suggestions.map(s => (
                        <button key={s} onClick={() => ask(s)} disabled={busy}
                            className="text-xs px-2.5 py-1 rounded-full border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-40">
                            {s}
                        </button>
                    ))}
                </div>
            )}
            {thread.map((m, i) => m.role === "user"
                ? <p key={i} className="text-xs font-semibold text-[var(--color-text)] pt-1">{m.content}</p>
                : <p key={i} className="text-[13px] text-[var(--color-text-secondary)] px-3 py-2 bg-[var(--color-bg)] rounded-lg whitespace-pre-wrap">{m.content}</p>)}
            {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
    )
}

// ─── Apply drawer ────────────────────────────────────────────────────────────

export interface ApplyOption { key: string; label: string; note?: string; applied: boolean; disabled?: boolean }

export function DnaApplyDrawer({ options, busy, doneMsg, onApply, onPickItems }: {
    options: ApplyOption[]
    busy: boolean
    doneMsg: string
    onApply: (keys: string[]) => void
    onPickItems: () => void
}) {
    const { t } = useLocale()
    const d = t.tabs.dna
    const [sel, setSel] = useState<Set<string>>(() => new Set(options.filter(o => !o.applied && !o.disabled).map(o => o.key)))
    const n = options.filter(o => sel.has(o.key) && !o.applied).length
    return (
        <div className="rounded-xl border border-[var(--color-border)] p-3.5 bg-[var(--color-bg)] grid gap-2.5">
            <div className="flex items-center justify-between">
                <span className="font-mono text-[10.5px] uppercase tracking-[.1em] text-[var(--color-muted)]">{d.applyTitle}</span>
                <button onClick={onPickItems} className="text-xs font-semibold text-[var(--color-accent-deep)] hover:underline">{d.pickOneByOne}</button>
            </div>
            {options.map(o => (
                <label key={o.key} className={`flex gap-2.5 items-start text-[13.5px] ${o.applied || o.disabled ? "opacity-60" : "cursor-pointer"}`}>
                    <input type="checkbox" className="mt-1 accent-[var(--color-accent-deep)]"
                        disabled={o.applied || o.disabled || busy}
                        checked={o.applied || sel.has(o.key)}
                        onChange={() => setSel(prev => { const x = new Set(prev); if (x.has(o.key)) x.delete(o.key); else x.add(o.key); return x })} />
                    <span className="text-[var(--color-text)]">
                        {o.label}{o.applied && <> · <span className="text-green-600 font-semibold">{d.alreadyApplied}</span></>}
                        {o.note && <small className="block text-xs text-[var(--color-muted)]">{o.note}</small>}
                    </span>
                </label>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="text-xs text-[var(--color-muted)]">{doneMsg || d.applyFoot}</span>
                <button disabled={busy || n === 0} onClick={() => onApply(options.filter(o => sel.has(o.key) && !o.applied).map(o => o.key))}
                    className="px-4 py-2 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] disabled:opacity-40 text-[var(--btn-ink)] text-sm font-semibold rounded-lg">
                    {busy ? d.applying : d.applyNThings(n)}
                </button>
            </div>
        </div>
    )
}

// ─── 4 · Compare ─────────────────────────────────────────────────────────────

export interface CompareSide { name: string; stats: DnaStats; calls: number; result: DnaResultView }

export function DnaCompareGrid({ a, b }: { a: CompareSide; b: CompareSide }) {
    const { t, intl } = useLocale()
    const d = t.tabs.dna
    const toneKey = (s: string) => s.trim().toLowerCase()
    const shared = new Set((a.result.tone?.descriptors ?? []).map(toneKey).filter(x => (b.result.tone?.descriptors ?? []).map(toneKey).includes(x)))
    const tones = (s: CompareSide) => (
        <div className="flex flex-wrap gap-1">
            {(s.result.tone?.descriptors ?? []).map(x => (
                <span key={x} className={`text-[11px] px-2 py-0.5 rounded-full border ${shared.has(toneKey(x))
                    ? "bg-[var(--color-accent-subtle)] text-[var(--color-accent-deep)] border-transparent font-semibold"
                    : "text-[var(--color-text-secondary)] border-[var(--color-border)]"}`}>{x}</span>
            ))}
        </div>
    )
    const rows: Array<{ k: string; sub?: string; a: React.ReactNode; b: React.ReactNode }> = [
        { k: d.cmpMaterial, a: d.profileMeta(a.calls, a.stats.words.toLocaleString(intl)), b: d.profileMeta(b.calls, b.stats.words.toLocaleString(intl)) },
        { k: d.cmpTalk, sub: d.cmpTalkSub, a: `${a.stats.talkPct}%`, b: `${b.stats.talkPct}%` },
        { k: d.cmpQuestions, sub: d.cmpQuestionsSub, a: a.stats.per10.toLocaleString(intl), b: b.stats.per10.toLocaleString(intl) },
        { k: d.cmpFlow, a: (a.result.conversation_flow?.stages ?? []).map(s => s.name).join(" → ") || "—", b: (b.result.conversation_flow?.stages ?? []).map(s => s.name).join(" → ") || "—" },
        { k: d.cmpObjections, a: (a.result.objections ?? []).map(o => o.objection).join(" · ") || "—", b: (b.result.objections ?? []).map(o => o.objection).join(" · ") || "—" },
        { k: d.cmpTone, sub: d.cmpToneSub, a: tones(a), b: tones(b) },
    ]
    return (
        <div className="rounded-xl border border-[var(--color-border)] overflow-hidden bg-[var(--color-surface)] overflow-x-auto">
            <div className="grid grid-cols-[1.2fr_1fr_1fr] min-w-[560px]">
                {[d.cmpWhat, a.name, b.name].map((h, i) => (
                    <div key={i} className="px-3 py-2.5 border-b border-[var(--color-line-soft)] bg-[var(--color-bg)] font-mono text-[10.5px] uppercase tracking-[.08em] text-[var(--color-muted)] truncate">{h}</div>
                ))}
                {rows.map((r, i) => (
                    <div key={i} className="contents">
                        <div className="px-3 py-2.5 border-b border-[var(--color-line-soft)] text-[13.5px] font-semibold text-[var(--color-text)]">
                            {r.k}{r.sub && <small className="block font-normal text-xs text-[var(--color-muted)]">{r.sub}</small>}
                        </div>
                        <div className="px-3 py-2.5 border-b border-[var(--color-line-soft)] text-[13px] text-[var(--color-text-secondary)] min-w-0">{r.a}</div>
                        <div className="px-3 py-2.5 border-b border-[var(--color-line-soft)] text-[13px] text-[var(--color-text-secondary)] min-w-0">{r.b}</div>
                    </div>
                ))}
            </div>
        </div>
    )
}

/// "Qué copiar esta semana": two concrete things, asked of the model with the
/// two profiles and their transcripts as the only material, each cited.
/// Rendered from "- **Title.** detail (A-T1·L12)" lines.
export function DnaCopyThisWeek({ from, to, onGenerate }: {
    from: string; to: string
    onGenerate: () => Promise<string>
}) {
    const { t } = useLocale()
    const d = t.tabs.dna
    const [text, setText] = useState("")
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState("")
    const [copied, setCopied] = useState(false)
    async function go() {
        setBusy(true); setError("")
        try { setText(await onGenerate()) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
    }
    const items = text.split("\n").map(l => l.trim()).filter(l => l.startsWith("-") || l.startsWith("•")).map(l => l.replace(/^[-•]\s*/, ""))
    return (
        <div className="rounded-xl border border-[var(--color-border)] border-l-[3px] border-l-[var(--color-accent)] p-3.5 bg-[var(--color-surface)] grid gap-2">
            <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10.5px] uppercase tracking-[.1em] text-[var(--color-muted)]">{d.copyTitle(to, from)}</span>
                <span className="text-xs font-semibold text-[var(--color-text-secondary)]">{d.copyTwo}</span>
            </div>
            {!text && (
                <div className="flex flex-wrap items-center gap-2">
                    <button onClick={go} disabled={busy}
                        className="px-4 py-2 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] disabled:opacity-40 text-[var(--btn-ink)] text-sm font-semibold rounded-lg">
                        {busy ? t.askPanel.thinking : d.copyGo}
                    </button>
                    <span className="text-xs text-[var(--color-muted)]">{d.copyNote}</span>
                </div>
            )}
            {text && (
                <>
                    <ul className="grid gap-2">
                        {(items.length ? items : [text]).map((it, i) => (
                            <li key={i} className="text-[14px] text-[var(--color-text-secondary)] pl-4 relative">
                                <span className="absolute left-0 top-[.55em] w-2 h-2 rounded-full bg-[var(--color-accent)]" />
                                {it.split(/(\*\*[^*]+\*\*)/g).map((part, j) => part.startsWith("**")
                                    ? <strong key={j} className="text-[var(--color-text)]">{part.slice(2, -2)}</strong>
                                    : <span key={j}>{part}</span>)}
                            </li>
                        ))}
                    </ul>
                    <div className="flex flex-wrap gap-2">
                        <button onClick={() => { navigator.clipboard?.writeText(items.map(x => "• " + x.replace(/\*\*/g, "")).join("\n")); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
                            className="px-3 py-1.5 text-xs border border-[var(--color-border)] rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text)]">
                            {copied ? d.copied : d.copyText}
                        </button>
                        <button onClick={go} disabled={busy} className="px-3 py-1.5 text-xs border border-[var(--color-border)] rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text)] disabled:opacity-40">
                            {busy ? t.askPanel.thinking : d.copyAgain}
                        </button>
                    </div>
                </>
            )}
            {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
    )
}
