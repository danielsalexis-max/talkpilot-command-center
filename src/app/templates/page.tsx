"use client"

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useOrg, OrgBanners } from "@/lib/useOrg"
import { PageSkeleton } from "@/components/homeStates"
import { useLocale } from "@/i18n/LocaleProvider"
import { teamTemplatesDict, type TeamTemplatesDict } from "@/i18n/teamTemplates"
import {
    GROUP_ORDER, GROUP_SLOTS, TEMPLATE_TOKENS, MAX_TEMPLATE_CHARS, isSingleLine,
    loadOrgTemplates, saveOrgTemplate, deleteOrgTemplate, previewTemplate, templateFromExample, presetsFor,
    type TemplateGroup, type TemplateSlot, type TemplatePreview,
} from "@/lib/teamTemplates"

/// Team wording templates (D-770). How the team's CRM note, task and
/// follow-up email look. A rep's own version always wins in the app; this is
/// what everyone else gets instead of the built-in wording. No lock (D-771).
///
/// Its own page, not a Settings tab: managers set it, and managers don't see
/// Settings (that's org admin and billing).

type Key = `${TemplateGroup}.${TemplateSlot}`

function slotLabel(s: TeamTemplatesDict, group: TemplateGroup, slot: TemplateSlot): string {
    if (group === "slack" && slot === "task") return s.slots.slackTask
    return s.slots[slot]
}

