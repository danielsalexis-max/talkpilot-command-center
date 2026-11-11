import type { Scorecard, StageResult } from "@/lib/supabase"

/// "What do I do this week?" (D-929). Home answers it from three things the
/// scorer already stores, nothing new: per rep one growth area tied to a moment
/// of a call, the objections the team loses most, and calls whose playbook
/// closing step was missed. Pure functions so the page stays readable.

export interface WeekObjectionRow {
    scorecard_id: string
    user_id: string
    objection_id: string | null
    objection_text: string
    grade: string
    transcript_ts: string | null
}

export interface PlaybookStages {
    id: string
    stages: Array<{ key?: string; name?: string }> | null
}

export interface SkillPick {
    userId: string
    calls: number
    card: Scorecard | null
    headline: string | null
    detail: string | null
    full: string | null
    moment: string | null
}

export interface LostObjection {
    key: string
    text: string
    fromLibrary: boolean
    lost: number
    raised: number
    latest: { scorecardId: string; userId: string; ts: string | null; startedAt: string | null }
    reps: Set<string>
}

export interface NoNextStep {
    card: Scorecard
    stageName: string
    missed: string[]
    moment: string | null
}

const DAY = 86400e3

/// Only scored sales calls count (D-917): `status = scored` already means
/// triage called it a sales call; a null call_type is a call scored before
/// triage existed, graded as a sales call like every call was then.
export function countedCards(cards: Scorecard[]): Scorecard[] {
    return cards.filter(c =>
        c.status === "scored" && !c.excluded_at && (c.call_type == null || c.call_type === "sales"))
}

/// Last 7 days, or the last 30 when the week is empty.
export function pickWindow(cards: Scorecard[], now = Date.now()): { days: 7 | 30; cards: Scorecard[] } {
    const week = cards.filter(c => c.started_at && new Date(c.started_at).getTime() >= now - 7 * DAY)
    if (week.length > 0) return { days: 7, cards: week }
    return { days: 30, cards: cards.filter(c => c.started_at && new Date(c.started_at).getTime() >= now - 30 * DAY) }
}

/// The scorer reads the transcript as numbered turns ("[12] Me: ...") and
/// writes moments as turn refs: "68-74", "96", sometimes "[73-74]" inside a
/// sentence. Returns the first ref as "from" or "from-to", or null.
export function firstTurnRef(text: string | null | undefined): string | null {
    if (!text) return null
    const m = String(text).match(/\[?\s*(\d{1,4})\s*(?:[-–]\s*(\d{1,4}))?\s*\]?/)
    if (!m) return null
    return m[2] ? `${m[1]}-${m[2]}` : m[1]
}

/// Same, but only refs written in brackets ("[73-74]"), so a number that is
/// part of a sentence ("3 sucursales") is never read as a moment.
export function bracketTurnRef(text: string | null | undefined): string | null {
    if (!text) return null
    const m = String(text).match(/\[\s*(\d{1,4})\s*(?:[-–]\s*(\d{1,4}))?\s*\]/)
    if (!m) return null
    return m[2] ? `${m[1]}-${m[2]}` : m[1]
}

const STOP = new Set([
    // en
    "that", "this", "with", "from", "they", "their", "them", "when", "what", "into", "about", "always",
    "never", "should", "would", "could", "before", "after", "every", "call", "calls", "customer", "client",
    "rep", "reps", "have", "more", "than", "then", "also", "just", "only", "make", "sure",
    // es
    "para", "como", "pero", "cuando", "antes", "despues", "debe", "debio", "siempre", "nunca", "cliente",
    "llamada", "llamadas", "esta", "este", "esto", "estos", "estas", "sobre", "entre", "desde", "hasta",
    "porque", "tiene", "hacer", "cada", "todo", "toda", "todos", "algun", "alguna", "ningun", "ninguna",
    "solo", "sino", "tambien", "donde", "quien", "cual", "unas", "unos", "mismo", "misma", "frente",
])

function tokens(s: string): Set<string> {
    return new Set(
        s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
            .split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !STOP.has(w)),
    )
}

/// The moment where a growth area showed: a turn ref written in the growth
/// area itself, else the low moment (worst / flag) that shares the most words
/// with it. No shared words means no honest link, so null.
export function momentForGrowthArea(card: Scorecard, area: string): string | null {
    const own = bracketTurnRef(area)
    if (own) return own
    const want = tokens(area)
    let best: { ts: string; score: number } | null = null
    for (const h of card.highlights ?? []) {
        if (h.kind !== "worst" && h.kind !== "flag") continue
        const have = tokens(h.label ?? "")
        let score = 0
        for (const w of want) if (have.has(w)) score++
        if (score > 0 && (!best || score > best.score)) best = { ts: h.ts, score }
    }
    return best ? firstTurnRef(best.ts) : null
}

/// "Descubrimiento antes de la demo: el rep debe..." → headline + detail.
export function splitGrowthArea(text: string): { headline: string; detail: string | null } {
    const i = text.indexOf(":")
    if (i > 3 && i <= 90) {
        const rest = text.slice(i + 1).trim()
        return { headline: text.slice(0, i).trim(), detail: rest ? rest[0].toUpperCase() + rest.slice(1) : null }
    }
    return { headline: text.trim(), detail: null }
}

