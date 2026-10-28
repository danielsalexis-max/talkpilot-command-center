"use client"

// Settings → Integrations (D-802). Everything that connects TalkPilot to
// another tool lives here instead of at the bottom of the workspace settings:
// the CRM and tool connections (per rep, counted here) with the auto-log rule,
// and the Claude & ChatGPT connector with the setup prompt (D-538, D-800).

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useLocale, useT } from "@/i18n/LocaleProvider"
import { aiSetupCopy } from "@/lib/aiSetup"
import { ToolIcon } from "@/components/toolIcons"
import { AIConnectorCard } from "@/components/aiConnector"

type OrgLite = { id: string; settings?: Record<string, unknown> | null }

/// The providers a rep can connect in the apps, in the order shown. `icon`
/// is the ToolIcon key.
const PROVIDERS: { key: string; name: string; icon: string }[] = [
    { key: "hubspot",    name: "HubSpot",    icon: "hubspot" },
    { key: "salesforce", name: "Salesforce", icon: "salesforce" },
    { key: "google",     name: "Google",     icon: "gcal" },
    { key: "microsoft",  name: "Microsoft",  icon: "outlook" },
    { key: "slack",      name: "Slack",      icon: "slack" },
]

const CARD = "bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 sm:p-6 shadow-sm"

export function IntegrationsTab({ org, onSaved }: { org: OrgLite; onSaved: () => void }) {
    const t = useT()
    const { locale } = useLocale()
    const c = aiSetupCopy(locale)
    const [counts, setCounts] = useState<Record<string, number> | null>(null)
    const savedAutoLog = (org.settings?.integrations as { auto_log_calls?: boolean } | undefined)?.auto_log_calls === true
    const [autoLog, setAutoLog] = useState(savedAutoLog)
    const [saving, setSaving] = useState(false)
    const [msg, setMsg] = useState<{ text: string; err: boolean } | null>(null)

    useEffect(() => {
        // Per-provider connection counts via get_org_integrations_summary: the
        // token table has no client SELECT policy, so counts are all we show.
        supabase.rpc("get_org_integrations_summary").then(({ data }) => {
            const m: Record<string, number> = {}
            for (const r of (Array.isArray(data) ? data : []) as { provider: string; connected_users: number }[]) m[r.provider] = r.connected_users
            setCounts(m)
        })
    }, [])

    async function saveAutoLog() {
        setSaving(true); setMsg(null)
        // Merge into the CURRENT settings so a save here never undoes one made
        // on the Workspace tab, or by someone else, since this page loaded.
        const { data: cur } = await supabase.from("organizations").select("settings").eq("id", org.id).maybeSingle()
        const settings = (cur?.settings ?? {}) as Record<string, unknown>
        const { error } = await supabase.from("organizations").update({
            settings: {
                ...settings,
                integrations: { ...((settings.integrations as Record<string, unknown> | undefined) ?? {}), auto_log_calls: autoLog },
            },
        }).eq("id", org.id)
        setSaving(false)
        if (error) { setMsg({ text: c.saveError, err: true }); return }
        setMsg({ text: c.saved, err: false }); onSaved()
    }

    const extra = counts ? Object.keys(counts).filter(k => !PROVIDERS.some(p => p.key === k)) : []

    return (
        <div className="space-y-4 max-w-3xl">
            <div>
                <h2 className="font-display text-lg font-bold text-[var(--color-text)]">{c.tabTitle}</h2>
                <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">{c.tabSub}</p>
            </div>

            <AIConnectorCard orgId={org.id} />

            <section aria-labelledby="crm-tools" className={CARD + " space-y-4"}>
                <div>
                    <h3 id="crm-tools" className="font-display text-[15px] font-bold text-[var(--color-text)]">{c.crmTitle}</h3>
                    <p className="text-[13px] text-[var(--color-text-secondary)] mt-0.5 leading-relaxed">{c.crmSub}</p>
                </div>
                <ul className="grid gap-2 sm:grid-cols-2">
                    {[...PROVIDERS, ...extra.map(k => ({ key: k, name: k, icon: "" }))].map(p => {
                        const n = counts?.[p.key] ?? 0
                        return (
                            <li key={p.key} className="flex items-center gap-3 rounded-lg border border-[var(--color-line-soft,var(--color-border))] px-3 py-2.5">
                                <span className="w-8 h-8 shrink-0 grid place-items-center rounded-md bg-[var(--color-bg)]">
                                    <ToolIcon tool={p.icon} />
                                </span>
                                <span className="min-w-0 flex-1 text-sm font-medium text-[var(--color-text)] truncate">{p.name}</span>
                                <span className={`shrink-0 text-xs ${n > 0 ? "text-emerald-700 dark:text-emerald-400 font-semibold" : "text-[var(--color-muted)]"}`}>
                                    {counts === null ? "…" : n > 0 ? t.tabs.settings.integrationsConnected(n) : c.notConnected}
                                </span>
                            </li>
                        )
                    })}
                </ul>
                <div className="border-t border-[var(--color-line-soft,var(--color-border))] pt-4 space-y-2">
                    <label className="flex items-start gap-2.5 text-sm text-[var(--color-text)] cursor-pointer">
                        <input type="checkbox" checked={autoLog} onChange={e => setAutoLog(e.target.checked)}
                            className="accent-[var(--color-accent)] w-4 h-4 mt-0.5" />
                        <span className="font-medium">{t.tabs.settings.autoLogCalls}</span>
                    </label>
                    <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed pl-[26px]">{t.tabs.settings.autoLogHelp}</p>
                    <div className="flex items-center gap-3 pl-[26px] pt-1">
                        <button type="button" onClick={saveAutoLog} disabled={saving || autoLog === savedAutoLog}
                            className="px-4 py-2 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] disabled:opacity-40 text-[var(--btn-ink)] text-sm font-semibold rounded-lg transition-colors">
                            {c.saveRule}
                        </button>
                        {msg && <span className={`text-xs ${msg.err ? "text-red-600" : "text-emerald-600"}`}>{msg.text}</span>}
                    </div>
                </div>
            </section>
        </div>
    )
}
