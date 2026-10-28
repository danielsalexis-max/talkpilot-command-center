"use client"

import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useLocale } from "@/i18n/LocaleProvider"
import type { Locale } from "@/i18n"
import { SALES_STAGES, isSalesStage, stageLabel, type SalesStage } from "@/lib/salesStages"
import { StageObjections } from "@/components/salesStageStrip"

/// The Playbook page, organized as the team's sales process (D-736).
///
/// The page used to open on tools (import, new, "what changed", presets) with
/// the playbooks underneath and the nine stages as a strip of grey chips in
/// the middle. It now reads in the order a manager thinks: the stages of the
/// sale, what still needs fixing, what applies to every call, then the list.
/// A stage opens into its own view laid out in call order: the steps, the
/// tone, the objections, and a sample of what the rep sees.
///
/// This file is layout only. Every write goes through the same tables and
/// rules as before: the playbook editor in orgTabs stays the one writer of
/// `org_playbooks` except the stage field the alert sets inline, and stage
/// rows go to `org_sales_stages` exactly as the old strip did.

export interface PbLite {
    id: string
    name: string
    methodology: string | null
    sales_stage: string | null
    status: string
    stages: { name: string; description?: string }[] | null
}

export interface StageRow { stage: string; enabled: boolean; tone: string | null }

/// Where the Playbook page is: the overview (null), one stage, or one of the
/// shared views. The page turns this into the URL.
export type PlaybookView = { stage: SalesStage } | { tab: "objections" | "knowledge"; focus?: "phrases" } | null

const CARD = "bg-[var(--color-surface)] rounded-[14px] border border-[var(--color-border)] shadow-sm"
const BTN_PRIMARY = "inline-flex items-center justify-center min-h-11 px-4 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] disabled:opacity-40 text-[var(--btn-ink)] text-sm font-semibold rounded-[10px] transition-colors"
const BTN_SOFT = "inline-flex items-center justify-center min-h-11 px-4 bg-[var(--color-accent-subtle)] hover:brightness-95 text-[var(--color-accent-deep,var(--color-accent))] text-sm font-semibold rounded-[10px] transition disabled:opacity-40"
const BTN_DASHED = "inline-flex items-center justify-center min-h-11 px-4 border border-dashed border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[var(--color-accent-subtle)] text-sm font-semibold rounded-[10px] transition-colors"
const INPUT = "w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[10px] px-3 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"

type ToneKey = "curious" | "direct" | "warm" | "formal"

