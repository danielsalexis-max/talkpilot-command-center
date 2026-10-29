"use client"

// D-538: TalkPilot inside Claude and ChatGPT, the admin's view. Each person
// connects their own AI app (it is their account), so this card only explains
// it, hands out the connector URL and the setup prompt (D-800), and shows how
// the workspace has used it. Reads of a rep's calls are listed by name: the
// rep can see them too. Lives in Settings → Integrations since D-802.

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useLocale, useT } from "@/i18n/LocaleProvider"
import { aiSetupCopy, claudeNewChatURL, CHATGPT_URL } from "@/lib/aiSetup"
import { track } from "@/lib/teamsAnalytics"

export const MCP_CONNECTOR_URL = "https://teams.talkpilot.co/api/mcp"

type LogRow = { user_id: string; subject_user_id: string | null; tool: string; created_at: string }

const CARD = "bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 sm:p-6 shadow-sm"
const STEP_BOX = "rounded-lg border border-[var(--color-line-soft,var(--color-border))] bg-[var(--color-bg)] p-4 space-y-3 flex-col"
const STEP = STEP_BOX + " flex"
const NUM = "w-6 h-6 shrink-0 rounded-full grid place-items-center text-[11px] font-bold bg-[var(--color-accent-subtle)] text-[var(--color-accent-deep)]"

export function AIConnectorCard({ orgId }: { orgId: string }) {
    const t = useT().aiConnector
    const { locale } = useLocale()
    const c = aiSetupCopy(locale)
    const [copied, setCopied] = useState<"link" | "prompt" | "chatgpt" | null>(null)
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

    function copy(what: "link" | "prompt" | "chatgpt") {
        navigator.clipboard.writeText(what === "link" ? MCP_CONNECTOR_URL : c.prompt).catch(() => {})
        if (what === "chatgpt") window.open(CHATGPT_URL, "_blank", "noopener")
        track(what === "link" ? "ai_setup_link_copied" : what === "chatgpt" ? "ai_setup_open_chatgpt" : "ai_setup_prompt_copied", { surface: "settings" })
        setCopied(what); setTimeout(() => setCopied(null), 2000)
    }

    const people = new Set((rows ?? []).map(r => r.user_id)).size
    const reads = (rows ?? []).filter(r => r.subject_user_id)

    return (
        <section aria-labelledby="ai-connector" className={CARD + " space-y-4"}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-3xl">
                    <h3 id="ai-connector" className="font-display text-[15px] font-bold text-[var(--color-text)]">{t.title}</h3>
                    <p className="text-[13px] text-[var(--color-text-secondary)] mt-0.5 leading-relaxed">{t.intro}</p>
                </div>
                {rows !== null && (
                    <span className="shrink-0 text-[11px] font-semibold rounded-full px-2.5 py-1 bg-[var(--color-accent-subtle)] text-[var(--color-accent-deep)]">
                        {rows.length === 0 ? c.notUsed : t.usage(people, rows.length)}
                    </span>
                )}
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <div className={STEP}>
                    <div className="flex items-center gap-2.5">
                        <span className={NUM}>1</span>
                        <p className="text-sm font-semibold text-[var(--color-text)]">{c.connectTitle}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <code className="flex-1 min-w-0 truncate rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] px-2.5 py-2 text-xs text-[var(--color-text)]">{MCP_CONNECTOR_URL}</code>
                        <button type="button" onClick={() => copy("link")}
                            className="shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-hover)] transition-colors">
                            {copied === "link" ? t.copied : t.copy}
                        </button>
                    </div>
                    <dl className="text-xs space-y-1.5">
                        <div><dt className="inline font-semibold text-[var(--color-text)]">Claude: </dt><dd className="inline text-[var(--color-text-secondary)]">{c.claudePath}</dd></div>
                        <div><dt className="inline font-semibold text-[var(--color-text)]">ChatGPT: </dt><dd className="inline text-[var(--color-text-secondary)]">{c.chatgptPath}</dd></div>
                    </dl>
                    <p className="text-xs text-[var(--color-text-secondary)]">{c.thenAllow}</p>
                </div>

                <div className={STEP}>
                    <div className="flex items-center gap-2.5">
                        <span className={NUM}>2</span>
                        <p className="text-sm font-semibold text-[var(--color-text)]">{c.setupTitle}</p>
                    </div>
                    <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed flex-1">{c.setupSub}</p>
                    <div className="flex flex-wrap items-center gap-2">
                        <a href={claudeNewChatURL(c.prompt)} target="_blank" rel="noopener noreferrer"
                            onClick={() => track("ai_setup_open_claude", { surface: "settings" })}
                            className="px-4 py-2 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] text-[var(--btn-ink)] text-sm font-semibold rounded-lg transition-colors">
                            {c.openClaude}
                        </a>
                        <button type="button" onClick={() => copy("chatgpt")}
                            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-semibold text-[var(--color-text)] hover:bg-[var(--color-hover)] transition-colors">
                            {copied === "chatgpt" ? c.copied : c.openChatGPT}
                        </button>
                        <button type="button" onClick={() => copy("prompt")}
                            className="text-xs font-semibold text-[var(--color-accent-deep)] px-1">
                            {copied === "prompt" ? c.copied : c.copyPrompt}
                        </button>
                    </div>
                    <p className="text-xs text-[var(--color-text-secondary)]">{c.chatgptHint}</p>
                </div>

                <div className={STEP_BOX + " hidden xl:flex"}>
                    <div className="flex items-center gap-2.5">
                        <span className={NUM} aria-hidden="true">i</span>
                        <p className="text-sm font-semibold text-[var(--color-text)]">{c.canSee}</p>
                    </div>
                    <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{t.access}</p>
                    <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{c.appNote}</p>
                </div>
            </div>

            <details className="group text-xs xl:hidden">
                <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden font-semibold text-[var(--color-accent-deep)] inline-flex items-center gap-1">
                    <span className="transition-transform group-open:rotate-90" aria-hidden="true">›</span> {c.canSee}
                </summary>
                <div className="pt-2 space-y-1.5 text-[var(--color-text-secondary)] leading-relaxed">
                    <p>{t.access}</p>
                    <p>{c.appNote}</p>
                </div>
            </details>

            {reads.length > 0 && (
                <div className="space-y-1 border-t border-[var(--color-line-soft,var(--color-border))] pt-3">
                    {reads.slice(0, 10).map((r, i) => (
                        <p key={i} className="text-xs text-[var(--color-text-secondary)]">
                            {t.readLine(names[r.user_id] ?? "?", names[r.subject_user_id!] ?? "?",
                                new Date(r.created_at).toLocaleString())}
                        </p>
                    ))}
                </div>
            )}
        </section>
    )
}
