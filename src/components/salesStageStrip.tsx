"use client"

import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useLocale } from "@/i18n/LocaleProvider"
import { embedObjections, approvedResponsesFrom, guidanceOf } from "@/lib/orgBrain"
import { stageLabel, stageCopy, type SalesStage } from "@/lib/salesStages"

/// Stage helpers for the Playbook page (D-733, D-740, D-736).
///
/// D-736 replaced the old chip strip with the stage cards and stage view in
/// playbookStudio. What stays here is the data side: which stages are on, and
/// the objections list of one stage. Playbooks themselves are still written
/// only by the tab's editor.

export type StageFilter = SalesStage | "all" | "none"

export interface StageRow { stage: string; enabled: boolean; tone: string | null }
interface ObjLite  { id: string; objection: string; response_guidance: string | null; approved_responses: { text?: string }[] | null; active: boolean; sales_stages: string[] | null }

const INPUT = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
const BTN_PRIMARY = "min-h-11 px-4 py-2 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] disabled:opacity-40 text-[var(--btn-ink)] text-sm font-medium rounded-lg transition-colors"
const BTN_GHOST = "min-h-11 px-3.5 py-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] border border-[var(--color-border)] hover:border-[var(--color-muted)] rounded-lg transition-colors disabled:opacity-40"

/// Which stages this org has turned on. Shared with the tab's editor so its
/// stage select can mark the off ones.
export function useEnabledStages(orgId: string) {
    const [rows, setRows] = useState<StageRow[]>([])
    const load = useCallback(async () => {
        const { data } = await supabase.from("org_sales_stages")
            .select("stage, enabled, tone").eq("org_id", orgId)
        setRows((data ?? []) as StageRow[])
    }, [orgId])
    useEffect(() => { load() }, [load])
    return { rows, reload: load }
}