const COPY = {
    en: {
        processTitle: "Your sales process",
        processSub: (on: number) => `${on} of 9 stages on · open one to set it up`,
        off: "Off",
        noPlaybook: "No playbook yet",
        pbCount: (n: number) => n === 1 ? "1 playbook" : `${n} playbooks`,
        alertUnassigned: (n: number) => n === 1 ? "1 playbook has no stage" : `${n} playbooks have no stage`,
        alertUnassignedSub: "The coach doesn't know when to use it. Pick the stage each one is for.",
        alertEmpty: (names: string) => `Turned on but no playbook yet: ${names}.`,
        pickStage: "Pick a stage",
        open: "Open",
        sharedTitle: "For every stage",
        sharedSub: "What the coach uses on any call, whatever the stage.",
        objections: "Objections",
        objectionsDetail: (critical: number, allStage: number) => `${critical} critical · ${allStage} apply to every stage`,
        objectionsCta: "See objections",
        knowledge: "Knowledge",
        knowledgeBig: (n: number) => n === 1 ? "1 document" : `${n} documents`,
        knowledgeDetail: "Pricing, case studies, policies, product docs",
        knowledgeCta: "See documents",
        phrases: "Phrases",
        phrasesDetail: (b: number, r: number) => `${b} never to say · ${r} to always repeat`,
        phrasesCta: "Edit phrases",
        allTitle: "All playbooks",
        colName: "Name",
        colStage: "Stage",
        colSteps: "Steps",
        colStatus: "Status",
        steps: (n: number) => n === 1 ? "1 step" : `${n} steps`,
        noStage: "No stage",
        moreActions: "More actions",
        confirmDelete: (name: string) => `Delete "${name}"? This can't be undone.`,
        back: "← Your sales process",
        stageActive: "Stage on",
        stageOffNote: "This stage is off. Turn it on so the coach uses it on calls.",
        callTitle: "How the call goes",
        callSub: (pb: string) => `Playbook: ${pb} · the coach follows these steps in order`,
        callEmpty: "No playbook for this stage yet. Upload one, write one, or pick one you already have.",
        upload: "Upload a playbook",
        write: "Write one",
        useExisting: "Add one you already have…",
        editSteps: "Edit steps",
        editorNew: "New playbook",
        editorEdit: "Edit playbook",
        moreHere: (n: number) => `${n - 1} more playbook${n - 1 === 1 ? "" : "s"} in this stage`,
        toneTitle: "Tone",
        toneSub: "How the coach wants the rep to sound in this stage.",
        tones: { curious: "Curious", direct: "Direct", warm: "Warm", formal: "Formal" } as Record<ToneKey, string>,
        toneText: {
            curious: "Curious. Ask more than you talk, and don't pitch yet.",
            direct: "Direct. Short sentences, get to the point, ask for the next step.",
            warm: "Warm. Friendly and patient, make the person feel heard.",
            formal: "Formal. Polite and precise, no slang.",
        } as Record<ToneKey, string>,
        toneLabel: "In your words",
        saveTone: "Save tone",
        toneSaved: "Tone saved.",
        saveError: "Could not save. Try again.",
        previewTitle: "Example of what the rep sees",
        previewChip: (stage: string, n: number) => `${stage} · step 1 of ${n}`,
        previewEmpty: "Add a playbook to this stage to see an example.",
        previewTone: (tone: string) => `Tone: ${tone}`,
        whoTitle: "Who uses it",
        addMenu: "Add",
        addNew: "New playbook",
        addImport: "Playbook from a document",
        addPreset: "Start from a preset",
        addObjections: "Objections",
        addKnowledge: "A knowledge document",
        blurb: {
            prospecting: "First contact: spark interest and get the meeting.",
            discovery: "Understand the customer's problem before talking about the product.",
            demo: "Show how the product solves what they told you.",
            proposal: "Present the offer, the price and the next steps.",
            negotiation: "Agree on terms without giving value away.",
            close: "Ask for the decision and make clear what happens next, won or lost.",
            onboarding: "Get the customer started and to a first result.",
            customer_success: "Look after the account so the customer gets value.",
            renewal: "Renew, and grow the account when it fits.",
        } as Record<SalesStage, string>,
    },
    es: {
        processTitle: "Tu proceso de venta",
        processSub: (on: number) => `${on} de 9 etapas activas · abre una para configurarla`,
        off: "Apagada",
        noPlaybook: "Sin playbook todavía",
        pbCount: (n: number) => n === 1 ? "1 playbook" : `${n} playbooks`,
        alertUnassigned: (n: number) => n === 1 ? "1 playbook no tiene etapa" : `${n} playbooks no tienen etapa`,
        alertUnassignedSub: "El coach no sabe cuándo usarlos. Elige la etapa de cada uno.",
        alertEmpty: (names: string) => `Activas pero sin playbook: ${names}.`,
        pickStage: "Elegir etapa",
        open: "Abrir",
        sharedTitle: "Para todas las etapas",
        sharedSub: "Lo que el coach usa en cualquier llamada, sin importar la etapa.",
        objections: "Objeciones",
        objectionsDetail: (critical: number, allStage: number) => `${critical} críticas · ${allStage} aplican a todas las etapas`,
        objectionsCta: "Ver objeciones",
        knowledge: "Conocimiento",
        knowledgeBig: (n: number) => n === 1 ? "1 documento" : `${n} documentos`,
        knowledgeDetail: "Precios, casos de éxito, políticas, documentos del producto",
        knowledgeCta: "Ver documentos",
        phrases: "Frases",
        phrasesDetail: (b: number, r: number) => `${b} que nunca decir · ${r} que repetir siempre`,
        phrasesCta: "Editar frases",
        allTitle: "Todos los playbooks",
        colName: "Nombre",
        colStage: "Etapa",
        colSteps: "Pasos",
        colStatus: "Estado",
        steps: (n: number) => n === 1 ? "1 paso" : `${n} pasos`,
        noStage: "Sin etapa",
        moreActions: "Más acciones",
        confirmDelete: (name: string) => `¿Eliminar "${name}"? No se puede deshacer.`,
        back: "← Tu proceso de venta",
        stageActive: "Etapa activa",
        stageOffNote: "Esta etapa está apagada. Actívala para que el coach la use en las llamadas.",
        callTitle: "Cómo va la llamada",
        callSub: (pb: string) => `Playbook: ${pb} · el coach sigue estos pasos en orden`,
        callEmpty: "Esta etapa todavía no tiene playbook. Sube uno, escríbelo o elige uno que ya tengas.",
        upload: "Subir un playbook",
        write: "Escribir uno",
        useExisting: "Agregar uno que ya tengo…",
        editSteps: "Editar pasos",
        editorNew: "Nuevo playbook",
        editorEdit: "Editar playbook",
        moreHere: (n: number) => n - 1 === 1 ? "1 playbook más en esta etapa" : `${n - 1} playbooks más en esta etapa`,
        toneTitle: "Tono",
        toneSub: "Cómo quiere el coach que suene el rep en esta etapa.",
        tones: { curious: "Curioso", direct: "Directo", warm: "Cálido", formal: "Formal" } as Record<ToneKey, string>,
        toneText: {
            curious: "Curioso. Pregunta más de lo que hablas y todavía no vendas.",
            direct: "Directo. Frases cortas, ve al grano y pide el siguiente paso.",
            warm: "Cálido. Amable y paciente, que la persona se sienta escuchada.",
            formal: "Formal. Educado y preciso, sin modismos.",
        } as Record<ToneKey, string>,
        toneLabel: "En tus palabras",
        saveTone: "Guardar tono",
        toneSaved: "Tono guardado.",
        saveError: "No se pudo guardar. Intenta de nuevo.",
        previewTitle: "Ejemplo de lo que ve el rep",
        previewChip: (stage: string, n: number) => `${stage} · paso 1 de ${n}`,
        previewEmpty: "Agrega un playbook a esta etapa para ver un ejemplo.",
        previewTone: (tone: string) => `Tono: ${tone}`,
        whoTitle: "Quién lo usa",
        addMenu: "Agregar",
        addNew: "Nuevo playbook",
        addImport: "Playbook desde un documento",
        addPreset: "Empezar desde un preset",
        addObjections: "Objeciones",
        addKnowledge: "Un documento de conocimiento",
        blurb: {
            prospecting: "Primer contacto: despertar interés y conseguir la reunión.",
            discovery: "Entender el problema del cliente antes de hablar del producto.",
            demo: "Mostrar cómo el producto resuelve lo que te contaron.",
            proposal: "Presentar la oferta, el precio y los siguientes pasos.",
            negotiation: "Acordar términos sin regalar valor.",
            close: "Pedir la decisión y dejar claro qué sigue, se gane o se pierda.",
            onboarding: "Poner al cliente en marcha y llegar al primer resultado.",
            customer_success: "Cuidar la cuenta para que el cliente saque valor.",
            renewal: "Renovar y, cuando aplique, crecer la cuenta.",
        } as Record<SalesStage, string>,
    },
} satisfies Record<Locale, unknown>

