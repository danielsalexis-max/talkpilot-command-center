"use client"

/// Settings › API & webhooks (D-1063). Owners and admins create and revoke API
/// keys (shown once), and manage webhook subscriptions: events, pause, signing
/// secret rotation (two valid secrets for 24 h), test event, delivery log and
/// resend. Everything goes through security-definer RPCs; the key hashes and
/// webhook secrets never reach the browser except the one time they are created.
/// Gated by `api_enabled(org)`: the API is Enterprise, switched on by hand (D-1050).

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import type { OrgInfo } from "@/components/orgTabs"
import { useLocale } from "@/i18n/LocaleProvider"
import { intlLocale } from "@/i18n"
import { EmailLink } from "@/components/EmailLink"
import { userError } from "@/lib/userError"
import { apiWebhooksCopy, SCOPES, EVENTS, API_DOCS_URL, API_BASE_URL, type Scope, type ApiEvent } from "@/lib/apiWebhooksCopy"

const INPUT = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
const BTN_PRIMARY = "px-4 py-2 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] disabled:opacity-40 text-[var(--btn-ink)] text-sm font-medium rounded-lg transition-colors"
const BTN_GHOST = "px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)] border border-[var(--color-border)] hover:border-[var(--color-muted)] rounded-lg transition-colors disabled:opacity-40"
const BTN_DANGER = "px-3 py-1.5 text-xs text-red-600 hover:text-red-700 border border-red-200 hover:border-red-300 rounded-lg transition-colors disabled:opacity-40"
const CARD = "bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm"

interface KeyRow { id: string; name: string; prefix: string; scopes: string[]; created_at: string; last_used_at: string | null; revoked_at: string | null }
interface HookRow { id: string; url: string; description: string | null; events: string[]; active: boolean; created_at: string; rotating_until: string | null; last_delivery_status: string | null; last_delivery_at: string | null; failures_24h: number }
interface DeliveryRow { id: string; event_id: string; event_type: string; webhook_id: string; status: string; attempt_count: number; last_status_code: number | null; last_error: string | null; next_attempt_at: string; created_at: string; delivered_at: string | null; test: boolean }

function Secret({ title, body, value, extra, onDone, c }: { title: string; body: string; value: string; extra?: string; onDone: () => void; c: ReturnType<typeof apiWebhooksCopy> }) {
    const [copied, setCopied] = useState(false)
    return (
        <div className="rounded-xl border border-[var(--color-accent-light)] bg-[var(--color-accent-subtle)] p-4 space-y-2">
            <p className="text-sm font-semibold text-[var(--color-text)]">{title}</p>
            <p className="text-xs text-[var(--color-text-secondary)]">{body}</p>
            {extra && <p className="text-xs text-[var(--color-text-secondary)]">{extra}</p>}
            <div className="flex gap-2 items-center">
                <code className="flex-1 min-w-0 break-all text-xs font-mono bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2">{value}</code>
                <button className={BTN_GHOST} onClick={() => { navigator.clipboard?.writeText(value).then(() => setCopied(true)).catch(() => {}) }}>
                    {copied ? c.copied : c.copy}
                </button>
            </div>
            <button className={BTN_PRIMARY} onClick={onDone}>{c.done}</button>
        </div>
    )
}

