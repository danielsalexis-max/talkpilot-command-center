"use client"

import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useLocale } from "@/i18n/LocaleProvider"
import { embedObjections, approvedResponsesFrom, guidanceOf } from "@/lib/orgBrain"
import { SALES_STAGES, isSalesStage, stageLabel, stageCopy, type SalesStage } from "@/lib/salesStages"

/// The stage strip on the Playbook tab (D-733, D-740).
///
/// One chip per fixed stage, plus "All" and, when any exist, "No stage". A
/// chip filters the playbook list below; on a stage chip a panel opens with
/// that stage's switch, its tone and its objections. Playbooks themselves are
/// still created by the tab's editor and import button: this component only
/// asks the tab to start one for a stage, so the editor stays the one writer
/// of `org_playbooks`.

export type StageFilter = SalesStage | "all" | "none"

interface StageRow { stage: string; enabled: boolean; tone: string | null }
interface ObjLite  { id: string; objection: string; response_guidance: string | null; approved_responses: { text?: string }[] | null; active: boolean; sales_stages: string[] | null }

const CHIP_ON  = "bg-[var(--btn-bg)] text-[var(--btn-ink)] border-[var(--btn-bg)]"
const CHIP_OFF = "bg-[var(--color-bg)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
const INPUT = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
const BTN_PRIMARY = "px-4 py-2 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] disabled:opacity-40 text-[var(--btn-ink)] text-sm font-medium rounded-lg transition-colors"
const BTN_GHOST = "px-3 py-1.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)] border border-[var(--color-border)] hover:border-[var(--color-muted)] rounded-lg transition-colors disabled:opacity-40"
const CARD = "bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 shadow-sm"

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

export function SalesStageStrip({
    orgId, playbookStages, selected, onSelect, onUploadForStage, onNewForStage, stages, reloadStages,
}: {
    orgId: string
    /// `sales_stage` of every playbook in the list, for the counts.
    playbookStages: (string | null)[]
    selected: StageFilter
    onSelect: (f: StageFilter) => void
    onUploadForStage: (stage: SalesStage) => void
    onNewForStage: (stage: SalesStage) => void
    stages: StageRow[]
    reloadStages: () => Promise<void>
}) {
    const { locale } = useLocale()
    const c = stageCopy(locale)
    const enabled = new Set(stages.filter(s => s.enabled).map(s => s.stage))
    const count = (s: SalesStage) => playbookStages.filter(x => x === s).length
    const unassigned = playbookStages.filter(x => !isSalesStage(x)).length

    return (
        <div className={CARD}>
            <h3 className="text-sm font-semibold text-[var(--color-text)]">{c.stripTitle}</h3>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{c.stripSub}</p>
            <div className="mt-4 flex flex-wrap gap-2" role="tablist">
                <button role="tab" aria-selected={selected === "all"}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${selected === "all" ? CHIP_ON : CHIP_OFF}`}
                    onClick={() => onSelect("all")}>
                    {c.all} · {playbookStages.length}
                </button>
                {SALES_STAGES.map(s => {
                    const on = enabled.has(s)
                    const n = count(s)
                    return (
                        <button key={s} role="tab" aria-selected={selected === s}
                            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${selected === s ? CHIP_ON : CHIP_OFF} ${on || selected === s ? "" : "opacity-50 border-dashed"}`}
                            onClick={() => onSelect(s)}>
                            {stageLabel(s, locale)}{n > 0 ? ` · ${n}` : ""}
                        </button>
                    )
                })}
                {unassigned > 0 && (
                    <button role="tab" aria-selected={selected === "none"}
                        className={`text-xs px-3 py-1.5 rounded-full border border-dashed transition-colors ${selected === "none" ? CHIP_ON : CHIP_OFF}`}
                        onClick={() => onSelect("none")}>
                        {c.unassigned} · {unassigned}
                    </button>
                )}
            </div>
            {selected === "none" && unassigned > 0 && (
                <p className="mt-3 text-xs text-amber-700">{c.unassignedNote(unassigned)}</p>
            )}
            {isSalesStage(selected) && (
                <StagePanel key={selected} orgId={orgId} stage={selected}
                    row={stages.find(s => s.stage === selected) ?? null}
                    playbookCount={count(selected)}
                    onChanged={reloadStages}
                    onUpload={() => onUploadForStage(selected)}
                    onNew={() => onNewForStage(selected)} />
            )}
        </div>
    )
}