export type StudioCopy = typeof COPY.en
export function studioCopy(locale: Locale): StudioCopy { return COPY[locale] }

/// Playbooks that run in a stage: live ones first, then drafts. Archived ones
/// never count; they are kept for history only.
function inStage(playbooks: PbLite[], stage: SalesStage): PbLite[] {
    return playbooks
        .filter(p => p.sales_stage === stage && p.status !== "archived")
        .sort((a, b) => (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1))
}

// ─── Overview ────────────────────────────────────────────────────────────────

export function StagePipeline({ stageRows, playbooks, onOpen }: {
    stageRows: StageRow[]; playbooks: PbLite[]; onOpen: (s: SalesStage) => void
}) {
    const { locale } = useLocale()
    const c = studioCopy(locale)
    const on = new Set(stageRows.filter(r => r.enabled).map(r => r.stage))
    return (
        <section aria-labelledby="pb-process" className="space-y-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="pb-process" className="text-lg font-bold text-[var(--color-text)]">{c.processTitle}</h2>
                <span className="text-[13px] text-[var(--color-text-secondary)]">{c.processSub(on.size)}</span>
            </div>
            <ol className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
                {SALES_STAGES.map((s, i) => {
                    const active = on.has(s)
                    const pbs = inStage(playbooks, s)
                    const meta = !active ? c.off : pbs.length === 0 ? c.noPlaybook : pbs.length === 1 ? pbs[0].name : c.pbCount(pbs.length)
                    const needsWork = active && pbs.length === 0
                    return (
                        <li key={s}>
                            <button type="button" onClick={() => onOpen(s)}
                                className={`w-full h-full min-h-[104px] text-left flex flex-col gap-1.5 p-3.5 rounded-[14px] transition-colors ${
                                    active
                                        ? `bg-[var(--color-surface)] border shadow-sm hover:border-[var(--color-accent)] ${needsWork ? "border-amber-300" : "border-[var(--color-border)]"}`
                                        : "border border-dashed border-[var(--color-border-strong,var(--color-border))] hover:border-[var(--color-accent)] hover:bg-[var(--color-surface)]"
                                }`}>
                                <span className={`w-6 h-6 rounded-full grid place-items-center text-xs font-bold ${
                                    active ? "bg-[var(--btn-bg)] text-[var(--btn-ink)]" : "bg-[var(--color-hover,var(--color-bg))] text-[var(--color-text-secondary)]"
                                }`}>{i + 1}</span>
                                <span className="text-sm font-semibold text-[var(--color-text)]">{stageLabel(s, locale)}</span>
                                <span className={`text-xs line-clamp-2 ${needsWork ? "text-amber-700" : active ? "text-[var(--color-accent)]" : "text-[var(--color-text-secondary)]"}`}>{meta}</span>
                            </button>
                        </li>
                    )
                })}
            </ol>
        </section>
    )
}