/// The objections that belong to one stage, with ways to add one from the
/// library, write a new one, move one out or widen it to every stage.
export function StageObjections({ orgId, stage }: { orgId: string; stage: SalesStage }) {
    const { locale } = useLocale()
    const c = stageCopy(locale)
    const [busy, setBusy] = useState(false)
    const [msg, setMsg]   = useState<{ text: string; err: boolean } | null>(null)
    const [objs, setObjs] = useState<ObjLite[]>([])
    const [newObj, setNewObj] = useState("")
    const [newAns, setNewAns] = useState("")
    const [adding, setAdding] = useState(false)

    const loadObjs = useCallback(async () => {
        const { data } = await supabase.from("org_objections")
            .select("id, objection, response_guidance, approved_responses, active, sales_stages")
            .eq("org_id", orgId).eq("active", true).order("created_at", { ascending: true }).limit(1000)
        setObjs((data ?? []) as ObjLite[])
    }, [orgId])
    useEffect(() => { loadObjs() }, [loadObjs])

    async function setObjStages(o: ObjLite, next: string[]) {
        const { error } = await supabase.from("org_objections").update({ sales_stages: next }).eq("id", o.id)
        if (error) { setMsg({ text: c.saveError, err: true }); return }
        setObjs(prev => prev.map(x => x.id === o.id ? { ...x, sales_stages: next } : x))
    }

    async function addNew() {
        if (!newObj.trim()) return
        setBusy(true); setMsg(null)
        const { data, error } = await supabase.from("org_objections").insert({
            org_id: orgId,
            objection: newObj.trim(),
            response_guidance: newAns.trim() || null,
            approved_responses: approvedResponsesFrom(newAns),
            severity: "normal",
            variants: [],
            active: true,
            source: "manual",
            sales_stages: [stage],
        }).select("id").single()
        if (error) { setBusy(false); setMsg({ text: c.saveError, err: true }); return }
        // Same indexing step as the Objections tab, so the lookup finds it too.
        await embedObjections(orgId, data ? [data.id as string] : [])
        setBusy(false)
        setNewObj(""); setNewAns(""); setAdding(false)
        await loadObjs()
    }

    const inStage  = objs.filter(o => (o.sales_stages ?? []).includes(stage))
    const allStage = objs.filter(o => (o.sales_stages ?? []).length === 0)
    // Offer only stage-scoped objections from other stages: adding an
    // all-stage one here would narrow it to fewer stages, which is a removal
    // dressed up as an add.
    const addable  = objs.filter(o => (o.sales_stages ?? []).length > 0 && !(o.sales_stages ?? []).includes(stage))

    return (
        <div className="space-y-3">
            <div>
                <h2 className="text-[17px] font-bold text-[var(--color-text)]">{c.objectionsTitle}</h2>
                {allStage.length > 0 && <p className="text-[13px] text-[var(--color-text-secondary)] mt-0.5">{c.allStageNote(allStage.length)}</p>}
            </div>
            {inStage.length === 0 && <p className="text-sm text-[var(--color-text-secondary)]">{c.objectionsNone}</p>}
            <ul className="space-y-2">
                {inStage.map(o => (
                    <li key={o.id} className="flex flex-wrap items-start justify-between gap-3 rounded-[12px] border border-[var(--color-border)] px-3.5 py-3">
                        <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-semibold text-[var(--color-text)]">&ldquo;{o.objection}&rdquo;</p>
                            {guidanceOf(o) && <p className="text-sm text-[var(--color-text-secondary)] mt-0.5 line-clamp-2">{guidanceOf(o)}</p>}
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                            <button className={BTN_GHOST} onClick={() => setObjStages(o, (o.sales_stages ?? []).filter(s => s !== stage))}>{c.removeFromStage}</button>
                            <button className={BTN_GHOST} onClick={() => setObjStages(o, [])}>{c.makeAllStages}</button>
                        </div>
                    </li>
                ))}
            </ul>
            <div className="flex flex-wrap items-center gap-2.5">
                {!adding && <button className={BTN_GHOST} onClick={() => setAdding(true)}>+ {c.addNew}</button>}
                {addable.length > 0 && (
                    <select className={INPUT + " w-auto min-h-11"} value="" aria-label={c.addExisting} onChange={e => {
                        const o = addable.find(x => x.id === e.target.value)
                        if (o) setObjStages(o, [...(o.sales_stages ?? []), stage])
                    }}>
                        <option value="">{c.addExisting}</option>
                        {addable.map(o => <option key={o.id} value={o.id}>{o.objection}</option>)}
                    </select>
                )}
            </div>
            {adding && (
                <div className="space-y-2 rounded-[12px] bg-[var(--color-bg)] border border-[var(--color-border)] p-3.5">
                    <input className={INPUT} placeholder={c.objectionPlaceholder} value={newObj} onChange={e => setNewObj(e.target.value)} autoFocus />
                    <textarea className={INPUT + " resize-none"} rows={2} placeholder={c.answerPlaceholder} value={newAns} onChange={e => setNewAns(e.target.value)} />
                    <div className="flex gap-2">
                        <button className={BTN_PRIMARY} disabled={busy || !newObj.trim()} onClick={addNew}>{c.add}</button>
                        <button className={BTN_GHOST} onClick={() => { setAdding(false); setNewObj(""); setNewAns("") }}>{c.cancel}</button>
                    </div>
                </div>
            )}
            {msg && <p className={`text-xs ${msg.err ? "text-red-600" : "text-emerald-600"}`}>{msg.text}</p>}
        </div>
    )
}

/// The small "Discovery" / "All stages" badge for an objection row.
export function ObjectionStageBadge({ stages }: { stages: string[] | null | undefined }) {
    const { locale } = useLocale()
    const c = stageCopy(locale)
    const list = (stages ?? []).map(s => stageLabel(s, locale)).filter(Boolean) as string[]
    return (
        <span className="text-xs border border-[var(--color-border)] text-[var(--color-text-secondary)] px-1.5 py-0.5 rounded">
            {list.length === 0 ? c.allStagesBadge : list.join(", ")}
        </span>
    )
}
