// Mirrors Sources/TalkPilotCore/Models/PracticeScenario.swift's `stockLibrary`
// (generated from it on 2026-10-12, D-586): ids, titles, goals, characters and
// skills, in English and in the apps' own Spanish (TalkPilotCore es.lproj), so
// the manager sees exactly what the rep will see in the app. The Command Center
// can't import Swift. The `id` is what matters functionally: it's what the apps
// resolve back to the full scenario at run time. Keep in sync if the Swift
// library changes.

import type { SceneKey } from "@/lib/sceneArt"

export interface StockScenario {
    id: string
    title: string
    category: string
    difficulty: "easy" | "medium" | "hard"
    durationMinutes: number
    character: string
    skills: string[]
    objective: string
    es: { title: string; category: string; skills: string[]; objective: string }
}

export const STOCK_PRACTICE_SCENARIOS: StockScenario[] = [
    { id: "behavioral-interview", title: "The job interview", category: "Interviews", difficulty: "medium", durationMinutes: 5,
        character: "Jordan", skills: ["Telling your story", "Staying concrete", "Not rambling"],
        objective: "Answer what was actually asked, with one real example — and stop talking when you're done.",
        es: { title: "La entrevista de trabajo", category: "Entrevistas", skills: ["Contar tu historia", "Ser concreto", "No divagar"],
            objective: "Responde lo que de verdad te preguntaron, con un ejemplo real, y deja de hablar cuando termines." } },
    { id: "hard-feedback-peer", title: "Say the hard thing to a friend", category: "Difficult conversations", difficulty: "medium", durationMinutes: 5,
        character: "Tomás", skills: ["Directness", "Kindness", "Not backing down"],
        objective: "Name the thing plainly, stay kind, and don't let a joke turn it into nothing.",
        es: { title: "Dile lo difícil a un amigo", category: "Conversaciones difíciles", skills: ["Franqueza", "Amabilidad", "No echarte atrás"],
            objective: "Nombra el tema con claridad, mantente amable y no dejes que un chiste lo convierta en nada." } },
    { id: "repair-after-fight", title: "Make up after a fight", category: "Personal & relationships", difficulty: "medium", durationMinutes: 5,
        character: "Sam", skills: ["Listening", "Owning your part", "Not getting defensive"],
        objective: "Reconnect without re-arguing who was right. Listen first. Explain later, and only if asked.",
        es: { title: "Reconciliarse después de una pelea", category: "Personal y relaciones", skills: ["Escuchar", "Reconocer tu parte", "No ponerte a la defensiva"],
            objective: "Reconecta sin volver a discutir quién tenía razón. Primero escucha. Explica después, y solo si te lo piden." } },
    { id: "say-no", title: "Say no without feeling bad", category: "Difficult conversations", difficulty: "easy", durationMinutes: 5,
        character: "Priya", skills: ["Saying no", "Holding a boundary", "Staying friendly"],
        objective: "Say no clearly in the first thirty seconds, then stop explaining.",
        es: { title: "Di que no sin sentirte mal", category: "Conversaciones difíciles", skills: ["Decir que no", "Sostener un límite", "Mantener la buena onda"],
            objective: "Di que no con claridad en los primeros treinta segundos, y deja de explicar." } },
    { id: "ask-for-raise", title: "Ask for a raise", category: "Negotiation", difficulty: "medium", durationMinutes: 5,
        character: "Sofia", skills: ["Making the ask", "Backing it up", "Not accepting 'later'"],
        objective: "Say a real number out loud, back it with what you've done, and leave with something concrete — not 'let me see.'",
        es: { title: "Pide un aumento", category: "Negociación", skills: ["Hacer la petición", "Respaldarlo", "No aceptar un “después”"],
            objective: "Di una cifra real en voz alta, respáldala con lo que has hecho y sal con algo concreto, no con un “déjame ver”." } },
    { id: "salary-negotiation", title: "Negotiate the offer", category: "Negotiation", difficulty: "medium", durationMinutes: 5,
        character: "Dana", skills: ["Naming a number", "Staying calm", "Not apologising"],
        objective: "Ask for more without apologising for asking — and get to a yes or a clear next step.",
        es: { title: "Negocia la oferta", category: "Negociación", skills: ["Decir una cifra", "Mantener la calma", "No pedir disculpas"],
            objective: "Pide más sin disculparte por pedir, y llega a un sí o a un próximo paso claro." } },
    { id: "first-date", title: "First date, first ten minutes", category: "Personal & relationships", difficulty: "easy", durationMinutes: 5,
        character: "Alex", skills: ["Small talk", "Asking good questions", "Being interesting"],
        objective: "Get past the weather. Ask something real, and answer with something real back.",
        es: { title: "Primera cita, primeros diez minutos", category: "Personal y relaciones", skills: ["Conversación ligera", "Hacer buenas preguntas", "Ser interesante"],
            objective: "Sal del clima. Pregunta algo real, y responde con algo real." } },
    { id: "speak-up-meeting", title: "Speak up when nobody's listening", category: "Public speaking & pitch", difficulty: "medium", durationMinutes: 5,
        character: "Chris", skills: ["Getting the floor", "Being brief", "Not trailing off"],
        objective: "Get the floor, say it in under thirty seconds, and finish the sentence you started.",
        es: { title: "Habla cuando nadie escucha", category: "Hablar en público y pitch", skills: ["Tomar la palabra", "Ser breve", "No quedarte a media frase"],
            objective: "Toma la palabra, dilo en menos de treinta segundos y termina la frase que empezaste." } },
    { id: "skeptical-prospect", title: "Win over someone who isn't sold", category: "Sales & customer", difficulty: "medium", durationMinutes: 5,
        character: "Marcus", skills: ["Asking before pitching", "Being specific", "Confidence"],
        objective: "Ask about his problem before you talk about your answer, and earn a real next step.",
        es: { title: "Convence a quien no está convencido", category: "Ventas y clientes", skills: ["Preguntar antes de vender", "Ser específico", "Seguridad"],
            objective: "Pregunta por su problema antes de hablar de tu solución, y gánate un próximo paso real." } },
]

