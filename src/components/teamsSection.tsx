"use client"

import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useLocale } from "@/i18n/LocaleProvider"

/// Create teams and put people in them.
///
/// `org_teams` and `org_members.team_id` have existed since the schema was
/// written, and three separate features read them — the practice-assignment
/// picker, the voice-profile overlay, and (since D-192) playbook scoping. None
/// of them could ever fire, because **nothing in the product created a team**.
/// The practice tab's team dropdown has been rendering an empty list this whole
/// time. This is that missing writer.

interface TeamRow   { id: string; name: string }
interface PersonRow { user_id: string; email: string | null; team_id: string | null; role: string; status: string }

const INPUT = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
const BTN_GHOST = "px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
const BTN_PRIMARY = "px-3.5 py-2 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] disabled:opacity-40 text-[var(--btn-ink)] text-xs font-semibold rounded-lg transition-colors"

export function TeamsSection({ orgId, onChanged }: { orgId: string; onChanged?: () => void }) {
    const t = useLocale().t
    const [teams, setTeams]     = useState<TeamRow[]>([])
    const [people, setPeople]   = useState<PersonRow[]>([])
    const [newName, setNewName] = useState("")
    const [busy, setBusy]       = useState(false)
    const [error, setError]     = useState<string | null>(null)

    const load = useCallback(async () => {
        const [{ data: teamRows }, { data: memberRows }] = await Promise.all([
            supabase.from("org_teams").select("id, name").eq("org_id", orgId).order("name"),
            supabase.from("org_members").select("user_id, team_id, role, status").eq("org_id", orgId),
        ])
        const emails = await supabase.rpc("get_org_members_with_email", { p_org: orgId })
        const emailById = new Map<string, string | null>(
            ((emails.data ?? []) as { user_id: string; email: string | null }[]).map(m => [m.user_id, m.email])
        )
        setTeams((teamRows ?? []) as TeamRow[])
        setPeople(((memberRows ?? []) as PersonRow[])
            .filter(m => m.status === "active" || !m.status)
            .map(m => ({ ...m, email: emailById.get(m.user_id) ?? null })))
    }, [orgId])

    useEffect(() => { load() }, [load])

    async function createTeam() {
        const name = newName.trim()
        if (!name) return
        setBusy(true); setError(null)
        const { error } = await supabase.from("org_teams").insert({ org_id: orgId, name })
        setBusy(false)
        if (error) { setError(error.message); return }
        setNewName("")
        await load(); onChanged?.()
    }

    async function renameTeam(id: string, name: string) {
        const trimmed = name.trim()
        if (!trimmed) return
        await supabase.from("org_teams").update({ name: trimmed }).eq("id", id)
        await load(); onChanged?.()
    }

    async function deleteTeam(id: string) {
        setBusy(true); setError(null)
        // Members first: `org_members.team_id` has no ON DELETE behaviour we can
        // rely on, and a dangling team_id makes get_org_context() resolve a
        // team overlay that no longer exists.
        await supabase.from("org_members").update({ team_id: null }).eq("org_id", orgId).eq("team_id", id)
        await supabase.from("org_playbook_assignments").delete().eq("team_id", id)
        const { error } = await supabase.from("org_teams").delete().eq("id", id)
        setBusy(false)
        if (error) { setError(error.message); return }
        await load(); onChanged?.()
    }

    async function setMemberTeam(userId: string, teamId: string | null) {
        setBusy(true); setError(null)
        const { error } = await supabase.from("org_members")
            .update({ team_id: teamId }).eq("org_id", orgId).eq("user_id", userId)
        setBusy(false)
        if (error) { setError(error.message); return }
        await load(); onChanged?.()
    }

    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-sm font-semibold text-[var(--color-text)]">{t.tabs.teams.title}</h3>
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{t.tabs.teams.sub}</p>
            </div>

            <div className="flex gap-2">
                <input className={INPUT} placeholder={t.tabs.teams.namePlaceholder}
                    value={newName} onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") createTeam() }} />
                <button className={BTN_PRIMARY + " flex-shrink-0"} onClick={createTeam} disabled={busy || !newName.trim()}>
                    {t.tabs.teams.create}
                </button>
            </div>

            {teams.length > 0 && (
                <div className="space-y-2">
                    {teams.map(team => (
                        <div key={team.id} className="flex items-center gap-2">
                            <input
                                className={INPUT}
                                defaultValue={team.name}
                                onBlur={e => { if (e.target.value.trim() !== team.name) renameTeam(team.id, e.target.value) }}
                            />
                            <span className="text-xs text-[var(--color-muted)] whitespace-nowrap">
                                {t.tabs.teams.nMembers(people.filter(p => p.team_id === team.id).length)}
                            </span>
                            <button className={BTN_GHOST + " flex-shrink-0"} disabled={busy} onClick={() => deleteTeam(team.id)}>
                                {t.common.delete}
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {people.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
                    <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)] font-semibold">{t.tabs.teams.whoIsWhere}</p>
                    {people.map(p => (
                        <div key={p.user_id} className="flex items-center justify-between gap-3">
                            <span className="text-sm text-[var(--color-text)] truncate">{p.email ?? p.user_id.slice(0, 8)}</span>
                            <select
                                className="flex-shrink-0 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 text-xs text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)]"
                                value={p.team_id ?? ""}
                                disabled={busy}
                                onChange={e => setMemberTeam(p.user_id, e.target.value || null)}
                            >
                                <option value="">{t.tabs.teams.noTeam}</option>
                                {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
                            </select>
                        </div>
                    ))}
                </div>
            )}

            {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
    )
}
