import { createBrowserClient } from "@supabase/ssr"

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Browser singleton — all dashboard reads go through RLS (user JWT, no service role)
export const supabase = createBrowserClient(supabaseUrl, supabaseAnon)

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
