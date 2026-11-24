"use client"

import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useT } from "@/i18n/LocaleProvider"
import { writeAudit } from "@/lib/orgWrites"
import { userError } from "@/lib/userError"

/// Workspace vocabulary (A5, REQ-18): the words transcription keeps getting
/// wrong (product names, people, jargon). Every app reads them through
/// get_org_context and passes them to Deepgram as keyterms. Admins edit; RLS
/// (`org_vocabulary`) enforces that, so a member sees the list read-only.

const MAX_TERMS = 100
const MAX_LEN = 100

const INPUT = "flex-1 min-w-0 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
const BTN_PRIMARY = "px-4 py-2 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] disabled:opacity-40 text-[var(--btn-ink)] text-sm font-medium rounded-lg transition-colors"
const CARD = "bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm"

interface Term { id: string; term: string }

/// "Acme, Controlify; Sergio" → three terms. Commas, semicolons and new lines
/// all separate, so a pasted list works.
export function splitTerms(raw: string): string[] {
    const seen = new Set<string>()
    const out: string[] = []
    for (const part of raw.split(/[,;\n]+/)) {
        const term = part.replace(/\s+/g, " ").trim().slice(0, MAX_LEN)
        if (!term || seen.has(term.toLowerCase())) continue
        seen.add(term.toLowerCase())
        out.push(term)
    }
    return out
}

export function VocabularyCard({ orgId }: { orgId: string }) {
    const t = useT()
    const v = t.tabs.vocabulary
    const [terms, setTerms] = useState<Term[]>([])
    const [draft, setDraft] = useState("")
    const [busy, setBusy] = useState(false)
    const [loading, setLoading] = useState(true)
    const [msg, setMsg] = useState<string | null>(null)
    const [isErr, setIsErr] = useState(false)

    const load = useCallback(async () => {
        const { data, error } = await supabase.from("org_vocabulary")
            .select("id, term").eq("org_id", orgId).order("term")
        if (error) { setMsg(userError(error, t)); setIsErr(true) }
        setTerms((data ?? []) as Term[])
        setLoading(false)
    }, [orgId, t])

    useEffect(() => { load() }, [load])

    async function add() {
        const have = new Set(terms.map(x => x.term.toLowerCase()))
        const fresh = splitTerms(draft).filter(x => !have.has(x.toLowerCase()))
        if (fresh.length === 0) { setDraft(""); return }
        if (terms.length + fresh.length > MAX_TERMS) { setMsg(v.tooMany(MAX_TERMS)); setIsErr(true); return }
        setBusy(true); setMsg(null)
        const { data: { session } } = await supabase.auth.getSession()
        const { error } = await supabase.from("org_vocabulary")
            .insert(fresh.map(term => ({ org_id: orgId, term, created_by: session?.user.id ?? null })))
        setBusy(false)
        // 23505 = already there (someone else added it meanwhile): the end
        // state the admin wanted holds, so it is not an error.
        if (error && (error as { code?: string }).code !== "23505") { setMsg(userError(error, t)); setIsErr(true); return }
        await writeAudit(supabase, orgId, "vocabulary.added", null, { terms: fresh })
        setDraft(""); setMsg(v.added(fresh.length)); setIsErr(false)
        await load()
    }

    async function remove(x: Term) {
        setTerms(prev => prev.filter(y => y.id !== x.id))
        const { error } = await supabase.from("org_vocabulary").delete().eq("id", x.id)
        if (error) { setMsg(userError(error, t)); setIsErr(true); await load(); return }
        await writeAudit(supabase, orgId, "vocabulary.removed", x.id, { term: x.term })
        setMsg(null)
    }

    return (
        <div className={CARD + " space-y-3"}>
            <div>
                <h3 className="text-sm font-semibold text-[var(--color-text)]">{v.title}</h3>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">{v.sub}</p>
            </div>
            <div className="flex gap-2">
                <input
                    className={INPUT}
                    placeholder={v.placeholder}
                    value={draft}
                    maxLength={2000}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add() } }}
                />
                <button className={BTN_PRIMARY} onClick={add} disabled={busy || !draft.trim()}>{v.add}</button>
            </div>
            {loading ? null : terms.length === 0 ? (
                <p className="text-xs text-[var(--color-muted)]">{v.empty}</p>
            ) : (
                <div className="flex flex-wrap gap-1.5">
                    {terms.map(x => (
                        <span key={x.id} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)]">
                            {x.term}
                            <button
                                onClick={() => remove(x)}
                                aria-label={v.remove(x.term)}
                                title={v.remove(x.term)}
                                className="text-[var(--color-muted)] hover:text-red-600 leading-none"
                            >×</button>
                        </span>
                    ))}
                </div>
            )}
            <p className="text-[11px] text-[var(--color-muted)]">{v.count(terms.length, MAX_TERMS)}</p>
            {msg && <p className={`text-xs ${isErr ? "text-red-600" : "text-emerald-600"}`}>{msg}</p>}
        </div>
    )
}
