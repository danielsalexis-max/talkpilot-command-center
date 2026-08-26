"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase"
import { useLocale } from "@/i18n/LocaleProvider"
import { starterKitsFor, applyStarterKit, VERTICALS, type StarterKit, type Vertical } from "@/lib/starterKit"

/// Preset playbooks, inside the Playbooks tab.
///
/// The three original kits could only ever be applied from the /start wizard's
/// second step, which means an org that clicked past it — or existed before
/// the wizard — had no way to reach them at all, and the "methodology" select
/// on the editor was a label that prefilled nothing. So the presets existed
/// and were unreachable, which is the same as not existing.
///
/// The vertical selector (D-192 #5) decides which kits are offered. It is
/// persisted on the org rather than kept in component state so the choice is
/// still there tomorrow, and so other surfaces can read it later.

const CARD = "bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5"
const BTN_GHOST = "px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"

export function StarterKitPicker({
    orgId, vertical, onVerticalChange, onApplied,
}: {
    orgId: string
    vertical: Vertical
    onVerticalChange: (v: Vertical) => void
    onApplied: () => void
}) {
    const { locale, t } = useLocale()
    const [busy, setBusy]   = useState<string | null>(null)
    const [msg, setMsg]     = useState<string | null>(null)
    const [isErr, setIsErr] = useState(false)
    const [open, setOpen]   = useState(false)

    const kits = starterKitsFor(locale).filter(k => k.vertical === vertical)

    async function saveVertical(v: Vertical) {
        onVerticalChange(v)
        const { data: org } = await supabase.from("organizations").select("settings").eq("id", orgId).single()
        await supabase.from("organizations")
            .update({ settings: { ...(org?.settings ?? {}), vertical: v } })
            .eq("id", orgId)
    }

    async function apply(kit: StarterKit) {
        setBusy(kit.key); setMsg(null)
        const err = await applyStarterKit(orgId, kit)
        setBusy(null)
        if (err) { setMsg(err); setIsErr(true); return }
        setMsg(t.tabs.playbooks.presetApplied(kit.title)); setIsErr(false)
        onApplied()
    }

    return (
        <div className={CARD}>
            <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between text-left">
                <div>
                    <h3 className="text-sm font-semibold text-[var(--color-text)]">{t.tabs.playbooks.presetsTitle}</h3>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{t.tabs.playbooks.presetsSub}</p>
                </div>
                <span className="text-[var(--color-muted)] text-xs">{open ? "▾" : "▸"}</span>
            </button>

            {open && (
                <div className="mt-4 space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-[11px] uppercase tracking-wide text-[var(--color-muted)] font-semibold">
                            {t.tabs.playbooks.industry}
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {VERTICALS.map(v => (
                                <button key={v} onClick={() => saveVertical(v)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                        v === vertical
                                            ? "bg-[var(--btn-bg)] text-[var(--btn-ink)] border-[var(--btn-bg)]"
                                            : "bg-[var(--color-bg)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                                    }`}>
                                    {t.data.verticals[v] ?? v}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {kits.map(kit => (
                            <div key={kit.key} className="border border-[var(--color-border)] rounded-lg p-3.5 flex flex-col gap-2">
                                <div>
                                    <p className="text-sm font-semibold text-[var(--color-text)]">{kit.title}</p>
                                    <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{kit.tagline}</p>
                                </div>
                                <p className="text-[11px] text-[var(--color-muted)]">
                                    {t.tabs.playbooks.presetMeta(kit.stages.length, kit.objections.length)}
                                </p>
                                <button className={BTN_GHOST + " self-start mt-auto"} disabled={busy !== null}
                                    onClick={() => apply(kit)}>
                                    {busy === kit.key ? t.common.saving : t.tabs.playbooks.usePreset}
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Applying never silently replaces a live playbook: applyStarterKit
                        lands as a draft when one is already active. */}
                    <p className="text-xs text-[var(--color-text-secondary)]">{t.tabs.playbooks.presetNote}</p>
                    {msg && <p className={`text-xs ${isErr ? "text-red-600" : "text-emerald-600"}`}>{msg}</p>}
                </div>
            )}
        </div>
    )
}
