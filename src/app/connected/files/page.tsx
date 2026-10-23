"use client"

// D-673: pick Google Drive or SharePoint / OneDrive files that become personal
// documents in TalkPilot (the same plus_documents pipeline as an upload).
//
// The google-drive-callback / microsoft-callback edge functions land the
// browser here after OAuth with ?provider=google_drive|microsoft_files,
// ?scheme=<app scheme> and ?ticket=<30-minute HMAC ticket>. Nobody is signed
// in on this page (the connect started in the native app): every call goes
// to the `files-picker` edge function with the ticket.
//
//   Google:    Google Picker (drive.file), then `import` per picked item.
//   Microsoft: a small browser over `ms_browse` (Recent, My files, SharePoint
//              sites, search, folders), then `import` per selected item.
//
// "Done" deep-links back into the app the same way /connected does, which is
// what closes ASWebAuthenticationSession on iOS.

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { useLocale } from "@/i18n/LocaleProvider"

// Mirrors SCHEME_RE in the edge functions' _shared/integrationState.ts.
const SCHEME_RE = /^(talkpilot|co\.talkpilot)[a-z0-9.-]*$/
const FUNCTION_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/files-picker`

type Provider = "google_drive" | "microsoft_files"

type BrowseItem = {
    id: string; driveId: string | null; name: string; mimeType: string | null; size: number | null
    modified: string | null; isFolder: boolean; kind: "file" | "folder" | "site" | "drive"; webUrl: string | null
}

type ImportResult =
    | { id: string; name: string; ok: true; document_id: string; replaced: boolean }
    | { id: string; name: string; ok: false; error: string }

type Picked = { id: string; driveId?: string | null; name: string }

class PickerError extends Error {
    constructor(public code: string) { super(code) }
}

async function callPicker<T>(ticket: string, payload: Record<string, unknown>): Promise<T> {
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const res = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(anon ? { apikey: anon } : {}) },
        body: JSON.stringify({ ticket, ...payload }),
    })
    const body = await res.json().catch(() => ({})) as { error?: string }
    if (!res.ok) throw new PickerError(body.error ?? "server")
    return body as T
}

// Google's loader puts these on window; typed loosely on purpose.
/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
    interface Window { gapi?: any; google?: any }
}

function loadGapi(): Promise<void> {
    return new Promise((resolve, reject) => {
        const ready = () => window.gapi!.load("picker", { callback: () => resolve(), onerror: () => reject(new Error("picker")) })
        if (window.gapi) return ready()
        const s = document.createElement("script")
        s.src = "https://apis.google.com/js/api.js"
        s.async = true
        s.onload = ready
        s.onerror = () => reject(new Error("gapi"))
        document.head.appendChild(s)
    })
}

export default function ConnectedFilesPage() {
    return (
        <Suspense fallback={null}>
            <FilesContent />
        </Suspense>
    )
}

function FilesContent() {
    const { t: dict, locale } = useLocale()
    const t = dict.connectedFiles
    const params = useSearchParams()

    // Read once, then dropped from the address bar so it does not linger in
    // history or get copied along with the link.
    // A reload finds it again in sessionStorage (this tab only, gone when
    // the tab closes; the ticket itself dies after 30 minutes anyway).
    const [ticket] = useState(() => {
        const fromUrl = params.get("ticket") ?? ""
        if (typeof window === "undefined") return fromUrl
        try {
            if (fromUrl) sessionStorage.setItem("tp_files_ticket", fromUrl)
            return fromUrl || sessionStorage.getItem("tp_files_ticket") || ""
        } catch {
            return fromUrl
        }
    })
    useEffect(() => {
        const url = new URL(window.location.href)
        if (!url.searchParams.has("ticket")) return
        url.searchParams.delete("ticket")
        window.history.replaceState(window.history.state, "", url.toString())
    }, [])
    const provider = (params.get("provider") === "microsoft_files" ? "microsoft_files" : "google_drive") as Provider
    const schemeParam = params.get("scheme") ?? "talkpilot"
    const scheme = SCHEME_RE.test(schemeParam) ? schemeParam : "talkpilot"
    const deepLink = `${scheme}://oauth-callback?provider=${encodeURIComponent(provider)}&success=true`

    const [fatal, setFatal] = useState<string | null>(null)
    useEffect(() => { if (!ticket) setFatal("invalid_ticket") }, [ticket])
    const [busy, setBusy] = useState(false)
    const [results, setResults] = useState<ImportResult[]>([])
    // Everything picked shows at once with a spinner, and each row turns into
    // its result as it lands: adding 5 files used to show nothing until each
    // one finished, so it looked like some were missing.
    const [pending, setPending] = useState<Picked[]>([])
    const [progress, setProgress] = useState({ done: 0, total: 0 })

    const fatalMessage = (code: string) => {
        switch (code) {
            case "invalid_ticket": return t.expired
            case "not_connected": return t.notConnected
            case "reauth_required": return t.reauth
            case "not_configured": return t.notConfigured
            case "pro_required": return t.proRequired
            default: return t.genericError
        }
    }

    /// One picked item per call: a folder can expand to 20 files, and each
    /// call has to finish inside the edge function's time limit.
    const importPicked = useCallback(async (picked: Picked[]) => {
        if (!picked.length) return
        setBusy(true)
        setPending(picked)
        setProgress({ done: 0, total: picked.length })
        try {
            for (const p of picked) {
                try {
                    const res = await callPicker<{ results: ImportResult[] }>(ticket, {
                        action: "import", items: [{ id: p.id, driveId: p.driveId ?? undefined, name: p.name }],
                    })
                    setResults((prev) => [...prev.filter((r) => !res.results.some((n) => n.id === r.id)), ...res.results])
                } catch (e) {
                    const code = e instanceof PickerError ? e.code : "server"
                    if (["invalid_ticket", "not_connected", "reauth_required", "pro_required"].includes(code)) {
                        setFatal(code)
                        return
                    }
                    setResults((prev) => [...prev, { id: p.id, name: p.name, ok: false, error: code }])
                } finally {
                    setPending((prev) => prev.filter((x) => x.id !== p.id))
                    setProgress((prev) => ({ ...prev, done: prev.done + 1 }))
                }
            }
        } finally {
            setPending([])
            setBusy(false)
        }
    }, [ticket])

    const imported = results.filter((r) => r.ok).length

    return (
        <div className="min-h-screen flex items-start sm:items-center justify-center bg-[var(--color-bg)] px-4 py-10">
            <div className="w-full max-w-xl bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl px-6 sm:px-10 py-9 shadow-sm">
                <h1 className="text-lg font-semibold text-[var(--color-text)] mb-2">
                    {provider === "google_drive" ? t.titleGoogle : t.titleMicrosoft}
                </h1>
                <p className="text-sm text-[var(--color-muted)] leading-relaxed mb-1">{t.intro}</p>
                <p className="text-xs text-[var(--color-muted)] leading-relaxed mb-6">{t.folderNote}</p>

                {fatal ? (
                    <p className="text-sm text-[#C4534A] mb-6">{fatalMessage(fatal)}</p>
                ) : provider === "google_drive" ? (
                    <GooglePicker ticket={ticket} locale={locale} disabled={busy} onPicked={importPicked} onFatal={setFatal} label={t.openPicker} loading={t.loading} />
                ) : (
                    <MicrosoftBrowser ticket={ticket} disabled={busy} onPicked={importPicked} onFatal={setFatal} />
                )}

                {busy && (
                    <p className="text-sm text-[var(--color-muted)] mt-5 flex items-center gap-2">
                        <Spinner />
                        {progress.total > 1 ? t.addingProgress(progress.done, progress.total) : t.adding}
                    </p>
                )}

                {(results.length > 0 || pending.length > 0) && (
                    <ul className="mt-6 divide-y divide-[var(--color-border)] border border-[var(--color-border)] rounded-xl">
                        {results.map((r) => (
                            <li key={r.id} className="px-4 py-2.5 flex items-start justify-between gap-3 text-sm">
                                <span className="text-[var(--color-text)] break-all">{r.name}</span>
                                <span className={`shrink-0 text-right ${r.ok ? "text-[var(--color-accent)]" : "text-[#C4534A]"}`}>
                                    {r.ok ? (r.replaced ? t.updated : t.added) : (t.reasons[r.error] ?? t.genericError)}
                                </span>
                            </li>
                        ))}
                        {pending.map((p) => (
                            <li key={`pending-${p.id}`} className="px-4 py-2.5 flex items-start justify-between gap-3 text-sm">
                                <span className="text-[var(--color-muted)] break-all">{p.name}</span>
                                <span className="shrink-0 flex items-center gap-1.5 text-[var(--color-muted)]">
                                    <Spinner />
                                    {t.addingOne}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}

                <div className="mt-8 text-center">
                    {imported > 0 && !busy && (
                        <>
                            <p className="text-base font-semibold text-[var(--color-text)] mb-1">{t.doneTitle}</p>
                            <p className="text-sm text-[var(--color-muted)] mb-5">{t.doneBody(imported)}</p>
                        </>
                    )}
                    <a
                        href={deepLink}
                        aria-disabled={busy}
                        className={`inline-block px-6 py-2.5 rounded-full bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] text-[var(--btn-ink)] text-sm font-semibold transition-colors ${busy ? "pointer-events-none opacity-50" : ""}`}
                    >
                        {t.done}
                    </a>
                </div>
                <div className="mt-7 text-center text-[11px] font-semibold tracking-[0.08em] text-[var(--color-muted)]">
                    TALKPILOT
                </div>
            </div>
        </div>
    )
}

function Spinner() {
    return (
        <span
            aria-hidden
            className="inline-block h-3.5 w-3.5 rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-accent)] animate-spin"
        />
    )
}

// ── Google Picker ────────────────────────────────────────────────────────────

function GooglePicker({ ticket, locale, disabled, onPicked, onFatal, label, loading }: {
    ticket: string; locale: string; disabled: boolean
    onPicked: (p: Picked[]) => void; onFatal: (code: string) => void
    label: string; loading: string
}) {
    const [ready, setReady] = useState(false)
    const auth = useRef<{ access_token: string; api_key: string; app_id: string; expires_at: number } | null>(null)
    const opened = useRef(false)

    const token = useCallback(async () => {
        if (auth.current && auth.current.expires_at > Date.now() + 60_000) return auth.current
        const r = await callPicker<{ access_token: string; expires_in: number; api_key: string; app_id: string }>(ticket, { action: "google_token" })
        auth.current = { ...r, expires_at: Date.now() + r.expires_in * 1000 }
        return auth.current
    }, [ticket])

    const open = useCallback(async () => {
        try {
            const a = await token()
            const g = window.google
            const view = new g.picker.DocsView(g.picker.ViewId.DOCS)
                .setIncludeFolders(true)
                .setSelectFolderEnabled(true)
            const picker = new g.picker.PickerBuilder()
                .addView(view)
                .enableFeature(g.picker.Feature.MULTISELECT_ENABLED)
                .setOAuthToken(a.access_token)
                .setDeveloperKey(a.api_key)
                .setAppId(a.app_id)
                .setLocale(locale === "es" ? "es-419" : "en")
                .setCallback((data: any) => {
                    if (data?.action !== g.picker.Action.PICKED) return
                    const docs = (data.docs ?? []) as Array<{ id: string; name?: string }>
                    onPicked(docs.map((d) => ({ id: d.id, name: d.name ?? d.id })))
                })
                .build()
            picker.setVisible(true)
        } catch (e) {
            onFatal(e instanceof PickerError ? e.code : "server")
        }
    }, [token, locale, onPicked, onFatal])

    useEffect(() => {
        let cancelled = false
        Promise.all([loadGapi(), token()])
            .then(() => { if (!cancelled) setReady(true) })
            .catch((e) => { if (!cancelled) onFatal(e instanceof PickerError ? e.code : "server") })
        return () => { cancelled = true }
    }, [token, onFatal])

    // Open once on arrival; the button reopens it for more files.
    useEffect(() => {
        if (ready && !opened.current) {
            opened.current = true
            void open()
        }
    }, [ready, open])

    return (
        <button
            type="button"
            disabled={!ready || disabled}
            onClick={() => void open()}
            className="px-5 py-2.5 rounded-full border border-[var(--color-border)] text-sm font-semibold text-[var(--color-text)] hover:bg-[var(--color-bg)] disabled:opacity-50"
        >
            {ready ? label : loading}
        </button>
    )
}

// ── Microsoft browser ────────────────────────────────────────────────────────

type View =
    | { view: "recent" } | { view: "root" } | { view: "sites" }
    | { view: "search"; query: string }
    | { view: "site_drives"; site_id: string }
    | { view: "drive"; drive_id: string }
    | { view: "folder"; drive_id: string; item_id: string }

type Crumb = { name: string; req: View }

function MicrosoftBrowser({ ticket, disabled, onPicked, onFatal }: {
    ticket: string; disabled: boolean
    onPicked: (p: Picked[]) => void; onFatal: (code: string) => void
}) {
    const { t: dict } = useLocale()
    const t = dict.connectedFiles
    const [trail, setTrail] = useState<Crumb[]>([{ name: t.recent, req: { view: "recent" } }])
    const [items, setItems] = useState<BrowseItem[] | null>(null)
    const [sitesError, setSitesError] = useState(false)
    const [query, setQuery] = useState("")
    const [selected, setSelected] = useState<Map<string, Picked>>(new Map())

    const current = trail[trail.length - 1]

    useEffect(() => {
        let cancelled = false
        setItems(null)
        callPicker<{ items: BrowseItem[]; error?: string }>(ticket, { action: "ms_browse", ...current.req })
            .then((r) => {
                if (cancelled) return
                setItems(r.items)
                setSitesError(current.req.view === "sites" && Boolean(r.error))
            })
            .catch((e) => { if (!cancelled) onFatal(e instanceof PickerError ? e.code : "server") })
        return () => { cancelled = true }
    }, [ticket, current, onFatal])

    const go = (root: Crumb) => setTrail([root])
    const enter = (it: BrowseItem) => {
        const req: View = it.kind === "site"
            ? { view: "site_drives", site_id: it.id }
            : it.kind === "drive"
                ? { view: "drive", drive_id: it.id }
                : { view: "folder", drive_id: it.driveId ?? "", item_id: it.id }
        setTrail((prev) => [...prev, { name: it.name, req }])
    }
    const keyOf = (it: BrowseItem) => `${it.driveId ?? ""}/${it.id}`
    const toggle = (it: BrowseItem) => setSelected((prev) => {
        const next = new Map(prev)
        const k = keyOf(it)
        if (next.has(k)) next.delete(k)
        else next.set(k, { id: it.id, driveId: it.driveId, name: it.name })
        return next
    })

    const tabs: Crumb[] = useMemo(() => [
        { name: t.recent, req: { view: "recent" } },
        { name: t.myFiles, req: { view: "root" } },
        { name: t.sites, req: { view: "sites" } },
    ], [t])

    const submitSearch = (e: React.FormEvent) => {
        e.preventDefault()
        const q = query.trim()
        if (q) go({ name: `“${q}”`, req: { view: "search", query: q } })
    }

    const add = () => {
        const picked = [...selected.values()]
        setSelected(new Map())
        onPicked(picked)
    }

    return (
        <div>
            <div className="flex flex-wrap gap-2 mb-3">
                {tabs.map((tab) => (
                    <button
                        key={tab.req.view}
                        type="button"
                        onClick={() => go(tab)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${trail.length === 1 && trail[0].req.view === tab.req.view
                            ? "bg-[var(--btn-bg)] text-[var(--btn-ink)] border-transparent"
                            : "border-[var(--color-border)] text-[var(--color-text)]"}`}
                    >
                        {tab.name}
                    </button>
                ))}
            </div>
            <form onSubmit={submitSearch} className="flex gap-2 mb-4">
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t.searchPlaceholder}
                    className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)]"
                />
                <button type="submit" className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm font-semibold text-[var(--color-text)]">
                    {t.search}
                </button>
            </form>

            {trail.length > 1 && (
                <div className="flex items-center gap-2 text-xs text-[var(--color-muted)] mb-2 flex-wrap">
                    <button type="button" onClick={() => setTrail((p) => p.slice(0, -1))} className="font-semibold text-[var(--color-text)]">
                        ← {t.back}
                    </button>
                    <span className="truncate">{trail.map((c) => c.name).join(" / ")}</span>
                </div>
            )}

            <div className="border border-[var(--color-border)] rounded-xl max-h-80 overflow-y-auto">
                {items === null ? (
                    <p className="px-4 py-3 text-sm text-[var(--color-muted)]">{t.loading}</p>
                ) : items.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-[var(--color-muted)]">
                        {current.req.view === "sites" || sitesError ? t.noSites : t.empty}
                    </p>
                ) : (
                    <ul className="divide-y divide-[var(--color-border)]">
                        {items.map((it) => {
                            const selectable = it.kind === "file" || it.kind === "folder"
                            const browsable = it.isFolder
                            return (
                                <li key={keyOf(it)} className="px-3 py-2 flex items-center gap-3 text-sm">
                                    {selectable ? (
                                        <input
                                            type="checkbox"
                                            checked={selected.has(keyOf(it))}
                                            onChange={() => toggle(it)}
                                            className="shrink-0"
                                            aria-label={it.name}
                                        />
                                    ) : <span className="w-[13px] shrink-0" />}
                                    {browsable ? (
                                        <button type="button" onClick={() => enter(it)} className="flex-1 min-w-0 text-left text-[var(--color-text)] hover:underline truncate">
                                            📁 {it.name}
                                        </button>
                                    ) : (
                                        <span className="flex-1 min-w-0 text-[var(--color-text)] truncate">{it.name}</span>
                                    )}
                                </li>
                            )
                        })}
                    </ul>
                )}
            </div>

            <button
                type="button"
                disabled={disabled || selected.size === 0}
                onClick={add}
                className="mt-4 px-5 py-2.5 rounded-full bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] text-[var(--btn-ink)] text-sm font-semibold disabled:opacity-50"
            >
                {t.addSelected(selected.size)}
            </button>
        </div>
    )
}