/// One skill per rep: the first growth area of their weakest call in the
/// window (lowest overall; the most recent on a tie). The grader lists growth
/// areas most important first.
export function skillPerRep(cards: Scorecard[], userIds: string[]): SkillPick[] {
    return userIds.map(userId => {
        const mine = cards.filter(c => c.user_id === userId)
        const withAreas = mine.filter(c => (c.growth_areas ?? []).some(g => g && g.trim()))
            .sort((a, b) => {
                const sa = a.overall_score ?? 101, sb = b.overall_score ?? 101
                if (sa !== sb) return sa - sb
                return new Date(b.started_at ?? 0).getTime() - new Date(a.started_at ?? 0).getTime()
            })
        const card = withAreas[0] ?? null
        const full = card ? (card.growth_areas.find(g => g && g.trim()) ?? null) : null
        const split = full ? splitGrowthArea(full) : null
        return {
            userId, calls: mine.length, card,
            headline: split?.headline ?? null, detail: split?.detail ?? null, full,
            moment: card && full ? momentForGrowthArea(card, full) : null,
        }
    })
}

const LOST = new Set(["missed", "off_script"])

function normText(s: string): string {
    return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()
}

/// Objections lost (missed or off script), grouped by the library objection
/// when the scorer matched one, else by the objection's own words.
export function lostObjections(
    rows: WeekObjectionRow[],
    cards: Scorecard[],
    library: Map<string, string>,
): LostObjection[] {
    const startedAt = new Map(cards.map(c => [c.id, c.started_at]))
    const groups = new Map<string, Omit<LostObjection, "latest"> & { latest: LostObjection["latest"] | null }>()
    for (const r of rows) {
        if (!startedAt.has(r.scorecard_id)) continue
        const libText = r.objection_id ? library.get(r.objection_id) : undefined
        const key = r.objection_id && libText ? `lib:${r.objection_id}` : `txt:${normText(r.objection_text ?? "")}`
        if (key === "txt:") continue
        let g = groups.get(key)
        if (!g) {
            g = { key, text: libText ?? r.objection_text, fromLibrary: !!libText, lost: 0, raised: 0, latest: null, reps: new Set() }
            groups.set(key, g)
        }
        g.raised++
        if (!LOST.has(r.grade)) continue
        g.lost++
        g.reps.add(r.user_id)
        const at = startedAt.get(r.scorecard_id) ?? null
        if (!g.latest || (at != null && (g.latest.startedAt == null || at > g.latest.startedAt))) {
            g.latest = { scorecardId: r.scorecard_id, userId: r.user_id, ts: r.transcript_ts, startedAt: at }
        }
    }
    return Array.from(groups.values())
        .filter((g): g is LostObjection => g.lost > 0 && g.latest != null)
        .sort((a, b) => b.lost - a.lost || b.lost / b.raised - a.lost / a.raised)
}

const CLOSING = /next|siguiente|cierre|cerrar|close|closing|fecha|decisi|follow|seguimiento|proximo|próximo/i

/// The stage that stands for "the call ended with a next step": the last
/// playbook stage whose name says so (next step, cierre, fecha...), else the
/// playbook's last stage. Matched to stage_results the way the scorer does
/// (key, then name, case-insensitive).
export function closingStage(pb: PlaybookStages | undefined): { key: string; name: string } | null {
    const stages = (pb?.stages ?? []).filter(s => s && (s.key || s.name))
    if (!stages.length) return null
    const named = [...stages].reverse().find(s => CLOSING.test(`${s.key ?? ""} ${s.name ?? ""}`))
    const s = named ?? stages[stages.length - 1]
    return { key: String(s.key ?? s.name ?? ""), name: String(s.name ?? s.key ?? "") }
}

function stageResult(card: Scorecard, stage: { key: string; name: string }): StageResult | null {
    const byKey = new Map<string, StageResult>()
    for (const [k, v] of Object.entries(card.adherence ?? {})) {
        if (v && typeof v === "object") byKey.set(k.trim().toLowerCase(), v as StageResult)
    }
    return byKey.get(stage.key.trim().toLowerCase()) ?? byKey.get(stage.name.trim().toLowerCase()) ?? null
}

/// Calls whose closing stage the scorer marked not completed. Calls with no
/// playbook, or where that stage was not graded or did not apply (D-917), are
/// not judged at all: `checked` counts only the ones that were.
export function callsWithoutNextStep(
    cards: Scorecard[],
    playbooks: Map<string, PlaybookStages>,
): { items: NoNextStep[]; checked: number } {
    const items: NoNextStep[] = []
    let checked = 0
    for (const c of cards) {
        if (!c.playbook_id) continue
        const stage = closingStage(playbooks.get(c.playbook_id))
        if (!stage) continue
        const r = stageResult(c, stage)
        if (!r || r.not_applicable) continue
        checked++
        if (r.completed) continue
        items.push({
            card: c, stageName: stage.name,
            missed: (r.missed ?? []).filter(Boolean),
            moment: bracketTurnRef(r.evidence) ?? "end",
        })
    }
    items.sort((a, b) => new Date(b.card.started_at ?? 0).getTime() - new Date(a.card.started_at ?? 0).getTime())
    return { items, checked }
}

export function momentHref(scorecardId: string, moment: string | null): string {
    return moment ? `/scorecard/${scorecardId}?at=${encodeURIComponent(moment)}` : `/scorecard/${scorecardId}`
}

export function practiceHref(p: { assignee?: string | null; note?: string | null; from?: string | null }): string {
    const q = new URLSearchParams()
    if (p.assignee) q.set("assignee", p.assignee)
    if (p.note) q.set("note", p.note.slice(0, 300))
    if (p.from) q.set("from", p.from)
    const s = q.toString()
    return s ? `/practice?${s}` : "/practice"
}