/// Retired from the apps by D-244: not startable there any more, so never
/// offered here. Kept only so an assignment made before the rewrite still
/// shows a name.
export const RETIRED_SCENARIO_TITLES: Record<string, { en: string; es: string }> = {
    "fire-underperformer": { en: "Let go of an underperformer", es: "Despide a alguien que no rinde" },
    "churn-save": { en: "Save a customer who's cancelling", es: "Retén a un cliente que quiere cancelar" },
    "investor-pitch-qa": { en: "Investor pitch · Q&A grilling", es: "Pitch a inversionistas · preguntas difíciles" },
}

/// The drawing each scenario shows: the apps' own mapping
/// (MacSceneArt.forScenario).
export const SCENARIO_SCENE: Record<string, SceneKey> = {"behavioral-interview": "spotlight", "hard-feedback-peer": "bubbles", "repair-after-fight": "storm", "fire-underperformer": "storm", "say-no": "phone", "salary-negotiation": "scale", "ask-for-raise": "chart", "first-date": "candle", "speak-up-meeting": "table", "skeptical-prospect": "phone", "churn-save": "phone", "investor-pitch-qa": "chart"}

/// The scenario as the reader should see it, in their language.
export function localizedScenario(s: StockScenario, locale: string): { title: string; category: string; objective: string; skills: string[] } {
    return locale.startsWith("es") ? s.es : { title: s.title, category: s.category, objective: s.objective, skills: s.skills }
}

/// A title for any assignment, including ones made for retired scenarios.
export function scenarioTitle(id: string | null, locale: string): string | null {
    if (!id) return null
    const s = STOCK_PRACTICE_SCENARIOS.find(x => x.id === id)
    if (s) return localizedScenario(s, locale).title
    const r = RETIRED_SCENARIO_TITLES[id]
    return r ? (locale.startsWith("es") ? r.es : r.en) : null
}
