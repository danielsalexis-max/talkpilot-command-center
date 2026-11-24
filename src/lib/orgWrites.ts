import type { SupabaseClient } from "@supabase/supabase-js"

/// Shared org writes used by both the Command Center (browser client) and the
/// MCP connector (the user's JWT). One implementation each, so a playbook
/// switched on from Claude behaves exactly like one switched on in the
/// Command Center (D-1049).

/// A7 (REQ-19): append one row to the workspace audit log. RLS lets owners,
/// admins and managers append rows as themselves. Never throws: a missing
/// audit row must not undo or hide the change it describes.
export async function writeAudit(
    sb: SupabaseClient,
    orgId: string,
    action: string,
    target: string | null,
    meta: Record<string, unknown> = {},
    actorId?: string,
): Promise<void> {
    try {
        let actor = actorId ?? null
        if (!actor) {
            const { data } = await sb.auth.getSession()
            actor = data.session?.user.id ?? null
        }
        await sb.from("org_audit_log").insert({ org_id: orgId, actor_id: actor, action, target, meta })
    } catch { /* never break the write it describes */ }
}

export type PlaybookStatus = "draft" | "active" | "archived"

/// Sets a playbook's status. Several playbooks may be active at once (they
/// are scoped, D-192); what must stay unique is the workspace default: the
/// active playbook with no assignments, which `get_org_context` falls back to
/// for anyone unmatched. So activating an unassigned playbook moves other
/// unassigned active ones back to draft. Returns the ids it demoted.
export async function setPlaybookStatus(
    sb: SupabaseClient,
    orgId: string,
    id: string,
    status: PlaybookStatus,
): Promise<{ error: string | null; demoted: string[] }> {
    let demoted: string[] = []
    if (status === "active") {
        const { data: mine } = await sb
            .from("org_playbook_assignments").select("playbook_id").eq("playbook_id", id).limit(1)
        if ((mine ?? []).length === 0) {
            const [{ data: actives }, { data: assigned }] = await Promise.all([
                sb.from("org_playbooks").select("id").eq("org_id", orgId).eq("status", "active"),
                sb.from("org_playbook_assignments").select("playbook_id").eq("org_id", orgId),
            ])
            const assignedIds = new Set((assigned ?? []).map(a => a.playbook_id as string))
            demoted = (actives ?? []).map(a => a.id as string).filter(pid => pid !== id && !assignedIds.has(pid))
            if (demoted.length > 0) {
                const { error } = await sb.from("org_playbooks").update({ status: "draft" }).in("id", demoted)
                if (error) return { error: error.message, demoted: [] }
            }
        }
    }
    const { error } = await sb.from("org_playbooks").update({ status }).eq("id", id).eq("org_id", orgId)
    return { error: error?.message ?? null, demoted }
}

/// Audit action for a status change.
export function playbookStatusAction(status: PlaybookStatus): string {
    return status === "active" ? "playbook.activated" : status === "archived" ? "playbook.archived" : "playbook.deactivated"
}
