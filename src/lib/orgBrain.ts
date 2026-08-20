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
