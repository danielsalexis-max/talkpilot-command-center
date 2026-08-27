"use client"

import { useEffect, useState, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useLocale } from "@/i18n/LocaleProvider"

/// Who a playbook applies to.
///
/// Mixed teams are the ICP — one workspace running sales, CS and support — so
/// "the org has one playbook" was never going to survive contact with a real
/// customer. `org_playbook_assignments` has carried `team_id` since the schema
/// was written (null = org-wide) but nothing ever wrote it; `user_id` was added
/// 2026-08-25 (D-192) because "assign this one to Federica" is the actual ask.
///
/// Resolution happens server-side in `get_org_context()`, most specific first:
/// the rep's own assignment, then their team's, then an org-wide row, then a
/// playbook with no assignments at all (the implicit org default). This
/// component only writes rows; it deliberately doesn't re-implement that order,
/// because two implementations of a precedence rule is one too many.

export interface AssignmentRow {
    playbook_id: string
    team_id: string | null
    user_id: string | null
}

export interface AssignTarget {
    id: string
    label: string
}

const CHIP_ON  = "bg-[var(--btn-bg)] text-[var(--btn-ink)] border-[var(--btn-bg)]"
const CHIP_OFF = "bg-[var(--color-bg)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"

export function PlaybookAssignment({
    orgId, playbookId, teams, members, onChanged,
}: {
    orgId: string
    playbookId: string
    teams: AssignTarget[]
    members: AssignTarget[]
    onChanged?: () => void
}) {
    const t = useLocale().t
    const [rows, setRows]     = useState<AssignmentRow[]>([])
    const [busy, setBusy]     = useState(false)
    const [open, setOpen]     = useState(false)
    const [error, setError]   = useState<string | null>(null)

    const load = useCallback(async () => {
        const { data } = await supabase
            .from("org_playbook_assignments")
            .select("playbook_id, team_id, user_id")
            .eq("playbook_id", playbookId)
        setRows((data ?? []) as AssignmentRow[])
    }, [playbookId])

    useEffect(() => { load() }, [load])

    const orgWide  = rows.some(r => !r.team_id && !r.user_id)
    const teamIds  = new Set(rows.filter(r => r.team_id).map(r => r.team_id as string))
    const userIds  = new Set(rows.filter(r => r.user_id).map(r => r.user_id as string))

    async function toggle(kind: "org" | "team" | "user", id?: string) {
        setBusy(true); setError(null)
        try {
            const isOn = kind === "org" ? orgWide
                       : kind === "team" ? teamIds.has(id!)
                       : userIds.has(id!)
            if (isOn) {
                let q = supabase.from("org_playbook_assignments").delete()
                    .eq("playbook_id", playbookId).eq("org_id", orgId)
                q = kind === "org"  ? q.is("team_id", null).is("user_id", null)
                  : kind === "team" ? q.eq("team_id", id!).is("user_id", null)
                  :                   q.eq("user_id", id!).is("team_id", null)
                const { error } = await q
                if (error) throw error
            } else {
                const { error } = await supabase.from("org_playbook_assignments").insert({
                    org_id: orgId,
                    playbook_id: playbookId,
                    team_id: kind === "team" ? id! : null,
                    user_id: kind === "user" ? id! : null,
                })
                // 23505 = the row already exists (a double-click, or a stale
                // view). The desired end state — "assigned" — already holds,
                // so it is a success, not an error to show the manager.
                if (error && (error as { code?: string }).code !== "23505") throw error
            }
            await load()
            onChanged?.()
        } catch (e) {
            console.error("Assignment change failed:", e)
            setError(t.tabs.playbooks.assignFailed)
        } finally {
            setBusy(false)
        }
    }

    // The summary line is the part managers actually read, so it states the
    // effective rule rather than counting rows.
    const summary = rows.length === 0
        ? t.tabs.playbooks.assignDefault
        : orgWide
            ? t.tabs.playbooks.assignEveryone
            : t.tabs.playbooks.assignScoped(teamIds.size, userIds.size)

    return (
        <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
            <button
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
            >
                <span className="font-medium">{t.tabs.playbooks.appliesTo}</span>
                <span>{summary}</span>
                <span className="text-[var(--color-muted)]">{open ? "▾" : "▸"}</span>
            </button>

            {open && (
                <div className="mt-3 space-y-3">
                    <div className="space-y-1.5">
                        <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)] font-semibold">{t.tabs.playbooks.assignWholeOrg}</p>
                        <button disabled={busy} onClick={() => toggle("org")}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${orgWide ? CHIP_ON : CHIP_OFF}`}>
                            {t.tabs.playbooks.assignEveryone}
                        </button>
                    </div>

                    <div className="space-y-1.5">
                        <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)] font-semibold">{t.tabs.playbooks.assignTeams}</p>
                        {teams.length === 0
                            ? <p className="text-xs text-[var(--color-muted)]">{t.tabs.playbooks.assignNoTeams}</p>
                            : <div className="flex flex-wrap gap-2">
                                {teams.map(tm => (
                                    <button key={tm.id} disabled={busy} onClick={() => toggle("team", tm.id)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${teamIds.has(tm.id) ? CHIP_ON : CHIP_OFF}`}>
                                        {tm.label}
                                    </button>
                                ))}
                              </div>}
                    </div>

                    <div className="space-y-1.5">
                        <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)] font-semibold">{t.tabs.playbooks.assignPeople}</p>
                        <div className="flex flex-wrap gap-2">
                            {members.map(m => (
                                <button key={m.id} disabled={busy} onClick={() => toggle("user", m.id)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${userIds.has(m.id) ? CHIP_ON : CHIP_OFF}`}>
                                    {m.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <p className="text-xs text-[var(--color-text-secondary)]">{t.tabs.playbooks.assignPrecedence}</p>

                    {/* Scoping a playbook REMOVES it from everyone it doesn't
                        name. That is the correct semantic and a genuine
                        footgun: a manager aiming one playbook at one rep can
                        silently leave the rest of the team with no playbook at
                        all, and nothing else in the product would say so. */}
                    {rows.length > 0 && !orgWide && (
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            {t.tabs.playbooks.assignScopedWarning}
                        </p>
                    )}
                    {error && <p className="text-xs text-red-600">{error}</p>}
                </div>
            )}
        </div>
    )
}