function TemplatesPageInner() {
    const router = useRouter()
    const { locale } = useLocale()
    const s = teamTemplatesDict[locale]
    const { org, orgId, loading } = useOrg()
    const [saved, setSaved] = useState<Partial<Record<Key, string>> | null>(null)
    const [loadError, setLoadError] = useState(false)
    const [canEdit, setCanEdit] = useState(false)
    const [open, setOpen] = useState<Key | null>(null)

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => { if (!data.user) router.replace("/login") })
    }, [router])

    const reload = useCallback(async () => {
        if (!orgId) return
        try {
            const rows = await loadOrgTemplates(orgId)
            const map: Partial<Record<Key, string>> = {}
            for (const r of rows) map[`${r.tool_group}.${r.slot}` as Key] = r.template
            setSaved(map)
        } catch {
            setLoadError(true)
            setSaved({})
        }
    }, [orgId])

    useEffect(() => { reload() }, [reload])

    useEffect(() => {
        if (!orgId) return
        supabase.auth.getUser().then(async ({ data }) => {
            if (!data.user) return
            const { data: m } = await supabase.from("org_members").select("role")
                .eq("org_id", orgId).eq("user_id", data.user.id).eq("status", "active").maybeSingle()
            setCanEdit(["owner", "admin", "manager"].includes((m?.role as string | undefined) ?? ""))
        })
    }, [orgId])

    if (loading || (orgId && saved === null)) return <PageSkeleton rows={3} />
    if (!orgId || !org) return null

    return (
        <div className="space-y-6 max-w-3xl">
            <div>
                <h1 className="text-2xl font-bold text-[var(--color-text)]">{s.title}</h1>
                <p className="text-sm text-[var(--color-text-secondary)] mt-1">{s.sub}</p>
            </div>

            <OrgBanners org={org} />

            {!canEdit && (
                <p className="text-xs text-[var(--color-text-secondary)] bg-[var(--color-accent-subtle)] border border-[var(--color-accent-light)] rounded-lg px-4 py-3">
                    {s.readOnly}
                </p>
            )}
            {loadError && <p className="text-xs text-red-600">{s.saveFailed}</p>}

            {GROUP_ORDER.map(group => (
                <section key={group} className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-sm">
                    <div className="px-5 pt-4 pb-3 border-b border-[var(--color-line-soft)]">
                        <h2 className="text-sm font-semibold text-[var(--color-text)]">{s.groups[group].title}</h2>
                        <p className="text-xs text-[var(--color-muted)] mt-0.5">{s.groups[group].tools}</p>
                    </div>
                    <div className="divide-y divide-[var(--color-line-soft)]">
                        {GROUP_SLOTS[group].map(slot => {
                            const key = `${group}.${slot}` as Key
                            const value = saved?.[key]
                            return (
                                <div key={key} className="px-5 py-3">
                                    <div className="flex items-center gap-3">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[13px] font-medium text-[var(--color-text)]">{slotLabel(s, group, slot)}</p>
                                            {value && open !== key && (
                                                <p className="text-xs text-[var(--color-text-secondary)] truncate mt-0.5">{value.split("\n")[0]}</p>
                                            )}
                                        </div>
                                        <span className={`text-[11px] px-2 py-0.5 rounded-full border ${value
                                            ? "border-[var(--color-accent-light)] bg-[var(--color-accent-subtle)] text-[var(--color-accent-deep)]"
                                            : "border-[var(--color-border)] text-[var(--color-muted)]"}`}>
                                            {value ? s.statusTeam : s.statusBuiltIn}
                                        </span>
                                        <button
                                            onClick={() => setOpen(open === key ? null : key)}
                                            className="text-xs font-medium text-[var(--color-accent-deep)] hover:underline"
                                        >{open === key ? s.close : s.edit}</button>
                                    </div>
                                    {open === key && (
                                        <SlotEditor
                                            s={s}
                                            locale={locale}
                                            orgId={orgId}
                                            group={group}
                                            slot={slot}
                                            initial={value ?? ""}
                                            hasSaved={!!value}
                                            canEdit={canEdit}
                                            onChanged={reload}
                                        />
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </section>
            ))}

            <div className="text-xs text-[var(--color-text-secondary)] space-y-1">
                <p className="font-semibold text-[var(--color-text)]">{s.howItWorks}</p>
                <p>{s.howItWorksBody}</p>
            </div>
        </div>
    )
}

function SlotEditor({ s, locale, orgId, group, slot, initial, hasSaved, canEdit, onChanged }: {
    s: TeamTemplatesDict
    locale: "en" | "es"
    orgId: string
    group: TemplateGroup
    slot: TemplateSlot
    initial: string
    hasSaved: boolean
    canEdit: boolean
    onChanged: () => void
}) {
    const [text, setText] = useState(initial)
    const [preview, setPreview] = useState<TemplatePreview | null>(null)
    const [showExample, setShowExample] = useState(false)
    const [example, setExample] = useState("")
    const [making, setMaking] = useState(false)
    const [busy, setBusy] = useState(false)
    const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null)
    const ref = useRef<HTMLTextAreaElement | null>(null)
    const single = isSingleLine(slot)

    // Live preview through the server's own renderer, debounced.
    useEffect(() => {
        if (!text.trim()) { setPreview(null); return }
        const handle = setTimeout(() => {
            previewTemplate(slot, text.slice(0, MAX_TEMPLATE_CHARS)).then(setPreview).catch(() => setPreview(null))
        }, 450)
        return () => clearTimeout(handle)
    }, [text, slot])

    function insertToken(token: string) {
        const el = ref.current
        const insert = `{{${token}}}`
        if (!el) { setText(t => t + insert); return }
        const start = el.selectionStart ?? text.length
        const end = el.selectionEnd ?? text.length
        const next = text.slice(0, start) + insert + text.slice(end)
        setText(next)
        requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + insert.length, start + insert.length) })
    }

    async function makeFromExample() {
        setMaking(true); setMsg(null)
        try {
            setText(await templateFromExample(example, group, slot))
            setMsg({ text: s.madeFromExample })
            setShowExample(false)
        } catch {
            setMsg({ text: s.exampleFailed, error: true })
        } finally {
            setMaking(false)
        }
    }

    async function save() {
        const value = single ? text.replace(/\s*\n\s*/g, " ").trim() : text
        if (!value.trim()) { setMsg({ text: s.empty, error: true }); return }
        if (value.length > MAX_TEMPLATE_CHARS) { setMsg({ text: s.tooLong(MAX_TEMPLATE_CHARS), error: true }); return }
        setBusy(true); setMsg(null)
        try {
            await saveOrgTemplate(orgId, group, slot, value)
            setMsg({ text: s.saved })
            onChanged()
        } catch {
            setMsg({ text: s.saveFailed, error: true })
        } finally {
            setBusy(false)
        }
    }

    async function remove() {
        setBusy(true); setMsg(null)
        try {
            await deleteOrgTemplate(orgId, group, slot)
            setText("")
            setMsg({ text: s.removed })
            onChanged()
        } catch {
            setMsg({ text: s.saveFailed, error: true })
        } finally {
            setBusy(false)
        }
    }

    const fieldClass = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)] disabled:opacity-70"

    return (
        <div className="mt-3 space-y-3">
            {canEdit && (
                <div>
                    <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)] mb-1.5">{s.startFrom}</p>
                    <div className="flex flex-wrap gap-1.5">
                        {presetsFor(slot, locale).map(p => (
                            <button key={p.id} title={p.summary} onClick={() => { setText(p.body); setMsg(null) }}
                                className="text-xs px-2.5 py-1 rounded-full border border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-accent)]">
                                {p.name}
                            </button>
                        ))}
                        <button onClick={() => setShowExample(v => !v)}
                            className="text-xs px-2.5 py-1 rounded-full border border-dashed border-[var(--color-accent-light)] text-[var(--color-accent-deep)] hover:border-[var(--color-accent)]">
                            {s.pasteExample}
                        </button>
                    </div>
                </div>
            )}

            {showExample && canEdit && (
                <div className="space-y-2 rounded-lg border border-[var(--color-line-soft)] p-3">
                    <p className="text-xs text-[var(--color-text-secondary)]">{s.pasteHelp}</p>
                    <textarea value={example} onChange={e => setExample(e.target.value)} rows={5} className={fieldClass} />
                    <button onClick={makeFromExample} disabled={making || !example.trim()}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[var(--color-accent)] text-white disabled:opacity-50">
                        {making ? s.making : s.makeMine}
                    </button>
                </div>
            )}

            {single ? (
                <input value={text} onChange={e => setText(e.target.value)} disabled={!canEdit}
                    ref={el => { ref.current = el as unknown as HTMLTextAreaElement }} className={fieldClass} />
            ) : (
                <textarea ref={ref} value={text} onChange={e => setText(e.target.value)} disabled={!canEdit}
                    rows={slot === "email_body" || slot === "recap" ? 10 : 6} className={`${fieldClass} font-mono text-[13px]`} />
            )}

            {canEdit && (
                <div>
                    <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)] mb-1.5">{s.tokens}</p>
                    <div className="flex flex-wrap gap-1">
                        {TEMPLATE_TOKENS.map(tok => (
                            <button key={tok} onClick={() => insertToken(tok)}
                                className="text-[11px] font-mono px-2 py-0.5 rounded border border-[var(--color-line-soft)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent)]">
                                {`{{${tok}}}`}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="rounded-lg bg-[var(--color-bg)] border border-[var(--color-line-soft)] p-3">
                <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">{s.preview}</p>
                <p className="text-[11px] text-[var(--color-muted)] mb-2">{s.previewSample}</p>
                {preview
                    ? <pre className="whitespace-pre-wrap text-[13px] text-[var(--color-text)] font-sans">{preview.rendered}</pre>
                    : <p className="text-xs text-[var(--color-muted)]">{s.previewEmpty}</p>}
                {preview && preview.unknown.length > 0 && (
                    <p className="text-xs text-amber-700 mt-2">{s.unknownWarning} {preview.unknown.map(u => `{{${u}}}`).join(", ")}</p>
                )}
            </div>

            {msg && <p className={`text-xs ${msg.error ? "text-red-600" : "text-[var(--color-accent-deep)]"}`}>{msg.text}</p>}

            {canEdit && (
                <div className="flex items-center gap-3">
                    <button onClick={save} disabled={busy}
                        className="text-sm font-semibold px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white disabled:opacity-50">
                        {busy ? s.saving : s.save}
                    </button>
                    {hasSaved && (
                        <button onClick={remove} disabled={busy}
                            className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] disabled:opacity-50">
                            {s.useBuiltIn}
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}

export default function TemplatesPage() {
    return (
        <Suspense fallback={<PageSkeleton rows={3} />}>
            <TemplatesPageInner />
        </Suspense>
    )
}
