"use client"

// Team DNA, as the mockup drew it (D-461, reworked D-462): a "lab" where the
// call goes in and the machine is seen reading it, then a profile you explore
// before you apply anything. The lab follows the Command Center skin (light or
// dark) through the --dna-* tokens in globals.css. Pure views: TeamDNATab in
// orgTabs.tsx owns the state, the Supabase calls and the model call;
// everything here renders what it is given and reports clicks back.

import { useEffect, useMemo, useRef, useState } from "react"
import { useLocale } from "@/i18n/LocaleProvider"
import type { ChatTurn } from "@/lib/supabase"

// ─── Shared shapes (mirrors of the ones in orgTabs.tsx) ─────────────────────

export interface DnaEvidence { transcript: number; lines: number[] }
export interface DnaSource { text: string; expert_speaker: string; rep_label: string | null; title?: string | null }
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

/// A source's short name for tabs and evidence: the call's title without the
/// rep's name in front (two calls by the same rep otherwise read identically).
export function sourceTitle(s: DnaSource, i: number, d: { callN: (n: number) => string }): string {
    const raw = (s.title || "").trim()
    const rep = (s.rep_label || "").trim()
    const title = rep && raw.startsWith(rep + " · ") ? raw.slice(rep.length + 3) : raw
    return title ? `${d.callN(i + 1)} · ${title}` : d.callN(i + 1)
}

// ─── Lab shell (follows the skin through --dna-* tokens) ────────────────────

export const LAB = {
    bg: "var(--dna-bg)", surface: "var(--dna-surface)", line: "var(--dna-line)",
    text: "var(--dna-text)", muted: "var(--dna-muted)",
    glow: "var(--dna-glow)", glowText: "var(--dna-glow-text)", glowSoft: "var(--dna-glow-soft)", glowLine: "var(--dna-glow-line)",
    gold: "var(--dna-gold)", goldSoft: "var(--dna-gold-soft)",
    cta: "var(--dna-cta)", ctaInk: "var(--dna-cta-ink)",
}