function StagePanel({
    orgId, stage, row, playbookCount, onChanged, onUpload, onNew,
}: {
    orgId: string; stage: SalesStage; row: StageRow | null; playbookCount: number
    onChanged: () => Promise<void>; onUpload: () => void; onNew: () => void
}) {
    const { locale } = useLocale()
    const c = stageCopy(locale)
    const on = row?.enabled ?? false
    const [tone, setTone] = useState(row?.tone ?? "")
    const [busy, setBusy] = useState(false)
    const [msg, setMsg]   = useState<{ text: string; err: boolean } | null>(null)
    const [objs, setObjs] = useState<ObjLite[]>([])
    const [newObj, setNewObj] = useState("")
    const [newAns, setNewAns] = useState("")

    const loadObjs = useCallback(async () => {
        const { data } = await supabase.from("org_objections")
            .select("id, objection, response_guidance, approved_responses, active, sales_stages")
            .eq("org_id", orgId).eq("active", true).order("created_at", { ascending: true }).limit(1000)
        setObjs((data ?? []) as ObjLite[])
    }, [orgId])
    useEffect(() => { loadObjs() }, [loadObjs])

    async function upsert(patch: Partial<StageRow>) {
        setBusy(true); setMsg(null)
        const { error } = await supabase.from("org_sales_stages").upsert({
            org_id: orgId, stage,
            enabled: patch.enabled ?? on,
            tone: (patch.tone ?? tone).trim() || null,
            updated_at: new Date().toISOString(),
        }, { onConflict: "org_id,stage" })
        setBusy(false)
        if (error) { setMsg({ text: c.saveError, err: true }); return false }
        await onChanged()
        return true
    }

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
        setNewObj(""); setNewAns("")
        await loadObjs()
    }

    const inStage  = objs.filter(o => (o.sales_stages ?? []).includes(stage))
    const allStage = objs.filter(o => (o.sales_stages ?? []).length === 0)
    // Offer only stage-scoped objections from other stages: adding an
    // all-stage one here would narrow it to fewer stages, which is a removal
    // dressed up as an add.
    const addable  = objs.filter(o => (o.sales_stages ?? []).length > 0 && !(o.sales_stages ?? []).includes(stage))

    return (
        <div className="mt-5 pt-5 border-t border-[var(--color-border)] space-y-5">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className="text-sm font-semibold text-[var(--color-text)]">{stageLabel(stage, locale)}</p>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                        {on ? c.stageOn : c.stageOff} · {c.playbooksHere(playbookCount)}
                    </p>
                </div>
                <button className={on ? BTN_GHOST : BTN_PRIMARY} disabled={busy}
                    onClick={() => upsert({ enabled: !on })}>
                    {on ? c.turnOff : c.turnOn}
                </button>
            </div>

            {on && (
                <>
                    <div className="flex flex-wrap gap-2">
                        <button className={BTN_PRIMARY} onClick={onUpload}>{c.uploadForStage}</button>
                        <button className={BTN_GHOST} onClick={onNew}>{c.newForStage}</button>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs text-[var(--color-text-secondary)] font-medium">{c.tone}</label>
                        <textarea className={INPUT + " resize-none"} rows={2} placeholder={c.tonePlaceholder}
                            value={tone} onChange={e => setTone(e.target.value)} maxLength={400} />
                        <div className="flex items-center gap-3">
                            <button className={BTN_GHOST} disabled={busy || (tone.trim() === (row?.tone ?? ""))}
                                onClick={async () => { if (await upsert({ tone })) setMsg({ text: c.toneSaved, err: false }) }}>
                                {c.saveTone}
                            </button>
                            <span className="text-xs text-[var(--color-muted)]">{c.toneHint}</span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <p className="text-xs font-medium text-[var(--color-text-secondary)]">{c.objectionsTitle}</p>
                        {inStage.length === 0 && <p className="text-xs text-[var(--color-muted)]">{c.objectionsNone}</p>}
                        {inStage.map(o => (
                            <div key={o.id} className="flex items-start justify-between gap-3 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-2">
                                <div className="min-w-0">
                                    <p className="text-sm text-[var(--color-text)]">{o.objection}</p>
                                    {guidanceOf(o) && <p className="text-xs text-[var(--color-text-secondary)] mt-0.5 line-clamp-2">{guidanceOf(o)}</p>}
                                </div>
                                <div className="flex gap-2 flex-shrink-0">
                                    <button className={BTN_GHOST} onClick={() => setObjStages(o, (o.sales_stages ?? []).filter(s => s !== stage))}>{c.removeFromStage}</button>
                                    <button className={BTN_GHOST} onClick={() => setObjStages(o, [])}>{c.makeAllStages}</button>
                                </div>
                            </div>
                        ))}
                        {allStage.length > 0 && <p className="text-xs text-[var(--color-muted)]">{c.allStageNote(allStage.length)}</p>}
                        {addable.length > 0 && (
                            <select className={INPUT} value="" onChange={e => {
                                const o = addable.find(x => x.id === e.target.value)
                                if (o) setObjStages(o, [...(o.sales_stages ?? []), stage])
                            }}>
                                <option value="">{c.addExisting}</option>
                                {addable.map(o => <option key={o.id} value={o.id}>{o.objection}</option>)}
                            </select>
                        )}
                        <div className="space-y-2 pt-1">
                            <p className="text-xs text-[var(--color-text-secondary)]">{c.addNew}</p>
                            <input className={INPUT} placeholder={c.objectionPlaceholder} value={newObj} onChange={e => setNewObj(e.target.value)} />
                            <textarea className={INPUT + " resize-none"} rows={2} placeholder={c.answerPlaceholder} value={newAns} onChange={e => setNewAns(e.target.value)} />
                            <button className={BTN_GHOST} disabled={busy || !newObj.trim()} onClick={addNew}>{c.add}</button>
                        </div>
                    </div>
                </>
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