/// The one place that says what is unfinished, with the fix inline: a stage
/// picker per unassigned playbook, and a link to each stage that is on but
/// empty. Shows nothing when there is nothing to fix.
export function SetupAlert({ playbooks, stageRows, onAssign, onOpenStage }: {
    playbooks: PbLite[]; stageRows: StageRow[]
    onAssign: (playbookId: string, stage: SalesStage) => void
    onOpenStage: (s: SalesStage) => void
}) {
    const { locale } = useLocale()
    const c = studioCopy(locale)
    const unassigned = playbooks.filter(p => p.status !== "archived" && !isSalesStage(p.sales_stage))
    const empty = SALES_STAGES.filter(s => stageRows.some(r => r.stage === s && r.enabled) && inStage(playbooks, s).length === 0)
    if (unassigned.length === 0 && empty.length === 0) return null
    return (
        <section aria-labelledby="pb-fix" className="rounded-[14px] border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800/60 p-4 sm:p-5 space-y-3">
            {unassigned.length > 0 && (
                <div className="space-y-2.5">
                    <div>
                        <h2 id="pb-fix" className="text-[15px] font-bold text-amber-900 dark:text-amber-200">{c.alertUnassigned(unassigned.length)}</h2>
                        <p className="text-sm text-amber-800 dark:text-amber-300/90">{c.alertUnassignedSub}</p>
                    </div>
                    <ul className="space-y-2">
                        {unassigned.map(p => (
                            <li key={p.id} className="flex flex-wrap items-center gap-3">
                                <span className="text-sm font-semibold text-[var(--color-text)] min-w-[160px]">{p.name}</span>
                                <label className="sr-only" htmlFor={`stage-${p.id}`}>{c.pickStage}</label>
                                <select id={`stage-${p.id}`} defaultValue=""
                                    onChange={e => { if (isSalesStage(e.target.value)) onAssign(p.id, e.target.value) }}
                                    className="min-h-11 bg-[var(--color-surface)] border border-amber-300 rounded-[10px] px-3 text-sm text-[var(--color-text)]">
                                    <option value="" disabled>{c.pickStage}</option>
                                    {SALES_STAGES.map(s => <option key={s} value={s}>{stageLabel(s, locale)}</option>)}
                                </select>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {empty.length > 0 && (
                <p className="text-sm text-amber-900 dark:text-amber-200 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>{c.alertEmpty(empty.map(s => stageLabel(s, locale)).join(", "))}</span>
                    {empty.map(s => (
                        <button key={s} type="button" onClick={() => onOpenStage(s)}
                            className="font-semibold underline underline-offset-2 min-h-11">
                            {c.open} {stageLabel(s, locale)}
                        </button>
                    ))}
                </p>
            )}
        </section>
    )
}

export interface BrainCounts { objections: number; critical: number; allStage: number; knowledge: number; banned: number; required: number }

export function useBrainCounts(orgId: string) {
    const [counts, setCounts] = useState<BrainCounts | null>(null)
    const load = useCallback(async () => {
        const [{ data: objs }, { count: docs }, { data: org }] = await Promise.all([
            supabase.from("org_objections").select("severity, sales_stages").eq("org_id", orgId).eq("active", true).limit(2000),
            supabase.from("org_knowledge").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "ready"),
            supabase.from("organizations").select("voice_profile").eq("id", orgId).maybeSingle(),
        ])
        const rows = (objs ?? []) as { severity: string | null; sales_stages: string[] | null }[]
        const vp = (org?.voice_profile ?? {}) as { banned_phrases?: string[]; required_phrases?: string[] }
        setCounts({
            objections: rows.length,
            critical: rows.filter(r => r.severity === "critical").length,
            allStage: rows.filter(r => (r.sales_stages ?? []).length === 0).length,
            knowledge: docs ?? 0,
            banned: vp.banned_phrases?.length ?? 0,
            required: vp.required_phrases?.length ?? 0,
        })
    }, [orgId])
    useEffect(() => { load() }, [load])
    return counts
}

export function SharedCards({ counts, onOpen }: {
    counts: BrainCounts | null
    onOpen: (where: "objections" | "knowledge" | "phrases") => void
}) {
    const { locale } = useLocale()
    const c = studioCopy(locale)
    const cards: { key: "objections" | "knowledge" | "phrases"; title: string; big: string; detail: string; cta: string }[] = [
        { key: "objections", title: c.objections, big: counts ? String(counts.objections) : "…",
          detail: counts ? c.objectionsDetail(counts.critical, counts.allStage) : "", cta: c.objectionsCta },
        { key: "knowledge", title: c.knowledge, big: counts ? c.knowledgeBig(counts.knowledge) : "…",
          detail: c.knowledgeDetail, cta: c.knowledgeCta },
        { key: "phrases", title: c.phrases, big: counts ? `${counts.banned} · ${counts.required}` : "…",
          detail: counts ? c.phrasesDetail(counts.banned, counts.required) : "", cta: c.phrasesCta },
    ]
    return (
        <section aria-labelledby="pb-shared" className="space-y-3.5">
            <div>
                <h2 id="pb-shared" className="text-lg font-bold text-[var(--color-text)]">{c.sharedTitle}</h2>
                <p className="text-sm text-[var(--color-text-secondary)]">{c.sharedSub}</p>
            </div>
            <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(230px,1fr))]">
                {cards.map(card => (
                    <article key={card.key} className={`${CARD} p-5 flex flex-col gap-2`}>
                        <h3 className="text-[15px] font-bold text-[var(--color-text)]">{card.title}</h3>
                        <p className="text-[26px] font-bold tracking-tight text-[var(--color-text)]">{card.big}</p>
                        <p className="text-[13px] text-[var(--color-text-secondary)] min-h-[1.25rem]">{card.detail}</p>
                        <button type="button" onClick={() => onOpen(card.key)}
                            className="self-start min-h-11 text-sm font-semibold text-[var(--color-accent)] hover:underline underline-offset-2">
                            {card.cta} →
                        </button>
                    </article>
                ))}
            </div>
        </section>
    )
}

export function PlaybookTable({ playbooks, statusLabel, onEdit, onStatus, onDelete, onOpenStage, labels }: {
    playbooks: PbLite[]
    statusLabel: (status: string) => string
    onEdit: (p: PbLite) => void
    onStatus: (id: string, status: "draft" | "active" | "archived") => void
    onDelete: (id: string) => void
    onOpenStage: (s: SalesStage) => void
    labels: { edit: string; activate: string; deactivate: string; archive: string; delete: string; empty: string }
}) {
    const { locale } = useLocale()
    const c = studioCopy(locale)
    return (
        <section aria-labelledby="pb-all" className="space-y-3">
            <h2 id="pb-all" className="text-lg font-bold text-[var(--color-text)]">{c.allTitle}</h2>
            {playbooks.length === 0 ? (
                <p className="text-sm text-[var(--color-text-secondary)]">{labels.empty}</p>
            ) : (
                <div className={`${CARD} overflow-x-auto`}>
                    <table className="w-full min-w-[620px] text-sm border-collapse">
                        <thead>
                            <tr className="text-left text-xs text-[var(--color-text-secondary)]">
                                <th className="px-4 py-3 font-semibold">{c.colName}</th>
                                <th className="px-4 py-3 font-semibold">{c.colStage}</th>
                                <th className="px-4 py-3 font-semibold">{c.colSteps}</th>
                                <th className="px-4 py-3 font-semibold">{c.colStatus}</th>
                                <th className="px-2 py-3"><span className="sr-only">{c.moreActions}</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {playbooks.map(p => {
                                const stage = isSalesStage(p.sales_stage) ? p.sales_stage : null
                                return (
                                    <tr key={p.id} className={`border-t border-[var(--color-border)] ${p.status === "archived" ? "opacity-60" : ""}`}>
                                        <td className="px-4 py-3">
                                            <button type="button" onClick={() => onEdit(p)} className="font-semibold text-[var(--color-text)] hover:text-[var(--color-accent)] text-left min-h-11">
                                                {p.name}
                                            </button>
                                        </td>
                                        <td className="px-4 py-3">
                                            {stage ? (
                                                <button type="button" onClick={() => onOpenStage(stage)}
                                                    className="text-xs font-semibold rounded-full px-2.5 py-1 bg-[var(--color-accent-subtle)] text-[var(--color-accent)] hover:underline">
                                                    {stageLabel(stage, locale)}
                                                </button>
                                            ) : (
                                                <span className="text-xs font-semibold rounded-full px-2.5 py-1 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">{c.noStage}</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-[var(--color-text-secondary)]">{c.steps(p.stages?.length ?? 0)}</td>
                                        <td className="px-4 py-3">
                                            <span className={`text-xs font-medium ${p.status === "active" ? "text-emerald-700 dark:text-emerald-400" : "text-[var(--color-text-secondary)]"}`}>
                                                {statusLabel(p.status)}
                                            </span>
                                        </td>
                                        <td className="px-2 py-1 text-right">
                                            <details className="relative inline-block text-left">
                                                <summary aria-label={c.moreActions}
                                                    className="list-none cursor-pointer w-11 h-11 grid place-items-center rounded-[10px] text-[var(--color-text-secondary)] hover:bg-[var(--color-hover,var(--color-bg))] [&::-webkit-details-marker]:hidden">
                                                    ···
                                                </summary>
                                                <div className="absolute right-0 z-20 mt-1 w-44 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg py-1">
                                                    <MenuItem onClick={() => onEdit(p)}>{labels.edit}</MenuItem>
                                                    {p.status !== "active" && <MenuItem onClick={() => onStatus(p.id, "active")}>{labels.activate}</MenuItem>}
                                                    {p.status === "active" && <MenuItem onClick={() => onStatus(p.id, "draft")}>{labels.deactivate}</MenuItem>}
                                                    {p.status !== "archived" && <MenuItem onClick={() => onStatus(p.id, "archived")}>{labels.archive}</MenuItem>}
                                                    <MenuItem danger onClick={() => { if (window.confirm(c.confirmDelete(p.name))) onDelete(p.id) }}>{labels.delete}</MenuItem>
                                                </div>
                                            </details>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    )
}

function MenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
    return (
        <button type="button"
            onClick={e => { (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open"); onClick() }}
            className={`w-full text-left px-3.5 min-h-10 text-sm hover:bg-[var(--color-hover,var(--color-bg))] ${danger ? "text-red-600" : "text-[var(--color-text)]"}`}>
            {children}
        </button>
    )
}

/// The page's one "Add" button. Every way to put something into the coach's
/// head starts here instead of four separate buttons and boxes up top.
export function AddMenu({ onNew, onImport, onPreset, onObjections, onKnowledge, busy }: {
    onNew: () => void; onImport: () => void; onPreset: () => void
    onObjections: () => void; onKnowledge: () => void; busy?: boolean
}) {
    const { locale } = useLocale()
    const c = studioCopy(locale)
    return (
        <details className="relative">
            <summary className={`${BTN_PRIMARY} list-none cursor-pointer [&::-webkit-details-marker]:hidden ${busy ? "opacity-60 pointer-events-none" : ""}`}>
                {c.addMenu} <span aria-hidden="true" className="ml-1.5">▾</span>
            </summary>
            <div className="absolute right-0 z-30 mt-1.5 w-64 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg py-1">
                <MenuItem onClick={onNew}>{c.addNew}</MenuItem>
                <MenuItem onClick={onImport}>{c.addImport}</MenuItem>
                <MenuItem onClick={onPreset}>{c.addPreset}</MenuItem>
                <span className="block h-px bg-[var(--color-border)] my-1" />
                <MenuItem onClick={onObjections}>{c.addObjections}</MenuItem>
                <MenuItem onClick={onKnowledge}>{c.addKnowledge}</MenuItem>
            </div>
        </details>
    )
}

// ─── One stage ───────────────────────────────────────────────────────────────

export function StageDetail({
    orgId, stage, row, playbooks, reloadStages, onBack, onEditPlaybook, onUpload, onNew, onAssignExisting, renderAssignment,
}: {
    orgId: string
    stage: SalesStage
    row: StageRow | null
    playbooks: PbLite[]
    reloadStages: () => Promise<void>
    onBack: () => void
    onEditPlaybook: (p: PbLite) => void
    onUpload: () => void
    onNew: () => void
    onAssignExisting: (playbookId: string) => void
    renderAssignment: (playbookId: string) => React.ReactNode
}) {
    const { locale } = useLocale()
    const c = studioCopy(locale)
    const on = row?.enabled ?? false
    const here = inStage(playbooks, stage)
    const main = here[0] ?? null
    const others = playbooks.filter(p => p.status !== "archived" && p.sales_stage !== stage)
    const [tone, setTone] = useState(row?.tone ?? "")
    const [busy, setBusy] = useState(false)
    const [msg, setMsg] = useState<{ text: string; err: boolean } | null>(null)
    const label = stageLabel(stage, locale) ?? stage
    const n = SALES_STAGES.indexOf(stage) + 1

    useEffect(() => { setTone(row?.tone ?? "") }, [row?.tone])

    async function upsert(patch: { enabled?: boolean; tone?: string }) {
        setBusy(true); setMsg(null)
        const { error } = await supabase.from("org_sales_stages").upsert({
            org_id: orgId, stage,
            enabled: patch.enabled ?? on,
            tone: (patch.tone ?? tone).trim() || null,
            updated_at: new Date().toISOString(),
        }, { onConflict: "org_id,stage" })
        setBusy(false)
        if (error) { setMsg({ text: c.saveError, err: true }); return false }
        await reloadStages()
        return true
    }

    const steps = main?.stages ?? []
    const savedTone = (row?.tone ?? "").trim()

    return (
        <div className="space-y-6">
            <button type="button" onClick={onBack} className="min-h-11 text-sm font-medium text-[var(--color-accent)] hover:underline underline-offset-2">
                {c.back}
            </button>

            <header className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                    <span className={`w-10 h-10 rounded-full grid place-items-center font-bold ${on ? "bg-[var(--btn-bg)] text-[var(--btn-ink)]" : "bg-[var(--color-hover,var(--color-bg))] text-[var(--color-text-secondary)]"}`}>{n}</span>
                    <div>
                        <h1 className="text-[26px] font-bold tracking-tight text-[var(--color-text)]">{label}</h1>
                        <p className="text-sm text-[var(--color-text-secondary)]">{c.blurb[stage]}</p>
                    </div>
                </div>
                <label className="inline-flex items-center gap-2.5 min-h-11 text-sm font-semibold text-[var(--color-text)] cursor-pointer">
                    <input type="checkbox" checked={on} disabled={busy}
                        onChange={() => upsert({ enabled: !on })}
                        className="w-5 h-5 accent-[var(--color-accent)]" />
                    {c.stageActive}
                </label>
            </header>

            {!on && <p className="text-sm text-[var(--color-text-secondary)]">{c.stageOffNote}</p>}

            <div className="flex flex-wrap gap-6 items-start">
                <div className="flex-[999_1_520px] min-w-0 space-y-4">

                    <section aria-labelledby="st-call" className={`${CARD} p-5 sm:p-6 space-y-4`}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h2 id="st-call" className="text-[17px] font-bold text-[var(--color-text)]">{c.callTitle}</h2>
                                {main && <p className="text-[13px] text-[var(--color-text-secondary)] mt-0.5">{c.callSub(main.name)}</p>}
                            </div>
                            {main && <button type="button" className={BTN_SOFT} onClick={() => onEditPlaybook(main)}>{c.editSteps}</button>}
                        </div>

                        {main ? (
                            <ol className="space-y-2.5">
                                {steps.map((s, i) => (
                                    <li key={i} className="flex gap-3.5 items-start p-3.5 rounded-[12px] border border-[var(--color-border)]">
                                        <span className="flex-none w-[26px] h-[26px] rounded-full grid place-items-center text-[13px] font-bold bg-[var(--color-accent-subtle)] text-[var(--color-accent)]">{i + 1}</span>
                                        <div className="min-w-0">
                                            <p className="text-[15px] font-semibold text-[var(--color-text)]">{s.name}</p>
                                            {s.description && <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">{s.description}</p>}
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        ) : (
                            <p className="text-sm text-[var(--color-text-secondary)]">{c.callEmpty}</p>
                        )}

                        <div className="flex flex-wrap items-center gap-2.5 pt-1">
                            {!main && <button type="button" className={BTN_PRIMARY} onClick={onUpload}>{c.upload}</button>}
                            {!main && <button type="button" className={BTN_DASHED} onClick={onNew}>{c.write}</button>}
                            {others.length > 0 && (
                                <select value="" aria-label={c.useExisting}
                                    onChange={e => { if (e.target.value) onAssignExisting(e.target.value) }}
                                    className="min-h-11 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[10px] px-3 text-sm text-[var(--color-text)]">
                                    <option value="">{c.useExisting}</option>
                                    {others.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            )}
                        </div>
                        {here.length > 1 && (
                            <p className="text-[13px] text-[var(--color-text-secondary)]">
                                {c.moreHere(here.length)}: {here.slice(1).map(p => p.name).join(", ")}
                            </p>
                        )}
                    </section>

                    <section aria-labelledby="st-tone" className={`${CARD} p-5 sm:p-6 space-y-3`}>
                        <div>
                            <h2 id="st-tone" className="text-[17px] font-bold text-[var(--color-text)]">{c.toneTitle}</h2>
                            <p className="text-[13px] text-[var(--color-text-secondary)] mt-0.5">{c.toneSub}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {(Object.keys(c.tones) as ToneKey[]).map(k => {
                                const picked = tone.trim() === c.toneText[k]
                                return (
                                    <button key={k} type="button" aria-pressed={picked}
                                        onClick={() => setTone(c.toneText[k])}
                                        className={`min-h-11 px-4 rounded-full text-sm font-semibold border transition-colors ${
                                            picked ? "bg-[var(--btn-bg)] text-[var(--btn-ink)] border-[var(--btn-bg)]"
                                                   : "bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)] hover:border-[var(--color-accent)]"
                                        }`}>
                                        {c.tones[k]}
                                    </button>
                                )
                            })}
                        </div>
                        <label htmlFor="st-tone-text" className="block text-[13px] text-[var(--color-text-secondary)]">{c.toneLabel}</label>
                        <textarea id="st-tone-text" rows={2} maxLength={400} value={tone} onChange={e => setTone(e.target.value)} className={`${INPUT} resize-none`} />
                        <div className="flex items-center gap-3">
                            <button type="button" className={BTN_SOFT} disabled={busy || tone.trim() === savedTone}
                                onClick={async () => { if (await upsert({ tone })) setMsg({ text: c.toneSaved, err: false }) }}>
                                {c.saveTone}
                            </button>
                            {msg && <span className={`text-xs ${msg.err ? "text-red-600" : "text-emerald-600"}`}>{msg.text}</span>}
                        </div>
                    </section>

                    <section className={`${CARD} p-5 sm:p-6`}>
                        <StageObjections orgId={orgId} stage={stage} />
                    </section>
                </div>

                <aside className="flex-[1_1_300px] min-w-0 space-y-4">
                    <section aria-labelledby="st-preview" className="rounded-[14px] p-5 space-y-3 bg-[#0E182B] text-[#E8EEF6]">
                        <h2 id="st-preview" className="text-xs font-semibold uppercase tracking-[.06em] text-[#9FB3C8]">{c.previewTitle}</h2>
                        {main && steps.length > 0 ? (
                            <>
                                <span className="inline-block text-xs font-semibold rounded-full px-2.5 py-1 bg-[#7FD8C6] text-[#0E182B]">{c.previewChip(label, steps.length)}</span>
                                <p className="text-base leading-snug"><strong>{steps[0].name}.</strong> {steps[0].description}</p>
                                {savedTone && <p className="text-[13px] text-[#9FB3C8]">{c.previewTone(savedTone)}</p>}
                            </>
                        ) : (
                            <p className="text-sm text-[#9FB3C8]">{c.previewEmpty}</p>
                        )}
                    </section>
                    {main && (
                        <section aria-labelledby="st-who" className={`${CARD} p-5 space-y-1`}>
                            <h2 id="st-who" className="text-[15px] font-bold text-[var(--color-text)]">{c.whoTitle}</h2>
                            {renderAssignment(main.id)}
                        </section>
                    )}
                </aside>
            </div>
        </div>
    )
}
