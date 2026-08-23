"use client"

import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import type { OrgInfo } from "@/components/orgTabs"

/// Security & access, and the audit trail (D-176). These are the surfaces a
/// procurement or security review asks to see. MFA and SCIM work on any plan;
/// SSO domain claims are stored now and activate when SAML is enabled on a paid
/// plan — see docs/ENTERPRISE_READINESS.md.

const INPUT = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
const BTN_PRIMARY = "px-4 py-2 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] disabled:opacity-40 text-[var(--btn-ink)] text-sm font-medium rounded-lg transition-colors"
const BTN_GHOST = "px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)] border border-[var(--color-border)] hover:border-[var(--color-muted)] rounded-lg transition-colors disabled:opacity-40"
const BTN_DANGER = "px-3 py-1.5 text-xs text-red-600 hover:text-red-700 border border-red-200 hover:border-red-300 rounded-lg transition-colors disabled:opacity-40"
const CARD = "bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm"

const SSO_ENABLED = process.env.NEXT_PUBLIC_SSO_ENABLED === "true"

function Msg({ msg, error }: { msg: string | null; error?: boolean }) {
    if (!msg) return null
    return <p className={`text-xs ${error ? "text-red-600" : "text-emerald-600"}`}>{msg}</p>
}

// ── MFA ─────────────────────────────────────────────────────────────────────
// Supabase Auth has TOTP natively on every plan, so this is real today. It
// enrols the signed-in admin's own account; org-wide enforcement is a policy
// question we don't have a buyer for yet, so it isn't built.

function MfaCard() {
    const [factors, setFactors] = useState<Array<{ id: string; status: string; friendly_name?: string }>>([])
    const [qr, setQr] = useState<string | null>(null)
    const [secret, setSecret] = useState<string | null>(null)
    const [factorId, setFactorId] = useState<string | null>(null)
    const [code, setCode] = useState("")
    const [msg, setMsg] = useState<string | null>(null)
    const [isErr, setIsErr] = useState(false)
    const [busy, setBusy] = useState(false)

    const load = useCallback(async () => {
        const { data } = await supabase.auth.mfa.listFactors()
        setFactors((data?.totp ?? []) as Array<{ id: string; status: string; friendly_name?: string }>)
    }, [])
    useEffect(() => { load() }, [load])

    async function begin() {
        setBusy(true); setMsg(null)
        const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" })
        setBusy(false)
        if (error) { setMsg(error.message); setIsErr(true); return }
        setQr(data.totp.qr_code); setSecret(data.totp.secret); setFactorId(data.id)
    }

    async function confirm() {
        if (!factorId || code.trim().length < 6) return
        setBusy(true); setMsg(null)
        const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId })
        if (chErr) { setBusy(false); setMsg(chErr.message); setIsErr(true); return }
        const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code: code.trim() })
        setBusy(false)
        if (error) { setMsg("That code didn't match. Check your authenticator and try again."); setIsErr(true); return }
        setMsg("Two-factor authentication is on for your account."); setIsErr(false)
        setQr(null); setSecret(null); setFactorId(null); setCode("")
        await load()
    }

    async function remove(id: string) {
        setBusy(true)
        const { error } = await supabase.auth.mfa.unenroll({ factorId: id })
        setBusy(false)
        if (error) { setMsg(error.message); setIsErr(true); return }
        setMsg("Two-factor removed."); setIsErr(false); await load()
    }

    const active = factors.filter(f => f.status === "verified")

    return (
        <div className={CARD + " space-y-4"}>
            <div>
                <h3 className="text-sm font-semibold text-[var(--color-text)]">Two-factor authentication</h3>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                    An authenticator app (1Password, Authy, Google Authenticator) as a second factor on your own
                    admin account. Recommended for anyone who can change the playbook or see call transcripts.
                </p>
            </div>

            {active.length > 0 ? (
                <div className="flex items-center justify-between bg-[var(--color-bg)] rounded-lg px-4 py-3">
                    <span className="text-sm text-emerald-600 font-medium">✓ Enabled on your account</span>
                    <button className={BTN_DANGER} disabled={busy} onClick={() => remove(active[0].id)}>Turn off</button>
                </div>
            ) : qr ? (
                <div className="space-y-3">
                    <p className="text-xs text-[var(--color-text-secondary)]">
                        Scan this with your authenticator app, then enter the 6-digit code it shows.
                    </p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qr} alt="Two-factor QR code" className="w-40 h-40 bg-white rounded-lg p-2" />
                    {secret && (
                        <p className="text-[11px] text-[var(--color-muted)] font-mono break-all">
                            Can&apos;t scan? Enter this key manually: {secret}
                        </p>
                    )}
                    <div className="flex gap-2">
                        <input className={INPUT + " max-w-[160px] font-mono"} placeholder="000000" inputMode="numeric"
                            value={code} onChange={e => setCode(e.target.value)} />
                        <button className={BTN_PRIMARY} disabled={busy || code.trim().length < 6} onClick={confirm}>
                            {busy ? "Verifying…" : "Verify & enable"}
                        </button>
                    </div>
                </div>
            ) : (
                <button className={BTN_PRIMARY} disabled={busy} onClick={begin}>
                    {busy ? "Starting…" : "Set up two-factor"}
                </button>
            )}
            <Msg msg={msg} error={isErr} />
        </div>
    )
}

