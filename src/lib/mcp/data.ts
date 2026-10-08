/// TalkPilot MCP (D-538) — decoding helpers for what PostgREST hands back.

/// `plus_conversations.transcript_json` / `action_items_json` are bytea.
/// PostgREST returns bytea as `\x<hex>`; inside, newer rows hold the JSON
/// itself and older rows hold base64 of it (same two cases
/// get_scorecard_transcript handles).
export function decodeBytea(v: unknown): unknown {
    if (v == null) return null
    let text: string
    if (typeof v === "string" && v.startsWith("\\x")) {
        text = Buffer.from(v.slice(2), "hex").toString("utf8")
    } else if (typeof v === "string") {
        text = v
    } else {
        return v
    }
    return parseJsonOrBase64(text)
}

export function parseJsonOrBase64(text: string | null | undefined): unknown {
    if (!text) return null
    const t = text.trim()
    if (t.startsWith("[") || t.startsWith("{")) {
        try { return JSON.parse(t) } catch { return null }
    }
    try {
        const inner = Buffer.from(t, "base64").toString("utf8").trim()
        if (inner.startsWith("[") || inner.startsWith("{")) return JSON.parse(inner)
    } catch { /* fall through */ }
    return null
}

type Line = { speaker?: string; text?: string; timestamp?: number }

/// "[mm:ss] You: …" lines, timed from the first line. `speaker` is
/// self | others | unknown on every client.
export function formatTranscript(raw: unknown, maxChars: number): { text: string; truncated: boolean; lines: number } {
    const arr = Array.isArray(raw) ? (raw as Line[]) : []
    const lines = arr.filter(l => typeof l?.text === "string" && l.text.trim())
    if (lines.length === 0) return { text: "", truncated: false, lines: 0 }
    const t0 = typeof lines[0].timestamp === "number" ? lines[0].timestamp : null
    const out: string[] = []
    let size = 0
    let truncated = false
    for (const l of lines) {
        const who = l.speaker === "self" ? "You" : l.speaker === "others" ? "Them" : "Speaker"
        let stamp = ""
        if (t0 != null && typeof l.timestamp === "number") {
            const s = Math.max(0, Math.round(l.timestamp - t0))
            stamp = `[${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}] `
        }
        const row = `${stamp}${who}: ${l.text!.trim()}`
        if (size + row.length + 1 > maxChars) { truncated = true; break }
        out.push(row)
        size += row.length + 1
    }
    return { text: out.join("\n"), truncated, lines: lines.length }
}

export function minutesBetween(a?: string | null, b?: string | null): number | null {
    if (!a || !b) return null
    const m = (new Date(b).getTime() - new Date(a).getTime()) / 60000
    return Number.isFinite(m) && m >= 0 ? Math.round(m) : null
}

/// Strip characters PostgREST's `or=(…)` filter grammar treats as syntax, so a
/// search phrase can never change the shape of the filter.
export function safeSearch(q: string): string {
    return q.replace(/[,()*%\\:"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120)
}
