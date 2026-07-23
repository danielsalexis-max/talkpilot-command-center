import { createBrowserClient } from "@supabase/ssr"

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Browser singleton — all dashboard reads go through RLS (user JWT, no service role)
export const supabase = createBrowserClient(supabaseUrl, supabaseAnon)

// ── Ask (Haiku via claude-proxy) ─────────────────────────────────────────────
// The context passed here is always data the manager can already see on the
// page (RLS-gated), so sending it to Haiku exposes nothing new.
export type ChatTurn = { role: "user" | "assistant"; content: string }

/** Low-level: the caller supplies the full system prompt (persona + context). */
export async function askClaude(
    system: string,
    question: string,
    history: ChatTurn[] = [],
): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${supabaseUrl}/functions/v1/claude-proxy`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${session?.access_token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 800,
            system,
            messages: [...history, { role: "user", content: question }],
        }),
    })
    if (!res.ok) throw new Error(`Assistant error: ${res.status}`)
    const data = await res.json()
    return data?.content?.[0]?.text?.trim() || "(no answer)"
}

export function askAboutTranscript(transcriptText: string, question: string, history: ChatTurn[] = []) {
    const system =
        "You are a sharp sales-coaching analyst answering a manager's questions about ONE call transcript. " +
        "Answer only from the transcript below — if the answer isn't in it, say so plainly. Be concise and specific, " +
        "quote short snippets when helpful, and don't invent details.\n\nTRANSCRIPT:\n" + transcriptText
    return askClaude(system, question, history)
}

// ── Scorecard types ──────────────────────────────────────────────────────────

export interface Scorecard {
    id: string
    org_id: string
    user_id: string
    session_source: "plus_conversations" | "sessions"
    session_id: string
    playbook_id: string | null
    started_at: string | null
    duration_minutes: number | null
    talk_ratio: number | null
    overall_score: number | null
    adherence_score: number | null
    objection_score: number | null
    accuracy_score: number | null
    adherence: Record<string, StageResult>
    highlights: Highlight[]
    growth_areas: string[]
    guardrail_breaches: GuardrailBreach[]
    model_version: string | null
    status: "pending" | "scored" | "failed"
    created_at: string
    session_title: string | null
    // joined
    user_email?: string
    user_name?: string
}

export interface StageResult {
    completed: boolean
    evidence: string
    missed: string[]
}

export interface Highlight {
    ts: string
    label: string
    kind: "best" | "worst" | "flag"
}

export interface GuardrailBreach {
    rule: string
    severity: "normal" | "critical"
    transcript_quote: string
    transcript_ts: string
}

export interface ScorecardObjection {
    id: string
    objection_text: string
    response_excerpt: string
    grade: "excellent" | "adequate" | "off_script" | "missed"
    grade_rationale: string
    transcript_ts: string
    matched_objection_id: string | null
}

export interface ScorecardClaim {
    id: string
    claim: string
    verdict: "verified" | "unverifiable" | "contradicts"
    kb_reference: string | null
    kb_excerpt: string | null
    transcript_ts: string | null
}

export interface OrgMember {
    user_id: string
    role: "owner" | "admin" | "manager" | "member"
    joined_at: string
    user_email?: string
    user_name?: string
    team_name?: string
}

export interface TeamStats {
    user_id: string
    user_name?: string
    user_email?: string
    team_name?: string
    session_count: number
    avg_overall: number | null
    avg_adherence: number | null
    avg_objection: number | null
    avg_accuracy: number | null
}
