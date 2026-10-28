/// The nine fixed sales stages a playbook belongs to (D-733, D-740).
///
/// The keys are the database contract (`org_playbooks.sales_stage`,
/// `org_objections.sales_stages`, `org_sales_stages.stage`, all CHECKed) and
/// are read byte-for-byte by every app. The order is the order of the strip and
/// of the apps' picker. No custom stage: Alexis listed these nine and nothing
/// else.

import type { Locale } from "@/i18n"

export const SALES_STAGES = [
    "prospecting", "discovery", "demo", "proposal", "negotiation",
    "close", "onboarding", "customer_success", "renewal",
] as const

export type SalesStage = typeof SALES_STAGES[number]

export function isSalesStage(v: unknown): v is SalesStage {
    return typeof v === "string" && (SALES_STAGES as readonly string[]).includes(v)
}

const LABELS: Record<Locale, Record<SalesStage, string>> = {
    en: {
        prospecting: "Prospecting", discovery: "Discovery", demo: "Demo",
        proposal: "Proposal", negotiation: "Negotiation", close: "Close (Won / Lost)",
        onboarding: "Onboarding", customer_success: "Customer Success", renewal: "Renewal",
    },
    es: {
        prospecting: "Prospección", discovery: "Descubrimiento", demo: "Demo",
        proposal: "Propuesta", negotiation: "Negociación", close: "Cierre (ganado / perdido)",
        onboarding: "Onboarding", customer_success: "Éxito del cliente", renewal: "Renovación",
    },
}

export function stageLabel(stage: string | null | undefined, locale: Locale): string | null {
    return isSalesStage(stage) ? LABELS[locale][stage] : null
}

/// Copy for the stage strip and stage panel. Kept here, not in en.ts/es.ts,
/// so this feature merges cleanly with other work on the big dictionaries.
const COPY = {
    en: {
        all: "All",
        unassigned: "No stage",
        stripTitle: "Your sales stages",
        stripSub: "Turn on the stages your team uses. Each stage gets its playbook, its tone and its objections.",
        stageOn: "Used by your team",
        stageOff: "Not used",
        turnOn: "Turn on",
        turnOff: "Turn off",
        tone: "Tone for this stage",
        tonePlaceholder: "Warm and curious, ask more than you talk",
        toneHint: "The coach uses this tone on calls at this stage.",
        saveTone: "Save tone",
        toneSaved: "Tone saved.",
        playbooksHere: (n: number) => n === 1 ? "1 playbook" : `${n} playbooks`,
        uploadForStage: "Upload a playbook for this stage",
        newForStage: "Write one",
        objectionsTitle: "Objections in this stage",
        objectionsNone: "No objections only for this stage yet.",
        allStageNote: (n: number) => n === 1
            ? "1 objection applies to every stage, so it applies here too."
            : `${n} objections apply to every stage, so they apply here too.`,
        removeFromStage: "Remove from stage",
        makeAllStages: "Use in all stages",
        addExisting: "Add one from your library…",
        addNew: "New objection for this stage",
        objectionPlaceholder: "What the other person says",
        answerPlaceholder: "Your approved answer",
        add: "Add",
        allStagesBadge: "All stages",
        unassignedNote: (n: number) => n === 1
            ? "1 playbook has no stage yet. Pick one in its editor."
            : `${n} playbooks have no stage yet. Pick one in each editor.`,
        stageField: "Sales stage",
        noStage: "No stage",
        offStageOption: (label: string) => `${label} (off)`,
        saveError: "Could not save. Try again.",
    },
    es: {
        all: "Todos",
        unassigned: "Sin etapa",
        stripTitle: "Tus etapas de venta",
        stripSub: "Activa las etapas que usa tu equipo. Cada etapa tiene su playbook, su tono y sus objeciones.",
        stageOn: "Tu equipo la usa",
        stageOff: "No se usa",
        turnOn: "Activar",
        turnOff: "Desactivar",
        tone: "Tono para esta etapa",
        tonePlaceholder: "Cálido y curioso, pregunta más de lo que hablas",
        toneHint: "El coach usa este tono en las llamadas de esta etapa.",
        saveTone: "Guardar tono",
        toneSaved: "Tono guardado.",
        playbooksHere: (n: number) => n === 1 ? "1 playbook" : `${n} playbooks`,
        uploadForStage: "Subir un playbook para esta etapa",
        newForStage: "Escribir uno",
        objectionsTitle: "Objeciones de esta etapa",
        objectionsNone: "Todavía no hay objeciones solo para esta etapa.",
        allStageNote: (n: number) => n === 1
            ? "1 objeción aplica a todas las etapas, así que también aplica aquí."
            : `${n} objeciones aplican a todas las etapas, así que también aplican aquí.`,
        removeFromStage: "Quitar de la etapa",
        makeAllStages: "Usar en todas las etapas",
        addExisting: "Agregar una de tu biblioteca…",
        addNew: "Nueva objeción para esta etapa",
        objectionPlaceholder: "Lo que dice la otra persona",
        answerPlaceholder: "Tu respuesta aprobada",
        add: "Agregar",
        allStagesBadge: "Todas las etapas",
        unassignedNote: (n: number) => n === 1
            ? "1 playbook todavía no tiene etapa. Elígela en su editor."
            : `${n} playbooks todavía no tienen etapa. Elígela en cada editor.`,
        stageField: "Etapa de venta",
        noStage: "Sin etapa",
        offStageOption: (label: string) => `${label} (desactivada)`,
        saveError: "No se pudo guardar. Intenta de nuevo.",
    },
} satisfies Record<Locale, unknown>

export type StageCopy = typeof COPY.en

export function stageCopy(locale: Locale): StageCopy {
    return COPY[locale]
}