export function DnaLab({ children }: { children: React.ReactNode }) {
    return (
        <div className="rounded-2xl overflow-hidden border" style={{ background: LAB.bg, color: LAB.text, borderColor: LAB.line }}>
            <div className="p-4 sm:p-5 space-y-4">{children}</div>
        </div>
    )
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
    const pill = "rounded-full border text-xs font-semibold px-3 py-1.5 transition-colors disabled:opacity-40"
    return (
        <div
            onDragOver={e => { e.preventDefault(); setOver(true) }}
            onDragLeave={() => setOver(false)}
            onDrop={e => { e.preventDefault(); setOver(false); const fs = Array.from(e.dataTransfer.files ?? []); if (fs.length) onFiles(fs) }}
            className="rounded-xl border-[1.5px] border-dashed px-5 py-6 text-center flex flex-col items-center justify-center gap-3 transition-colors h-full min-h-[240px]"
            style={{ borderColor: over ? LAB.glow : LAB.line, background: over ? LAB.glowSoft : LAB.surface }}>
            <input ref={inputRef} type="file" multiple accept={accept} className="hidden"
                onChange={e => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; if (fs.length) onFiles(fs) }} />
            <p className="font-display text-lg font-bold leading-snug">{d.dropTitle}</p>
            <p className="text-[13px] max-w-[40ch] leading-relaxed" style={{ color: LAB.muted }}>{busy ? d.reading : d.dropSub}</p>
            {chips.length > 0 && (
                <div className="flex flex-col gap-1.5 w-full max-w-sm">
                    {chips.map(c => (
                        <div key={c.id} className="flex items-center gap-2 rounded-lg border pl-3 pr-1.5 py-1.5 text-left"
                            style={{ borderColor: c.ok ? LAB.glowLine : LAB.gold, background: c.ok ? LAB.glowSoft : LAB.goldSoft }}>
                            <button onClick={() => onOpenChip(c.id)} className="flex-1 min-w-0 flex items-baseline gap-2" title={c.label}>
                                <span className="text-[13px] font-semibold truncate">{c.label}</span>
                                <span className="font-mono text-[11px] whitespace-nowrap" style={{ color: c.ok ? LAB.glowText : LAB.gold }}>
                                    {c.ok ? d.nWords(c.words.toLocaleString(intl)) : d.chipNeedsSpeaker}
                                </span>
                            </button>
                            <button onClick={() => onRemoveChip(c.id)} aria-label={t.common.remove}
                                className="w-6 h-6 rounded grid place-items-center text-sm opacity-60 hover:opacity-100">×</button>
                        </div>
                    ))}
                </div>
            )}
            <div className="flex flex-wrap gap-2 justify-center">
                <button onClick={() => inputRef.current?.click()} disabled={busy} className={pill}
                    style={{ borderColor: LAB.glowLine, color: LAB.glowText }}>
                    {chips.length ? d.addAnotherCall : d.chooseFile}
                </button>
                <button onClick={onPaste} className={pill} style={{ borderColor: LAB.line, color: LAB.muted }}>
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
        <div className="rounded-xl border overflow-hidden flex flex-col lg:h-[320px] min-h-0" style={{ borderColor: LAB.line, background: LAB.surface }}>
            <div className="px-4 py-3 border-b" style={{ borderColor: LAB.line }}>
                <p className="font-display font-bold text-[14.5px]">{d.platformCalls}</p>
                <p className="text-xs mt-0.5" style={{ color: LAB.muted }}>{d.platformCallsSub}</p>
            </div>
            {note && <p className="px-4 py-2 text-xs border-b" style={{ color: LAB.gold, borderColor: LAB.line }}>{note}</p>}
            {calls === null ? (
                <p className="px-4 py-3 text-xs" style={{ color: LAB.muted }}>{d.loadingCalls}</p>
            ) : calls.length === 0 ? (
                <p className="px-4 py-3 text-xs" style={{ color: LAB.muted }}>{d.noPlatformCalls}</p>
            ) : (
                <div className="flex-1 min-h-0 max-h-64 lg:max-h-none overflow-y-auto">
                    {calls.map(c => (
                        <div key={c.id} className="flex items-center gap-3 px-4 py-2 border-b last:border-b-0" style={{ borderColor: LAB.line }}>
                            <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-semibold truncate" title={c.title}>{c.title}</p>
                                <p className="font-mono text-[11px]" style={{ color: LAB.muted }}>{c.meta}</p>
                            </div>
                            <button onClick={() => onToggle(c.id)} disabled={busy && !c.loading}
                                className="text-xs font-bold px-3 py-1.5 rounded-lg border disabled:opacity-40 flex-shrink-0"
                                style={c.used
                                    ? { background: LAB.glowSoft, borderColor: LAB.glowLine, color: LAB.glowText }
                                    : { borderColor: LAB.line, color: LAB.text }}>
                                {c.loading ? d.usingCall : c.used ? `✓ ${d.callInUse}` : d.useCall}
                            </button>
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
        <div className="rounded-xl border px-3.5 py-3 min-w-0" style={{ background: LAB.surface, borderColor: LAB.line }}>
            <p className="text-xs font-semibold truncate" style={{ color: LAB.muted }}>{label}</p>
            <p className="font-display text-[22px] font-bold mt-0.5 tabular-nums">{value}</p>
            {small && <p className="text-xs truncate" style={{ color: LAB.muted }} title={small}>{small}</p>}
        </div>
    )
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            {tile(d.preVoices, stats.voices.length, stats.voices.join(" · "))}
            {tile(d.preTalks(expert), <>{stats.talkPct}<small className="text-sm">%</small></>)}
            {tile(d.preQuestions, stats.questions, d.perTen(stats.per10.toLocaleString(intl)))}
            {tile(d.preLength, <>~{stats.minutes}<small className="text-sm"> min</small></>)}
        </div>
    )
}

// ─── 2 · Reading ─────────────────────────────────────────────────────────────

type FindKind = "phrase" | "objection" | "flow" | "tone" | "counted"
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

/// Facts counted off the text in the browser, shown while the model reads so
/// the wait has something true on it: how much they talk, the questions they
/// ask, their longest turn, the 4-word phrases they repeat, and the client's
/// questions. Every one cites its lines. No model is involved.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function countedFindings(sources: DnaSource[], d: any): Finding[] {
    let expertW = 0, otherW = 0, qN = 0, cN = 0, firstQ = ""
    const qRefs: DnaEvidence[] = [], cRefs: DnaEvidence[] = []
    let longest = { words: 0, t: 0, from: 0, to: 0 }
    const grams = new Map<string, { n: number; shown: string; refs: Map<number, number[]> }>()
    sources.forEach((s, ti) => {
        let run = { words: 0, from: 0 }
        const eq: number[] = [], cq: number[] = []
        s.text.split("\n").forEach((raw, i) => {
            const n = i + 1
            const m = raw.trim().match(SPEAKER)
            if (!m) return
            const who = m[1].trim()
            const body = raw.trim().slice(m[0].length)
            const w = body.split(/\s+/).filter(Boolean).length
            if (who === s.expert_speaker) {
                expertW += w
                if (run.words === 0) run.from = n
                run.words += w
                if (run.words > longest.words) longest = { words: run.words, t: ti + 1, from: run.from, to: n }
                const q = (body.match(/\?/g) ?? []).length
                if (q) { qN += q; eq.push(n); if (!firstQ) firstQ = body }
                const orig = body.replace(/[^\p{L}\p{N}\s']/gu, " ").split(/\s+/).filter(Boolean)
                const toks = orig.map(x => x.toLowerCase())
                const seen = new Set<string>()
                for (let k = 0; k + 4 <= toks.length; k++) {
                    const g = toks.slice(k, k + 4)
                    if (!g.some(x => x.length >= 5)) continue
                    const key = g.join(" ")
                    if (seen.has(key)) continue
                    seen.add(key)
                    const e = grams.get(key) ?? { n: 0, shown: orig.slice(k, k + 4).join(" "), refs: new Map<number, number[]>() }
                    e.n++
                    e.refs.set(ti + 1, [...(e.refs.get(ti + 1) ?? []), n])
                    grams.set(key, e)
                }
            } else {
                otherW += w
                run = { words: 0, from: 0 }
                if (body.includes("?")) { cN++; cq.push(n) }
            }
        })
        if (eq.length) qRefs.push({ transcript: ti + 1, lines: eq })
        if (cq.length) cRefs.push({ transcript: ti + 1, lines: cq })
    })
    const out: Finding[] = []
    const all = expertW + otherW
    if (all > 0) {
        const pct = Math.round((expertW / all) * 100)
        out.push({ kind: "counted", title: d.countTalk(pct), sub: d.countTalkSub(100 - pct), refs: [] })
    }
    if (qN > 0) out.push({ kind: "counted", title: d.countQuestions(qN), sub: firstQ ? d.countFirstQ(firstQ.length > 110 ? firstQ.slice(0, 107) + "…" : firstQ) : "", refs: qRefs })
    if (longest.words >= 40) {
        const lines: number[] = []
        for (let n = longest.from; n <= longest.to; n++) lines.push(n)
        out.push({ kind: "counted", title: d.countLongest(longest.words), sub: "", refs: [{ transcript: longest.t, lines }] })
    }
    const picked: string[] = []
    for (const [key, e] of Array.from(grams.entries()).filter(([, e]) => e.n >= 2).sort((a, b) => b[1].n - a[1].n)) {
        const tk = key.split(" ")
        if (picked.some(p => p.includes(tk.slice(0, 3).join(" ")) || p.includes(tk.slice(1).join(" ")))) continue
        picked.push(key)
        out.push({ kind: "counted", title: `"${e.shown}…"`, sub: d.countRepeats(e.n), refs: Array.from(e.refs.entries()).map(([transcript, lines]) => ({ transcript, lines })) })
        if (picked.length >= 2) break
    }
    if (cN > 0) out.push({ kind: "counted", title: d.countClientQs(cN), sub: "", refs: cRefs })
    return out
}

const TAG_STYLE: Record<FindKind, { bg: string; fg: string }> = {
    phrase:    { bg: "var(--dna-glow-soft)", fg: "var(--dna-glow-text)" },
    flow:      { bg: "var(--dna-glow-soft)", fg: "var(--dna-glow-text)" },
    objection: { bg: "var(--dna-gold-soft)", fg: "var(--dna-gold)" },
    tone:      { bg: "var(--dna-tone-soft)", fg: "var(--dna-tone)" },
    counted:   { bg: "var(--dna-line)",      fg: "var(--dna-text)" },
}

/// The screen the spinner used to be. Left: the transcript, expert's lines
/// marked. Right: first what the browser counted (real, cited, shown while
/// the model works), then the model's findings one at a time as they land.
/// The scan line over the transcript is decoration and claims nothing.
/// Clicking any finding jumps the transcript to its lines.
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
    const counted = useMemo(() => countedFindings(sources, d), [sources, d])
    const found = useMemo(() => result ? findingsOf(result) : [], [result])
    const [shownC, setShownC] = useState(0)
    const [shownA, setShownA] = useState(0)
    const [words, setWords] = useState(0)
    const [tx, setTx] = useState(0)
    const [focus, setFocus] = useState<Finding | null>(null)
    const paneRef = useRef<HTMLDivElement>(null)
    const feedRef = useRef<HTMLDivElement>(null)

    // Counter: climbs toward ~90% while waiting (the model has the text, but
    // we don't know how far it is), finishes only when the result is back.
    useEffect(() => {
        const cap = result ? totalWords : Math.round(totalWords * 0.9)
        const id = setInterval(() => {
            setWords(w => w >= cap ? cap : Math.min(cap, w + Math.max(23, Math.round((cap - w) * (result ? 0.25 : 0.02)))))
        }, reduce ? 10 : 120)
        return () => clearInterval(id)
    }, [result, totalWords, reduce])

    // Counted facts: one every ~1.4 s from the start; all at once if the
    // model answers first.
    useEffect(() => {
        if (result) { setShownC(counted.length); return }
        const id = setInterval(() => setShownC(n => { if (n >= counted.length) { clearInterval(id); return n } return n + 1 }), reduce ? 10 : 1400)
        return () => clearInterval(id)
    }, [result, counted.length, reduce])

    useEffect(() => {
        if (!result) return
        setShownA(0)
        let i = 0
        const id = setInterval(() => {
            i++
            setShownA(i)
            if (i >= found.length) clearInterval(id)
        }, reduce ? 10 : 700)
        return () => clearInterval(id)
    }, [result, found.length, reduce])

    // The newest finding takes the focus: its lines light up and scroll in.
    const newest = shownA > 0 ? found[shownA - 1] : shownC > 0 ? counted[shownC - 1] : null
    useEffect(() => { if (newest) setFocus(newest) }, [newest])
    useEffect(() => {
        const el = feedRef.current
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" })
    }, [shownA, shownC, reduce])
    useEffect(() => {
        const ref = focus?.refs.find(r => sources[r.transcript - 1] && r.lines.length)
        if (!ref) return
        setTx(ref.transcript - 1)
        const first = Math.min(...ref.lines)
        requestAnimationFrame(() => {
            const pane = paneRef.current
            const row = pane?.querySelector(`[data-l="${first}"]`) as HTMLElement | null
            if (pane && row) pane.scrollTo({ top: row.offsetTop - pane.clientHeight / 3, behavior: reduce ? "auto" : "smooth" })
        })
    }, [focus, sources, reduce])

    // Lines lit in the transcript on screen: every model finding so far, plus
    // whichever finding has the focus (counted ones only light while focused).
    const lit = new Map<number, FindKind>()
    const light = (f: Finding) => { for (const r of f.refs) if (r.transcript - 1 === tx) for (const n of r.lines) if (!lit.has(n) || f.kind === "objection") lit.set(n, f.kind) }
    found.slice(0, shownA).forEach(light)
    if (focus) light(focus)

    const src = sources[tx]
    const lines = (src?.text ?? "").split("\n")
    const done = !!result && shownA >= found.length

    const card = (f: Finding, i: number) => {
        const refs = refsLabel(f.refs, sources.length, d)
        const on = focus === f
        return (
            <button key={f.kind + i} type="button" onClick={() => setFocus(f)}
                className="dna-find w-full text-left rounded-xl border px-3.5 py-3 grid gap-1.5 transition-colors"
                style={{ background: LAB.surface, borderColor: on ? LAB.glowLine : LAB.line }}>
                <span className="text-[10.5px] font-bold uppercase tracking-[.08em] px-2 py-0.5 rounded-md justify-self-start"
                    style={{ background: TAG_STYLE[f.kind].bg, color: TAG_STYLE[f.kind].fg }}>
                    {d.findTag[f.kind]}
                </span>
                <span className="text-[14px] font-semibold leading-snug">{f.title}</span>
                {f.sub && <span className="text-[13px] leading-relaxed" style={{ color: LAB.muted }}>{f.sub}</span>}
                {refs && <span className="font-mono text-[11px]" style={{ color: LAB.glowText }}>{refs}</span>}
            </button>
        )
    }

    return (
        <DnaLab>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Left: the transcript */}
                <div className="flex flex-col gap-2 min-w-0 lg:h-[600px]">
                    <div className="flex items-center gap-1.5 flex-wrap min-h-[28px]">
                        {sources.length > 1 ? sources.map((s, i) => (
                            <button key={i} onClick={() => setTx(i)} title={sourceTitle(s, i, d)}
                                className="text-xs font-semibold px-2.5 py-1 rounded-md border max-w-[16rem] truncate"
                                style={{ borderColor: i === tx ? LAB.glowLine : LAB.line, color: i === tx ? LAB.glowText : LAB.muted, background: i === tx ? LAB.glowSoft : "transparent" }}>
                                {sourceTitle(s, i, d)}
                            </button>
                        )) : (
                            <span className="text-xs font-semibold" style={{ color: LAB.muted }}>{sources[0] ? sourceTitle(sources[0], 0, d) : ""}</span>
                        )}
                    </div>
                    <div ref={paneRef} className="relative flex-1 min-h-0 max-h-[380px] lg:max-h-none rounded-xl border p-2 overflow-y-auto" style={{ background: LAB.surface, borderColor: LAB.line }}>
                        {!result && !reduce && <div className="dna-scan" />}
                        {lines.map((raw, i) => {
                            const n = i + 1
                            const m = raw.trim().match(SPEAKER)
                            if (!raw.trim()) return null
                            const who = m ? m[1].trim() : ""
                            const body = m ? raw.trim().slice(m[0].length) : raw.trim()
                            const exp = who && who === src.expert_speaker
                            const hl = lit.get(n)
                            const tint = hl === "objection" ? { bg: LAB.goldSoft, bar: LAB.gold } : hl ? { bg: LAB.glowSoft, bar: LAB.glow } : null
                            return (
                                <div key={n} data-l={n}
                                    className="grid grid-cols-[28px_64px_1fr] gap-2 px-2 py-1 rounded-md text-[13px] leading-snug transition-colors duration-300"
                                    style={tint ? { background: tint.bg, boxShadow: `inset 3px 0 0 ${tint.bar}` } : undefined}>
                                    <span className="font-mono text-[11px] pt-0.5 text-right" style={{ color: LAB.muted }}>{n}</span>
                                    <span className="font-semibold text-[12.5px] truncate" style={{ color: exp ? LAB.glowText : LAB.muted }}>{who}</span>
                                    <span>{body}</span>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Right: what was counted, then what the AI found */}
                <div className="flex flex-col gap-2 min-w-0 lg:h-[600px]">
                    <div className="flex items-baseline justify-between gap-2 min-h-[28px]">
                        <span className="font-display font-bold text-[15px] truncate">{d.readingName(name)}</span>
                        <span className="font-mono text-[11.5px] tabular-nums whitespace-nowrap" style={{ color: LAB.muted }}>
                            {words.toLocaleString(intl)} / {totalWords.toLocaleString(intl)} {d.wordsUnit}
                        </span>
                    </div>
                    <div ref={feedRef} className="flex-1 min-h-0 overflow-y-auto grid gap-2 content-start pr-0.5">
                        {shownC > 0 && <p className="text-xs font-semibold uppercase tracking-[.08em] pt-1" style={{ color: LAB.muted }}>{d.countedHead}</p>}
                        {counted.slice(0, shownC).map(card)}
                        {!result && (
                            <div className="rounded-xl border border-dashed px-3.5 py-3 flex items-center gap-2.5" style={{ borderColor: LAB.line }}>
                                <span className="w-2 h-2 rounded-full animate-pulse flex-shrink-0" style={{ background: LAB.glow }} />
                                <span className="text-[13px]" style={{ color: LAB.muted }}>{d.readingWait}</span>
                            </div>
                        )}
                        {result && <p className="text-xs font-semibold uppercase tracking-[.08em] pt-2" style={{ color: LAB.glowText }}>{d.aiFoundHead}</p>}
                        {found.slice(0, shownA).map(card)}
                    </div>
                    {done && (
                        <button onClick={onOpenProfile} className="w-full px-4 py-3 rounded-lg text-sm font-bold"
                            style={{ background: LAB.cta, color: LAB.ctaInk }}>
                            {d.openProfile(name)}
                        </button>
                    )}
                </div>
            </div>
        </DnaLab>
    )
}

/// Consecutive line numbers collapsed into ranges: [5,6,7,9] → ["5–7","9"].
function lineRanges(ns: number[]): string[] {
    const s = Array.from(new Set(ns)).sort((a, b) => a - b)
    const out: string[] = []
    for (let i = 0; i < s.length;) {
        let j = i
        while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++
        out.push(i === j ? `${s[i]}` : `${s[i]}–${s[j]}`)
        i = j + 1
    }
    return out.length > 4 ? [...out.slice(0, 4), "…"] : out
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function refsLabel(refs: DnaEvidence[], nSources: number, d: any): string {
    const by = new Map<number, number[]>()
    for (const r of refs) if (Array.isArray(r.lines) && r.lines.length) by.set(r.transcript, [...(by.get(r.transcript) ?? []), ...r.lines])
    if (by.size === 0) return ""
    if (nSources <= 1) return d.linesRef(lineRanges(Array.from(by.values()).flat()))
    return Array.from(by.entries()).sort((a, b) => a[0] - b[0])
        .map(([tn, ls]) => d.refCall(tn, d.linesRef(lineRanges(ls)).toLowerCase())).join(" · ")
}

// ─── 3 · Profile ─────────────────────────────────────────────────────────────

/// "See it in the transcript": the cited lines, in the page's own skin, one
/// row per line (number · speaker · words), a "⋯" where cited lines skip
/// ahead. Absent citations (analyses from before D-459) render nothing.
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
                {open ? d.hideEvidence : `${d.seeInTranscript} · ${refsLabel(refs, sources.length, d)}`}
            </button>
            {open && (
                <div className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] py-1.5 space-y-2">
                    {refs.map((r, i) => {
                        const src = sources[r.transcript - 1]
                        const all = src.text.split("\n")
                        const ns = Array.from(new Set(r.lines)).filter(n => n >= 1 && n <= all.length).sort((a, b) => a - b).slice(0, 10)
                        return (
                            <div key={i}>
                                {sources.length > 1 && <p className="px-3 pb-1 text-[11px] font-semibold text-[var(--color-muted)]">{sourceTitle(src, r.transcript - 1, d)}</p>}
                                {ns.map((n, k) => {
                                    const raw = all[n - 1].trim()
                                    const m = raw.match(SPEAKER)
                                    const who = m ? m[1].trim() : ""
                                    const exp = who === src.expert_speaker
                                    return (
                                        <div key={n}>
                                            {k > 0 && n > ns[k - 1] + 1 && <p className="px-3 text-[11px] text-[var(--color-muted)] leading-none py-0.5">⋯</p>}
                                            <div className="grid grid-cols-[32px_64px_1fr] gap-2 px-3 py-1 text-[13px] leading-snug">
                                                <span className="font-mono text-[11px] text-right text-[var(--color-muted)] pt-0.5">{n}</span>
                                                <span className={`font-semibold text-[12.5px] truncate ${exp ? "text-[var(--color-accent-deep)]" : "text-[var(--color-muted)]"}`}>{who}</span>
                                                <span className="text-[var(--color-text)]">{m ? raw.slice(m[0].length) : raw}</span>
                                            </div>
                                        </div>
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
                    <p className="font-display text-xl font-extrabold text-[var(--color-text)] truncate">{name}</p>
                    <p className="text-[13px] text-[var(--color-muted)]">{meta}</p>
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
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3">
            <p className="text-xs font-semibold text-[var(--color-muted)]">{label}</p>
            <p className="font-display text-2xl font-extrabold text-[var(--color-text)] tabular-nums">
                {value}{small && <small className="text-xs font-medium text-[var(--color-muted)] ml-1">{small}</small>}
            </p>
            {note && <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{note}</p>}
        </div>
    )
}

/// A profile section: a plain heading with its count, then its content.
export function DnaSection({ title, count, sub, children }: { title: string; count?: string; sub?: string; children: React.ReactNode }) {
    return (
        <section className="space-y-3 pt-5 border-t border-[var(--color-line-soft)]">
            <div className="flex items-baseline justify-between gap-3">
                <div>
                    <h4 className="font-display text-base font-bold text-[var(--color-text)]">{title}</h4>
                    {sub && <p className="text-xs text-[var(--color-muted)] mt-0.5">{sub}</p>}
                </div>
                {count && <span className="text-xs font-semibold text-[var(--color-muted)] whitespace-nowrap">{count}</span>}
            </div>
            {children}
        </section>
    )
}

/// How a call runs, as a numbered vertical timeline: one stage per row, full
/// width, so long descriptions read as sentences instead of narrow columns.
export function DnaStrand({ stages, sources }: { stages: DnaResultView["conversation_flow"]["stages"]; sources: DnaSource[] }) {
    const { t } = useLocale()
    const d = t.tabs.dna
    if (!stages.length) return null
    return (
        <ol className="relative">
            {stages.map((s, i) => (
                <li key={i} className="grid grid-cols-[32px_1fr] gap-3.5 pb-5 last:pb-0 relative">
                    {i < stages.length - 1 && <span className="absolute left-[15px] top-8 bottom-0 w-px bg-[var(--color-border)]" />}
                    <span className="w-8 h-8 rounded-full grid place-items-center text-sm font-bold bg-[var(--color-accent-subtle)] text-[var(--color-accent-deep)] relative">{i + 1}</span>
                    <div className="space-y-1.5 min-w-0 pt-1 max-w-3xl">
                        <p className="font-display font-bold text-[15px] text-[var(--color-text)] leading-snug">{s.name}</p>
                        <p className="text-[14px] leading-relaxed text-[var(--color-text-secondary)]">{s.description}</p>
                        {s.transition_signal && (
                            <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
                                <span className="font-semibold text-[var(--color-text)]">{d.movesOnLabel} </span>{s.transition_signal}
                            </p>
                        )}
                        <DnaEvidenceLink evidence={s.evidence} sources={sources} />
                    </div>
                </li>
            ))}
        </ol>
    )
}

/// One objection: what the client says, and how this person answers — as two
/// labeled columns, so the pair reads at a glance.
export function DnaObjectionRow({ said, answer, evidence, sources }: { said: string; answer: string; evidence?: DnaEvidence[]; sources: DnaSource[] }) {
    const { t } = useLocale()
    const d = t.tabs.dna
    return (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 grid gap-3">
            <div className="grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 md:gap-5">
                <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[.08em] mb-1" style={{ color: "var(--dna-gold)" }}>{d.objSaidLabel}</p>
                    <p className="text-[14.5px] font-semibold leading-snug text-[var(--color-text)]">"{said}"</p>
                </div>
                <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[.08em] text-[var(--color-accent-deep)] mb-1">{d.objAnswerLabel}</p>
                    <p className="text-[14px] leading-relaxed text-[var(--color-text-secondary)]">{answer}</p>
                </div>
            </div>
            <DnaEvidenceLink evidence={evidence} sources={sources} />
        </div>
    )
}

/// One phrase they repeat: the words big, then what it's for.
export function DnaPhraseCard({ phrase, why, evidence, sources }: { phrase: string; why: string; evidence?: DnaEvidence[]; sources: DnaSource[] }) {
    const { t } = useLocale()
    const d = t.tabs.dna
    return (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 grid gap-2 content-start">
            <p className="text-[15px] font-semibold leading-snug text-[var(--color-text)] border-l-[3px] border-[var(--color-accent)] pl-3">"{phrase}"</p>
            {why && <p className="text-[13.5px] leading-relaxed text-[var(--color-text-secondary)]"><span className="font-semibold text-[var(--color-text)]">{d.phraseWhyLabel} </span>{why}</p>}
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
