"use client"

// D-538: TalkPilot inside Claude and ChatGPT, the admin's view. Each person
// connects their own AI app (it is their account), so this card only explains
// it, hands out the connector URL, and shows how the workspace has used it.
// Reads of a rep's calls are listed by name: the rep can see them too.

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useT } from "@/i18n/LocaleProvider"

export const MCP_CONNECTOR_URL = "https://teams.talkpilot.co/api/mcp"

type LogRow = { user_id: string; subject_user_id: string | null; tool: string; created_at: string }

export function AIConnectorCard({ orgId }: { orgId: string }) {
    const t = useT().aiConnector
    const [copied, setCopied] = useState(false)
    const [rows, setRows] = useState<LogRow[] | null>(null)
    const [names, setNames] = useState<Record<string, string>>({})

    useEffect(() => {
        const since = new Date(Date.now() - 30 * 86400_000).toISOString()
        supabase.from("mcp_access_log").select("user_id, subject_user_id, tool, created_at")
            .eq("org_id", orgId).gte("created_at", since).order("created_at", { ascending: false }).limit(500)
            .then(({ data }) => setRows((data as LogRow[] | null) ?? []))
        supabase.rpc("get_org_members_with_email", { p_org: orgId }).then(({ data }) => {
            const m: Record<string, string> = {}
            for (const r of (data ?? []) as { user_id: string; full_name: string | null; email: string }[]) {
                m[r.user_id] = r.full_name || r.email
            }
            setNames(m)
        })
    }, [orgId])

    const people = new Set((rows ?? []).map(r => r.user_id)).size
    const reads = (rows ?? []).filter(r => r.subject_user_id)

    return (
        <div className="pt-3 border-t border-[var(--color-border)] space-y-2">
            <label className="text-xs text-[var(--color-text-secondary)] font-medium">{t.title}</label>
            <p className="text-xs text-[var(--color-text-secondary)]">{t.intro}</p>
            <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-lg bg-[var(--color-bg)] px-3 py-2 text-xs text-[var(--color-text)]">{MCP_CONNECTOR_URL}</code>
                <button
                    className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text)]"
                    onClick={() => {
                        navigator.clipboard.writeText(MCP_CONNECTOR_URL).catch(() => {})
                        setCopied(true); setTimeout(() => setCopied(false), 2000)
                    }}>
                    {copied ? t.copied : t.copy}
                </button>
            </div>
            <p className="text-xs text-[var(--color-text-secondary)]">{t.steps}</p>
            <p className="text-xs text-[var(--color-muted)]">{t.access}</p>
            {rows !== null && (
                rows.length === 0
                    ? <p className="text-xs text-[var(--color-muted)]">{t.noUse}</p>
                    : <div className="space-y-1 pt-1">
                        <p className="text-xs text-[var(--color-text)]">{t.usage(people, rows.length)}</p>
                        {reads.slice(0, 10).map((r, i) => (
                            <p key={i} className="text-xs text-[var(--color-text-secondary)]">
                                {t.readLine(names[r.user_id] ?? "?", names[r.subject_user_id!] ?? "?",
                                    new Date(r.created_at).toLocaleString())}
                            </p>
                        ))}
                    </div>
            )}
        </div>
    )
}