export function ApiWebhooksTab({ orgId, org }: { orgId: string; org: OrgInfo }) {
    const { locale, t } = useLocale()
    const c = apiWebhooksCopy(locale)
    const fmt = (iso: string | null) => iso
        ? new Date(iso).toLocaleString(intlLocale(locale), { dateStyle: "medium", timeStyle: "short" }) : ""

    const [enabled, setEnabled] = useState<boolean | null>(null)
    const [broken, setBroken] = useState(false)
    const [keys, setKeys] = useState<KeyRow[]>([])
    const [hooks, setHooks] = useState<HookRow[]>([])
    const [deliveries, setDeliveries] = useState<DeliveryRow[]>([])
    const [msg, setMsg] = useState<{ text: string; err: boolean } | null>(null)
    const [busy, setBusy] = useState<string | null>(null)

    // New key form
    const [keyName, setKeyName] = useState("")
    const [keyScopes, setKeyScopes] = useState<Set<Scope>>(new Set(["read:sessions", "read:transcripts", "read:config"]))
    const [newKey, setNewKey] = useState<string | null>(null)
    // New webhook form
    const [hookUrl, setHookUrl] = useState("")
    const [hookDesc, setHookDesc] = useState("")
    const [hookEvents, setHookEvents] = useState<Set<ApiEvent>>(new Set(["session.completed", "session.scored", "session.not_scored", "session.failed"]))
    const [newSecret, setNewSecret] = useState<{ value: string; rotated: boolean } | null>(null)

    const load = useCallback(async () => {
        const { data: on, error } = await supabase.rpc("api_enabled", { p_org: orgId })
        if (error) { setBroken(true); setEnabled(false); return }
        setEnabled(!!on)
        if (!on) return
        const [k, h, d] = await Promise.all([
            supabase.rpc("api_keys_list", { p_org: orgId }),
            supabase.rpc("api_webhooks_list", { p_org: orgId }),
            supabase.rpc("api_webhook_deliveries", { p_org: orgId, p_webhook: null, p_limit: 50 }),
        ])
        if (k.error || h.error || d.error) setMsg({ text: userError(k.error ?? h.error ?? d.error, t), err: true })
        setKeys((k.data ?? []) as KeyRow[])
        setHooks((h.data ?? []) as HookRow[])
        setDeliveries((d.data ?? []) as DeliveryRow[])
    }, [orgId, t])

    useEffect(() => { load() }, [load])

    async function run<T = unknown>(label: string, fn: () => PromiseLike<{ data: unknown; error: unknown }>, okText?: string): Promise<T | null> {
        setBusy(label); setMsg(null)
        try {
            const { data, error } = await fn()
            if (error) {
                const raw = String((error as { message?: string })?.message ?? "")
                setMsg({ err: true, text: raw.includes("too_many_keys") ? c.maxKeys
                    : raw.includes("too_many_webhooks") ? c.maxHooks
                    : raw.includes("url_check") ? c.hookUrlBad
                    : userError(error, t) })
                return null
            }
            if (okText) setMsg({ text: okText, err: false })
            await load()
            return (data ?? null) as T | null
        } finally { setBusy(null) }
    }

    if (enabled === null) return <p className="text-sm text-[var(--color-muted)]">…</p>

    if (!enabled) return (
        <div className={CARD + " space-y-2"}>
            {broken ? <p className="text-sm text-[var(--color-text-secondary)]">{c.unavailable}</p> : <>
                <p className="text-sm font-semibold text-[var(--color-text)]">{c.lockedTitle}</p>
                <p className="text-sm text-[var(--color-text-secondary)]">{c.lockedBody}</p>
                <div className="flex gap-4 items-center">
                    <EmailLink email="hello@talkpilot.co" subject={`Enterprise API: ${org.name}`}
                        className="inline-block text-xs font-semibold text-[var(--color-accent-deep)] hover:underline">
                        {c.lockedCta}
                    </EmailLink>
                    <Link href={API_DOCS_URL} className="text-xs text-[var(--color-text-secondary)] hover:underline">{c.docs}</Link>
                </div>
            </>}
        </div>
    )

    const activeKeys = keys.filter(k => !k.revoked_at)
    const toggle = <T,>(set: Set<T>, v: T) => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); return n }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="text-sm text-[var(--color-text-secondary)] max-w-2xl">{c.intro}</p>
                <Link href={API_DOCS_URL} className={BTN_GHOST}>{c.docs}</Link>
            </div>
            <p className="text-xs text-[var(--color-text-secondary)]">
                {c.baseUrl}: <code className="font-mono text-[11px]">{API_BASE_URL}/v1</code>
            </p>
            {msg && <p className={`text-xs ${msg.err ? "text-red-600" : "text-[var(--color-text-secondary)]"}`}>{msg.text}</p>}

            {/* ── Keys ── */}
            <section className={CARD + " space-y-4"}>
                <div>
                    <h3 className="text-sm font-semibold text-[var(--color-text)]">{c.keysTitle}</h3>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-1">{c.keysSub}</p>
                    {org.visibility !== "full_transcripts" && <p className="text-xs text-amber-700 mt-2">{c.transcriptsHidden}</p>}
                </div>

                {newKey && <Secret c={c} title={c.newKeyTitle} body={c.newKeyBody} value={newKey} onDone={() => setNewKey(null)} />}

                {keys.length === 0 ? <p className="text-xs text-[var(--color-muted)]">{c.noKeys}</p> : (
                    <div className="divide-y divide-[var(--color-line-soft)]">
                        {keys.map(k => (
                            <div key={k.id} className={`flex flex-wrap items-start justify-between gap-3 py-3 ${k.revoked_at ? "opacity-50" : ""}`}>
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-[var(--color-text)]">{k.name} <code className="ml-1 text-[11px] font-mono text-[var(--color-muted)]">{k.prefix}…</code></p>
                                    <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">{k.scopes.join(" · ")}</p>
                                    <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                                        {c.created(fmt(k.created_at))} · {k.revoked_at ? `${c.revoked} ${fmt(k.revoked_at)}` : k.last_used_at ? c.lastUsed(fmt(k.last_used_at)) : c.neverUsed}
                                    </p>
                                </div>
                                {!k.revoked_at && (
                                    <button className={BTN_DANGER} disabled={!!busy}
                                        onClick={() => { if (confirm(c.revokeConfirm(k.name))) run("revoke", () => supabase.rpc("api_key_revoke", { p_org: orgId, p_key: k.id })) }}>
                                        {c.revoke}
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {activeKeys.length >= 2 ? <p className="text-xs text-[var(--color-text-secondary)]">{c.maxKeys}</p> : (
                    <div className="space-y-3 border-t border-[var(--color-line-soft)] pt-4">
                        <label className="block">
                            <span className="text-xs font-medium text-[var(--color-text)]">{c.keyName}</span>
                            <input className={INPUT + " mt-1"} value={keyName} maxLength={80} placeholder={c.keyNamePh} onChange={e => setKeyName(e.target.value)} />
                        </label>
                        <fieldset>
                            <legend className="text-xs font-medium text-[var(--color-text)] mb-1">{c.keyScopes}</legend>
                            <div className="grid sm:grid-cols-2 gap-1.5">
                                {SCOPES.map(s => (
                                    <label key={s} className="flex items-start gap-2 text-xs text-[var(--color-text-secondary)]">
                                        <input type="checkbox" className="mt-0.5" checked={keyScopes.has(s)} onChange={() => setKeyScopes(toggle(keyScopes, s))} />
                                        <span>{c.scopeLabels[s]} <code className="text-[10.5px] font-mono text-[var(--color-muted)]">{s}</code></span>
                                    </label>
                                ))}
                            </div>
                        </fieldset>
                        <button className={BTN_PRIMARY} disabled={!!busy} onClick={async () => {
                            if (!keyName.trim()) { setMsg({ text: c.nameNeeded, err: true }); return }
                            if (keyScopes.size === 0) { setMsg({ text: c.pickScope, err: true }); return }
                            const r = await run<{ key: string }>("key", () => supabase.rpc("api_key_create", { p_org: orgId, p_name: keyName.trim(), p_scopes: [...keyScopes] }))
                            if (r?.key) { setNewKey(r.key); setKeyName("") }
                        }}>{busy === "key" ? c.creating : c.createKey}</button>
                    </div>
                )}
            </section>

            {/* ── Webhooks ── */}
            <section className={CARD + " space-y-4"}>
                <div>
                    <h3 className="text-sm font-semibold text-[var(--color-text)]">{c.hooksTitle}</h3>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-1">{c.hooksSub}</p>
                </div>

                {newSecret && <Secret c={c} title={c.newSecretTitle} body={c.newSecretBody} value={newSecret.value}
                    extra={newSecret.rotated ? c.rotatedBody : undefined} onDone={() => setNewSecret(null)} />}

                {hooks.length === 0 ? <p className="text-xs text-[var(--color-muted)]">{c.noHooks}</p> : (
                    <div className="divide-y divide-[var(--color-line-soft)]">
                        {hooks.map(h => (
                            <div key={h.id} className="py-3 space-y-2">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-mono break-all text-[var(--color-text)]">{h.url}</p>
                                        {h.description && <p className="text-xs text-[var(--color-text-secondary)]">{h.description}</p>}
                                        <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">{h.events.join(" · ")}</p>
                                        <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                                            <span className={h.active ? "text-green-700" : ""}>{h.active ? c.active : c.paused}</span>
                                            {h.failures_24h > 0 && <> · <span className="text-red-600">{c.failures(Number(h.failures_24h))}</span></>}
                                            {h.rotating_until && <> · {c.rotating(fmt(h.rotating_until))}</>}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <button className={BTN_GHOST} disabled={!!busy || !h.active}
                                            onClick={() => run("test", () => supabase.rpc("api_webhook_send_test", { p_org: orgId, p_id: h.id }), c.testSent)}>{c.sendTest}</button>
                                        <button className={BTN_GHOST} disabled={!!busy}
                                            onClick={() => run("pause", () => supabase.rpc("api_webhook_update", { p_org: orgId, p_id: h.id, p_active: !h.active }))}>{h.active ? c.pause : c.resume}</button>
                                        <button className={BTN_GHOST} disabled={!!busy} onClick={async () => {
                                            if (!confirm(c.rotateConfirm)) return
                                            const r = await run<{ secret: string }>("rotate", () => supabase.rpc("api_webhook_rotate_secret", { p_org: orgId, p_id: h.id }))
                                            if (r?.secret) setNewSecret({ value: r.secret, rotated: true })
                                        }}>{c.rotate}</button>
                                        <button className={BTN_DANGER} disabled={!!busy}
                                            onClick={() => { if (confirm(c.removeConfirm(h.url))) run("del", () => supabase.rpc("api_webhook_delete", { p_org: orgId, p_id: h.id })) }}>{c.remove}</button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="space-y-3 border-t border-[var(--color-line-soft)] pt-4">
                    <label className="block">
                        <span className="text-xs font-medium text-[var(--color-text)]">{c.hookUrl}</span>
                        <input className={INPUT + " mt-1 font-mono"} value={hookUrl} placeholder={c.hookUrlPh} onChange={e => setHookUrl(e.target.value)} />
                    </label>
                    <fieldset>
                        <legend className="text-xs font-medium text-[var(--color-text)] mb-1">{c.hookEvents}</legend>
                        <div className="grid sm:grid-cols-2 gap-1.5">
                            {EVENTS.map(ev => (
                                <label key={ev} className="flex items-start gap-2 text-xs text-[var(--color-text-secondary)]">
                                    <input type="checkbox" className="mt-0.5" checked={hookEvents.has(ev)} onChange={() => setHookEvents(toggle(hookEvents, ev))} />
                                    <span>{c.eventLabels[ev]} <code className="text-[10.5px] font-mono text-[var(--color-muted)]">{ev}</code></span>
                                </label>
                            ))}
                        </div>
                    </fieldset>
                    <label className="block">
                        <span className="text-xs font-medium text-[var(--color-text)]">{c.hookDesc}</span>
                        <input className={INPUT + " mt-1"} value={hookDesc} maxLength={200} onChange={e => setHookDesc(e.target.value)} />
                    </label>
                    <button className={BTN_PRIMARY} disabled={!!busy} onClick={async () => {
                        if (!/^https:\/\/\S+$/.test(hookUrl.trim())) { setMsg({ text: c.hookUrlBad, err: true }); return }
                        if (hookEvents.size === 0) { setMsg({ text: c.pickEvent, err: true }); return }
                        const r = await run<{ secret: string }>("hook", () => supabase.rpc("api_webhook_create", {
                            p_org: orgId, p_url: hookUrl.trim(), p_events: [...hookEvents], p_description: hookDesc.trim() || null }))
                        if (r?.secret) { setNewSecret({ value: r.secret, rotated: false }); setHookUrl(""); setHookDesc("") }
                    }}>{c.addHook}</button>
                </div>
            </section>

            {/* ── Delivery log ── */}
            {hooks.length > 0 && (
                <section className={CARD + " space-y-3"}>
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-[var(--color-text)]">{c.logTitle}</h3>
                        <button className={BTN_GHOST} onClick={() => load()}>{c.refresh}</button>
                    </div>
                    {deliveries.length === 0 ? <p className="text-xs text-[var(--color-muted)]">{c.logEmpty}</p> : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="text-left text-[var(--color-muted)]">
                                        <th className="py-1 pr-3 font-medium">{c.logWhen}</th>
                                        <th className="py-1 pr-3 font-medium">{c.logEvent}</th>
                                        <th className="py-1 pr-3 font-medium">{c.logStatus}</th>
                                        <th className="py-1 pr-3 font-medium">{c.logTries}</th>
                                        <th />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--color-line-soft)]">
                                    {deliveries.map(d => (
                                        <tr key={d.id}>
                                            <td className="py-1.5 pr-3 whitespace-nowrap text-[var(--color-text-secondary)]">{fmt(d.created_at)}</td>
                                            <td className="py-1.5 pr-3 font-mono">{d.event_type}{d.test && <span className="ml-1 text-[var(--color-muted)]">({c.test})</span>}</td>
                                            <td className={`py-1.5 pr-3 ${d.status === "failed" ? "text-red-600" : d.status === "succeeded" ? "text-green-700" : "text-[var(--color-text-secondary)]"}`}>
                                                {c.statusLabels[d.status] ?? d.status}
                                                {d.last_status_code != null && <span className="text-[var(--color-muted)]"> · HTTP {d.last_status_code}</span>}
                                                {d.status !== "succeeded" && d.last_error && d.last_status_code == null && <span className="text-[var(--color-muted)]"> · {d.last_error}</span>}
                                                {d.status === "pending" && d.attempt_count > 0 && <span className="text-[var(--color-muted)]"> · {c.nextTry(fmt(d.next_attempt_at))}</span>}
                                            </td>
                                            <td className="py-1.5 pr-3">{d.attempt_count}</td>
                                            <td className="py-1.5 text-right">
                                                {(d.status === "failed" || d.status === "succeeded") && (
                                                    <button className={BTN_GHOST} disabled={!!busy}
                                                        onClick={() => run("resend", () => supabase.rpc("api_webhook_resend", { p_org: orgId, p_delivery: d.id }), c.resent)}>{c.resend}</button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            )}
        </div>
    )
}
