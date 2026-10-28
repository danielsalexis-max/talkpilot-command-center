"use client"

// D-800: "Set it up with Claude or ChatGPT". The admin adds the TalkPilot
// connector to their own AI, pastes our prompt, and the AI writes the company
// profile, sales stages, draft playbooks, objections and documents through the
// MCP tools. Home shows the card while the workspace isn't ready; Settings
// carries the prompt button for later runs.

import Link from "next/link"
import { useState } from "react"
import { useLocale } from "@/i18n/LocaleProvider"
import { aiSetupCopy } from "@/lib/aiSetup"
import { track } from "@/lib/teamsAnalytics"
import { MCP_CONNECTOR_URL } from "@/components/aiConnector"

function useCopy(): [string | null, (key: string, text: string) => void] {
    const [copied, setCopied] = useState<string | null>(null)
    return [copied, (key, text) => {
        navigator.clipboard.writeText(text).catch(() => {})
        setCopied(key); setTimeout(() => setCopied(null), 2000)
    }]
}

export function AISetupCard({ surface }: { surface: "home" }) {
    const { locale } = useLocale()
    const c = aiSetupCopy(locale)
    const [copied, copy] = useCopy()

    const btn = "shrink-0 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-hover)] transition-colors"
    const num = "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold bg-[var(--color-accent-subtle)] text-[var(--color-accent-deep)]"

    return (
        <div className="tp-screen bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6 sm:p-8 shadow-sm max-w-2xl">
            <p className="text-[11px] uppercase tracking-wider text-[var(--color-accent-deep)] font-semibold">{c.kicker}</p>
            <h2 className="font-display text-xl sm:text-2xl font-bold leading-tight text-[var(--color-text)] mt-2">{c.title}</h2>
            <p className="text-sm text-[var(--color-text-secondary)] mt-2 max-w-md leading-relaxed">{c.sub}</p>

            <ol className="mt-5 divide-y divide-[var(--color-line-soft)]">
                <li className="flex gap-3 py-4">
                    <span className={num}>1</span>
                    <div className="min-w-0 flex-1 space-y-1.5">
                        <p className="text-sm font-semibold text-[var(--color-text)]">{c.step1}</p>
                        <p className="text-xs text-[var(--color-text-secondary)]">{c.step1Claude}</p>
                        <p className="text-xs text-[var(--color-text-secondary)]">{c.step1ChatGPT}</p>
                        <p className="text-xs text-[var(--color-text-secondary)]">{c.step1Then}</p>
                        <div className="flex items-center gap-2 pt-1">
                            <code className="flex-1 min-w-0 truncate rounded-lg bg-[var(--color-bg)] px-3 py-1.5 text-xs text-[var(--color-text)]">{MCP_CONNECTOR_URL}</code>
                            <button className={btn} onClick={() => { copy("link", MCP_CONNECTOR_URL); track("ai_setup_link_copied", { surface }) }}>
                                {copied === "link" ? c.copied : c.copyLink}
                            </button>
                        </div>
                    </div>
                </li>
                <li className="flex gap-3 py-4">
                    <span className={num}>2</span>
                    <div className="min-w-0 flex-1 space-y-1.5">
                        <p className="text-sm font-semibold text-[var(--color-text)]">{c.step2}</p>
                        <p className="text-xs text-[var(--color-text-secondary)]">{c.step2Hint}</p>
                        <div className="pt-1">
                            <button
                                className="px-4 py-2 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] text-[var(--btn-ink)] text-sm font-semibold rounded-xl transition-colors"
                                onClick={() => { copy("prompt", c.prompt); track("ai_setup_prompt_copied", { surface }) }}>
                                {copied === "prompt" ? c.copied : c.copyPrompt}
                            </button>
                        </div>
                    </div>
                </li>
                <li className="flex gap-3 py-4">
                    <span className={num}>3</span>
                    <div className="min-w-0 flex-1 space-y-1.5">
                        <p className="text-sm font-semibold text-[var(--color-text)]">{c.step3}</p>
                        <p className="text-xs text-[var(--color-text-secondary)]">{c.step3Hint}</p>
                        <Link href="/playbook" className="inline-block text-xs font-semibold text-[var(--color-accent-deep)] pt-1">{c.openPlaybook}</Link>
                    </div>
                </li>
            </ol>
        </div>
    )
}
