import { supabase } from "@/lib/supabase"

/// Calls into the org "brain" — the ingest-knowledge edge function that turns
/// what an admin writes in the Command Center into something the live coach can
/// actually retrieve.
///
/// Why this exists: objections used to be inserted straight into org_objections
/// and never embedded. `match_org_objections` filters on `embedding is not null`,
/// so every objection an org created was invisible to objection-lookup — the
/// feature looked configured and never fired once. Every write path now routes
/// through here.

async function callIngest(body: Record<string, unknown>): Promise<Response | null> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return null
    return fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ingest-knowledge`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
    })
}

/// Embed objections so they can be matched mid-call. Best-effort: a failure here
/// must not lose the admin's edit, which is already saved — the Objections tab
/// surfaces "not searchable yet" and offers a re-index instead.
export async function embedObjections(orgId: string, ids: string[]): Promise<{ embedded: number; failed: number }> {
    if (ids.length === 0) return { embedded: 0, failed: 0 }
    try {
        const res = await callIngest({ org_id: orgId, objection_ids: ids })
        if (!res || !res.ok) return { embedded: 0, failed: ids.length }
        const json = await res.json().catch(() => ({}))
        return { embedded: json.embedded ?? 0, failed: json.failed ?? 0 }
    } catch {
        return { embedded: 0, failed: ids.length }
    }
}

/// Re-embed every objection in the org that has no embedding yet. This is the
/// repair path for libraries created before embedding was wired up.
export async function reindexObjections(orgId: string): Promise<{ embedded: number; failed: number; pending: number }> {
    const { data } = await supabase.from("org_objections")
        .select("id").eq("org_id", orgId).is("embedding", null)
    const ids = (data ?? []).map(r => r.id as string)
    if (ids.length === 0) return { embedded: 0, failed: 0, pending: 0 }
    const r = await embedObjections(orgId, ids)
    return { ...r, pending: ids.length }
}

/// Create a knowledge document from text the browser already has and ingest it
/// in one call (chunk → embed → summarise).
export async function ingestKnowledgeInline(
    orgId: string, title: string, kind: string, content: string,
): Promise<string | null> {
    const res = await callIngest({ org_id: orgId, title, kind, content })
    if (!res) return "Your session expired — sign in again and retry."
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return typeof json?.error?.message === "string" ? json.error.message : res.statusText
    if (json?.status === "failed") return typeof json.error === "string" ? json.error : "Ingest failed."
    return null
}

/// Re-run ingestion for one existing document (used to repair docs whose chunks
/// were never built).
export async function reindexKnowledge(orgId: string, knowledgeId: string): Promise<string | null> {
    const res = await callIngest({ org_id: orgId, knowledge_id: knowledgeId })
    if (!res) return "Your session expired — sign in again and retry."
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return typeof json?.error?.message === "string" ? json.error.message : res.statusText
    if (json?.status === "failed") return typeof json.error === "string" ? json.error : "Re-index failed."
    return null
}

/// The Command Center writes an admin's answer as `response_guidance` (a plain
/// textarea); the coaching runtime and match_org_objections read
/// `approved_responses` (jsonb). Both are written on every save so the two
/// halves of the feature stay in sync, and either can be read back.
export function approvedResponsesFrom(guidance: string | null | undefined): { text: string }[] {
    const t = (guidance ?? "").trim()
    return t ? [{ text: t }] : []
}

export function guidanceOf(row: {
    response_guidance?: string | null
    approved_responses?: { text?: string }[] | null
}): string | null {
    if (row.response_guidance && row.response_guidance.trim()) return row.response_guidance
    const first = row.approved_responses?.[0]?.text
    return first && first.trim() ? first : null
}

/// `org_objections.severity` accepts exactly two values — the CHECK constraint
/// is `('normal','critical')`. Everything that writes an objection has to pass
/// through here (D-190).
///
/// Three writers disagreed with the database and all three failed: the manual
/// "add objection" form defaulted to `"medium"`, the bulk import fell back to
/// `"medium"`, and `extract-content` asked the model for `low|medium|high|
/// critical`. Only the starter kits were fixed when this bit us the first time
/// (D-171), so in production *no objection had ever been created* through the
/// form or the importer — the insert died on a raw constraint violation that
/// surfaced to the admin as a database error string.
///
/// Anything that is not explicitly critical is normal: an objection's severity
/// only decides how loudly the coach flags it, and guessing "critical" wrong is
/// worse than guessing "normal" wrong.
export function normalizeSeverity(raw: string | null | undefined): "normal" | "critical" {
    return (raw ?? "").trim().toLowerCase() === "critical" ? "critical" : "normal"
}

/// The ingest function reports `knowledge_id` and `chunk_count` on success.
/// The original helpers above collapse that to error-or-null; these keep it,
/// so the UI can say "N chunks indexed" (a verifiable claim) instead of a
/// generic "done", and the edit flow can find the row an inline ingest created.
export interface IngestOutcome {
    error: string | null
    knowledgeId: string | null
    chunkCount: number | null
}

async function ingestOutcome(body: Record<string, unknown>): Promise<IngestOutcome> {
    const none = { knowledgeId: null, chunkCount: null }
    try {
        const res = await callIngest(body)
        if (!res) return { error: "Your session expired — sign in again and retry.", ...none }
        const json = await res.json().catch(() => ({}))
        if (!res.ok) return { error: typeof json?.error?.message === "string" ? json.error.message : res.statusText, ...none }
        if (json?.status === "failed") return { error: typeof json.error === "string" ? json.error : "Ingest failed.", ...none }
        return {
            error:       null,
            knowledgeId: typeof json.knowledge_id === "string" ? json.knowledge_id : null,
            chunkCount:  typeof json.chunk_count === "number" ? json.chunk_count : null,
        }
    } catch (e) {
        return { error: e instanceof Error ? e.message : String(e), ...none }
    }
}

export function ingestKnowledgeInlineVerbose(
    orgId: string, title: string, kind: string, content: string,
): Promise<IngestOutcome> {
    return ingestOutcome({ org_id: orgId, title, kind, content })
}

export function reindexKnowledgeVerbose(orgId: string, knowledgeId: string): Promise<IngestOutcome> {
    return ingestOutcome({ org_id: orgId, knowledge_id: knowledgeId })
}