// ── SSO domains ─────────────────────────────────────────────────────────────

function SsoCard({ orgId }: { orgId: string }) {
    const [rows, setRows] = useState<Array<{ id: string; domain: string; provider_id: string | null; verified_at: string | null }>>([])
    const [domain, setDomain] = useState("")
    const [msg, setMsg] = useState<string | null>(null)
    const [isErr, setIsErr] = useState(false)

    const load = useCallback(async () => {
        const { data } = await supabase.from("org_sso_domains")
            .select("id, domain, provider_id, verified_at").eq("org_id", orgId)
        setRows(data ?? [])
    }, [orgId])
    useEffect(() => { load() }, [load])

    async function add() {
        const d = domain.trim().toLowerCase().replace(/^@/, "")
        if (!d.includes(".")) { setMsg("Enter a domain like acme.com"); setIsErr(true); return }
        const { error } = await supabase.from("org_sso_domains").insert({ org_id: orgId, domain: d })
        if (error) {
            setMsg(error.message.includes("duplicate") ? "That domain is already claimed." : "Couldn't add that domain. Try again.")
            setIsErr(true); return
        }
        setMsg("Domain claimed."); setIsErr(false); setDomain(""); await load()
    }

    async function remove(id: string) {
        await supabase.from("org_sso_domains").delete().eq("id", id)
        await load()
    }

    return (
        <div className={CARD + " space-y-4"}>
            <div>
                <h3 className="text-sm font-semibold text-[var(--color-text)]">Single sign-on (SAML)</h3>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                    Claim the email domains your company owns. Anyone signing in from a claimed domain is sent to
                    your identity provider instead of a password.
                </p>
                {!SSO_ENABLED && (
                    <p className="text-xs text-amber-600 mt-2">
                        Claims are saved now and take effect once SAML is switched on for this workspace —
                        domains added here need no re-entry then.
                    </p>
                )}
            </div>
            <div className="flex gap-2">
                <input className={INPUT} placeholder="acme.com" value={domain} onChange={e => setDomain(e.target.value)} />
                <button className={BTN_PRIMARY} onClick={add} disabled={!domain.trim()}>Claim</button>
            </div>
            {rows.length > 0 && (
                <div className="space-y-2">
                    {rows.map(r => (
                        <div key={r.id} className="flex items-center justify-between bg-[var(--color-bg)] rounded-lg px-4 py-2.5">
                            <span className="text-sm text-[var(--color-text)] font-mono">{r.domain}</span>
                            <div className="flex items-center gap-3">
                                <span className={`text-[10px] uppercase tracking-wide font-semibold ${r.provider_id ? "text-emerald-600" : "text-[var(--color-muted)]"}`}>
                                    {r.provider_id ? "Active" : "Pending activation"}
                                </span>
                                <button className={BTN_GHOST} onClick={() => remove(r.id)}>Remove</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            <Msg msg={msg} error={isErr} />
        </div>
    )
}

// ── SCIM tokens ─────────────────────────────────────────────────────────────

function ScimCard({ orgId }: { orgId: string }) {
    const [rows, setRows] = useState<Array<{ id: string; label: string | null; last_used_at: string | null; created_at: string }>>([])
    const [label, setLabel] = useState("")
    const [fresh, setFresh] = useState<string | null>(null)
    const [msg, setMsg] = useState<string | null>(null)
    const [isErr, setIsErr] = useState(false)

    const load = useCallback(async () => {
        const { data } = await supabase.from("org_scim_tokens")
            .select("id, label, last_used_at, created_at").eq("org_id", orgId).is("revoked_at", null)
            .order("created_at", { ascending: false })
        setRows(data ?? [])
    }, [orgId])
    useEffect(() => { load() }, [load])

    async function create() {
        // Generated in the browser and hashed before it's stored — the server
        // keeps only the SHA-256, so a database leak can't provision anyone.
        const bytes = crypto.getRandomValues(new Uint8Array(32))
        const token = "scim_" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("")
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))
        const hash = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("")

        const { error } = await supabase.from("org_scim_tokens")
            .insert({ org_id: orgId, token_hash: hash, label: label.trim() || "Provisioning token" })
        if (error) { setMsg("Couldn't create the token. Try again."); setIsErr(true); return }
        setFresh(token); setLabel(""); setMsg(null); await load()
    }

    async function revoke(id: string) {
        await supabase.from("org_scim_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id)
        await load()
    }

    const scimUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/scim`

    return (
        <div className={CARD + " space-y-4"}>
            <div>
                <h3 className="text-sm font-semibold text-[var(--color-text)]">Directory sync (SCIM)</h3>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                    Let your identity provider add people automatically — and, more importantly, remove their access
                    the moment they leave. Removing someone frees their seat; it never deletes their personal account.
                </p>
                <p className="text-[11px] text-[var(--color-muted)] mt-2 font-mono break-all">Endpoint: {scimUrl}</p>
            </div>

            {fresh && (
                <div className="bg-[var(--color-accent-subtle)] border border-[var(--color-accent-light)] rounded-lg p-4 space-y-2">
                    <p className="text-xs font-semibold text-[var(--color-accent-deep)]">Copy this now — it isn&apos;t shown again.</p>
                    <p className="font-mono text-[11px] text-[var(--color-text)] break-all select-all">{fresh}</p>
                    <button className={BTN_GHOST} onClick={() => setFresh(null)}>Done</button>
                </div>
            )}

            <div className="flex gap-2">
                <input className={INPUT} placeholder="Okta production" value={label} onChange={e => setLabel(e.target.value)} />
                <button className={BTN_PRIMARY} onClick={create}>Create token</button>
            </div>

            {rows.map(r => (
                <div key={r.id} className="flex items-center justify-between bg-[var(--color-bg)] rounded-lg px-4 py-2.5">
                    <div>
                        <p className="text-sm text-[var(--color-text)]">{r.label}</p>
                        <p className="text-[11px] text-[var(--color-muted)]">
                            {r.last_used_at ? `Last used ${new Date(r.last_used_at).toLocaleString()}` : "Never used"}
                        </p>
                    </div>
                    <button className={BTN_DANGER} onClick={() => revoke(r.id)}>Revoke</button>
                </div>
            ))}
            <Msg msg={msg} error={isErr} />
        </div>
    )
}

// ── Export ──────────────────────────────────────────────────────────────────

function ExportCard({ org }: { org: OrgInfo }) {
    const [busy, setBusy] = useState(false)
    const [msg, setMsg] = useState<string | null>(null)
    const [isErr, setIsErr] = useState(false)

    async function run() {
        setBusy(true); setMsg(null)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/org-export`, {
                method: "POST", headers: { Authorization: `Bearer ${session?.access_token}` },
            })
            if (!res.ok) {
                const e = await res.json().catch(() => ({}))
                setMsg(e?.error?.message ?? "Export failed. Try again."); setIsErr(true); return
            }
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `talkpilot-${org.slug}-${new Date().toISOString().slice(0, 10)}.json`
            document.body.appendChild(a); a.click(); a.remove()
            URL.revokeObjectURL(url)
            setMsg("Downloaded."); setIsErr(false)
        } finally { setBusy(false) }
    }

    return (
        <div className={CARD + " space-y-3"}>
            <div>
                <h3 className="text-sm font-semibold text-[var(--color-text)]">Export your data</h3>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                    Everything this workspace owns — members, playbooks, objections, knowledge, scorecards and the
                    audit trail — as one JSON file. Yours to keep, any time.
                    {org.visibility !== "full_transcripts" && (
                        <> Transcript bodies are excluded, because your visibility setting doesn&apos;t give managers
                        transcript access.</>
                    )}
                </p>
            </div>
            <button className={BTN_PRIMARY} onClick={run} disabled={busy}>
                {busy ? "Preparing…" : "Download export"}
            </button>
            <Msg msg={msg} error={isErr} />
        </div>
    )
}

export function SecurityTab({ orgId, org }: { orgId: string; org: OrgInfo }) {
    return (
        <div className="space-y-6 max-w-3xl">
            <MfaCard />
            <SsoCard orgId={orgId} />
            <ScimCard orgId={orgId} />
            <ExportCard org={org} />
        </div>
    )
}

// ── Audit log ───────────────────────────────────────────────────────────────

interface AuditRow { id: string; action: string; actor_id: string | null; meta: Record<string, unknown> | null; created_at: string }

const ACTION_LABEL: Record<string, string> = {
    "org.created": "Workspace created",
    "org.exported": "Data exported",
    "member.invite_sent": "Invite sent",
    "member.joined": "Member joined",
    "member.role_changed": "Role changed",
    "member.removed": "Member removed",
    "member.deprovisioned": "Deprovisioned via SCIM",
    "member.reactivated": "Reactivated",
    "billing.checkout_started": "Checkout started",
    "billing.subscribed": "Subscribed",
    "retention.purged": "Retention purge",
}

export function AuditTab({ orgId }: { orgId: string }) {
    const [rows, setRows] = useState<AuditRow[]>([])
    const [dir, setDir] = useState<Map<string, string>>(new Map())
    const [q, setQ] = useState("")
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        (async () => {
            const [{ data }, { data: members }] = await Promise.all([
                supabase.from("org_audit_log").select("id, action, actor_id, meta, created_at")
                    .eq("org_id", orgId).order("created_at", { ascending: false }).limit(500),
                supabase.rpc("get_org_members_with_email", { p_org: orgId }),
            ])
            setRows((data ?? []) as AuditRow[])
            const m = new Map<string, string>()
            for (const d of (members ?? []) as Array<{ user_id: string; email: string | null; full_name: string | null }>) {
                m.set(d.user_id, d.full_name || d.email || d.user_id.slice(0, 8))
            }
            setDir(m); setLoading(false)
        })()
    }, [orgId])

    const shown = q.trim()
        ? rows.filter(r => (ACTION_LABEL[r.action] ?? r.action).toLowerCase().includes(q.toLowerCase())
                        || JSON.stringify(r.meta ?? {}).toLowerCase().includes(q.toLowerCase()))
        : rows

    function downloadCsv() {
        const head = "timestamp,action,actor,details\n"
        const body = shown.map(r =>
            [new Date(r.created_at).toISOString(),
             r.action,
             r.actor_id ? (dir.get(r.actor_id) ?? r.actor_id) : "system",
             JSON.stringify(r.meta ?? {}).replace(/"/g, '""')]
            .map(v => `"${v}"`).join(",")).join("\n")
        const url = URL.createObjectURL(new Blob([head + body], { type: "text/csv" }))
        const a = document.createElement("a")
        a.href = url; a.download = `talkpilot-audit-${new Date().toISOString().slice(0, 10)}.csv`
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
    }

    if (loading) return <p className="text-sm text-[var(--color-muted)]">Loading…</p>

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <p className="text-sm text-[var(--color-text-secondary)]">
                    Who changed what, and when. Written by the server — nothing here can be edited from the app.
                </p>
                <div className="flex gap-2">
                    <input className={INPUT + " w-56"} placeholder="Search actions…" value={q} onChange={e => setQ(e.target.value)} />
                    <button className={BTN_GHOST} onClick={downloadCsv} disabled={shown.length === 0}>Export CSV</button>
                </div>
            </div>

            {shown.length === 0 ? (
                <div className={CARD + " text-center py-10"}>
                    <p className="text-sm text-[var(--color-text-secondary)]">
                        {rows.length === 0 ? "No activity recorded yet." : `Nothing matches “${q}”.`}
                    </p>
                    {rows.length === 0 && (
                        <p className="text-xs text-[var(--color-muted)] mt-1">
                            Invites, role changes, deprovisioning, billing and retention purges all land here.
                        </p>
                    )}
                </div>
            ) : (
                <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-line-soft)] shadow-sm">
                    {shown.map(r => (
                        <div key={r.id} className="flex items-start justify-between gap-4 px-4 py-3">
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-[var(--color-text)]">{ACTION_LABEL[r.action] ?? r.action}</p>
                                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                                    {r.actor_id ? (dir.get(r.actor_id) ?? "Someone no longer in this workspace") : "System"}
                                    {r.meta && Object.keys(r.meta).length > 0 && (
                                        <> · <span className="font-mono text-[10.5px]">
                                            {Object.entries(r.meta).slice(0, 3).map(([k, v]) => `${k}=${String(v)}`).join(" ")}
                                        </span></>
                                    )}
                                </p>
                            </div>
                            <span className="text-[11px] text-[var(--color-muted)] shrink-0 tabular-nums">
                                {new Date(r.created_at).toLocaleString()}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
