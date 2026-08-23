import { supabase } from "@/lib/supabase"
import { approvedResponsesFrom, embedObjections } from "@/lib/orgBrain"
import { rollUpGuardrails } from "@/lib/guardrails"
import type { Locale } from "@/i18n"

/// Starter coaching kits for /start (D-163): one click gives a brand-new org
/// an active playbook + objection library, so the readiness gate passes and
/// reps get real coaching on their very first call. Everything here is
/// editable afterwards under Playbook.
///
/// Severity vocabulary is `normal` | `critical` ONLY — it mirrors the
/// org_objections_severity_check constraint. The original kit shipped
/// high/medium/low and the whole batch insert failed on the constraint,
/// which left new orgs with an active playbook and zero objections (D-171).
///
/// **Kits exist per language, and that is not cosmetic (D-177).** What a kit
/// inserts becomes the org's REAL playbook and objection library — a manager
/// reads it in the Command Center, and the live coach is grounded in it. So
/// a Spanish-speaking team must get Spanish content, not an English playbook
/// with a translated label on it. Two parts specifically:
///   • Stage text (names, descriptions, required items) is fed to the model
///     as playbook context. The output-language rule (D-177) means the coach
///     still SPEAKS Spanish from English source text, but the manager reading
///     the Playbook tab does not — they'd see an English playbook they never
///     wrote.
///   • Objection text is embedded and matched semantically against Spanish
///     speech; embedding the English phrasing degrades retrieval, which is a
///     silent quality loss rather than a visible bug.
/// The Spanish kits are therefore written in Spanish, not translated
/// word-for-word — the guardrail keywords are what a rep actually says out
/// loud on a Spanish call ("garantizo", "descuento", "reembolso").
///
/// **Guardrails are dual-shape (D-181):** the stage-level `guardrail_rules`
/// here are the authoring shape (they round-trip through the Playbook editor),
/// and `applyStarterKit` also rolls them up into the top-level `guardrails`
/// array via `rollUpGuardrails` — the runtime contract that the live-coach
/// prompt, `HighValueDetector.checkGuardrails`, and `score-session` actually
/// read. The rollup sentence is generated in the kit's own language (`lang`),
/// because it surfaces verbatim in scorecard breaches and manager dashboards.

interface StarterStage {
    name: string
    description: string
    required_items: string[]
    guardrail_rules: Array<{ type: string; keyword: string; action: string }>
}

export interface StarterObjection {
    objection: string
    response_guidance: string
    severity: "normal" | "critical"
}

export interface StarterKit {
    key: string
    title: string
    tagline: string
    methodology: string
    team: "sales" | "support"
    // The language the kit is WRITTEN in — drives the top-level guardrail
    // rollup sentences (D-181). Not the UI locale: a locale with no kit of its
    // own falls back to the English kits, whose guardrails must stay English.
    lang: Locale
    stages: StarterStage[]
    objections: StarterObjection[]
}

const SALES_OBJECTIONS_EN: StarterObjection[] = [
    { objection: "It's too expensive / above our budget", severity: "critical",
      response_guidance: "Don't discount on the first push. Reframe around payback: what does the problem cost them monthly? Trade any concession for a commitment (annual term, more seats, a reference)." },
    { objection: "We're already using a competitor", severity: "critical",
      response_guidance: "Ask what's working and what isn't before positioning. Differentiate on what only you do — don't disparage the incumbent, displace the gap." },
    { objection: "Let's revisit next quarter", severity: "normal",
      response_guidance: "Ask what changes next quarter. Quantify the cost of waiting in their numbers. Offer a smaller start now instead of a bigger start later." },
    { objection: "I need to check with my boss / the team", severity: "normal",
      response_guidance: "Great — offer to join that conversation. Ask what their recommendation will be and what the decision-maker will care about most." },
    { objection: "We don't have time to implement something new", severity: "normal",
      response_guidance: "Anchor on time-to-first-value, not total scope. Name exactly what their first week looks like and who does the work." },
    { objection: "Can you send me some information?", severity: "normal",
      response_guidance: "Often a soft no. Agree, then ask one more discovery question to find the real hesitation — and book the follow-up before hanging up." },
]

const SUPPORT_OBJECTIONS_EN: StarterObjection[] = [
    { objection: "This is unacceptable — I'm going to cancel", severity: "critical",
      response_guidance: "Don't defend or discount first. Acknowledge the frustration, restate the impact in their words, and give one concrete next step with a time attached. Escalate to the account owner the same day." },
    { objection: "I want a refund or credit for this", severity: "critical",
      response_guidance: "Never promise on the call. Acknowledge, capture the ask precisely, and commit to a decision by a named time from the team that owns credits." },
    { objection: "Let me speak to your manager", severity: "normal",
      response_guidance: "Agree without friction and stay useful: offer to bring the manager the full context yourself, and confirm exactly what outcome they want the manager to hear." },
    { objection: "Your competitor handles this better", severity: "normal",
      response_guidance: "Ask what specifically works better — that's the real feature request. Log it, don't argue, and show the nearest thing that exists today." },
    { objection: "This bug has been open for weeks", severity: "normal",
      response_guidance: "Give the honest status; never re-explain their own ticket back to them. Name the owner, the current blocker, and the next update date — then actually send that update." },
    { objection: "I was promised this would be included", severity: "normal",
      response_guidance: "Don't relitigate the sale. Capture who promised what and when, apologize for the mismatch, and route it to the account owner for a same-week answer." },
]

const STARTER_KITS_EN: StarterKit[] = [
    {
        key: "discovery-led",
        title: "Discovery-led sales",
        tagline: "Consultative flow for SaaS and services — understand first, pitch second.",
        methodology: "custom",
        team: "sales",
        lang: "en",
        objections: SALES_OBJECTIONS_EN,
        stages: [
            { name: "Open & rapport", description: "Set the agenda together and earn the next 25 minutes.",
              required_items: ["Confirm time available", "Agree on the agenda"], guardrail_rules: [] },
            { name: "Discovery", description: "Understand their world before showing yours.",
              required_items: ["Current process and tools", "Pain and its business cost", "Who owns the budget", "Decision timeline"], guardrail_rules: [] },
            { name: "Value framing", description: "Connect what you heard to what you do — their words, not your feature list.",
              required_items: ["Tie value to a stated pain", "Share a relevant customer story"], guardrail_rules: [] },
            { name: "Objections", description: "Welcome pushback — it means they're engaging.",
              required_items: ["Acknowledge before answering", "Confirm the objection is resolved"],
              guardrail_rules: [{ type: "forbidden_phrase", keyword: "guarantee", action: "warn" }] },
            { name: "Next steps", description: "Never end without a date on the calendar.",
              required_items: ["Concrete next step agreed", "Date and owner confirmed"], guardrail_rules: [] },
        ],
    },
    {
        key: "meddic-lite",
        title: "MEDDIC essentials",
        tagline: "Qualification-first flow for bigger deals and longer cycles.",
        methodology: "MEDDIC",
        team: "sales",
        lang: "en",
        objections: SALES_OBJECTIONS_EN,
        stages: [
            { name: "Metrics", description: "Quantify the impact they're after.",
              required_items: ["A number the buyer cares about"], guardrail_rules: [] },
            { name: "Economic buyer", description: "Find who signs.",
              required_items: ["Identify the economic buyer", "Path to reach them"], guardrail_rules: [] },
            { name: "Decision criteria & process", description: "Learn how they'll decide before you sell.",
              required_items: ["Decision criteria named", "Process and timeline mapped"], guardrail_rules: [] },
            { name: "Identify pain", description: "No pain, no deal.",
              required_items: ["Primary pain stated in their words", "Cost of doing nothing"], guardrail_rules: [] },
            { name: "Champion & close", description: "Build your inside advocate and lock the next step.",
              required_items: ["Champion identified", "Next step with a date"],
              guardrail_rules: [{ type: "forbidden_phrase", keyword: "discount", action: "flag" }] },
        ],
    },
    {
        key: "support-success",
        title: "Support & success calls",
        tagline: "De-escalate, resolve, and leave the relationship stronger than the ticket found it.",
        methodology: "custom",
        team: "support",
        lang: "en",
        objections: SUPPORT_OBJECTIONS_EN,
        stages: [
            { name: "Acknowledge & frame", description: "Let them be fully heard before you fix anything.",
              required_items: ["Restate the issue in their words", "Confirm impact and urgency"], guardrail_rules: [] },
            { name: "Diagnose", description: "Get to the real problem, not just the reported one.",
              required_items: ["Reproduce or scope the issue", "What changed recently", "Who else is affected"], guardrail_rules: [] },
            { name: "Resolve or commit", description: "End with a fix — or a named owner and a date.",
              required_items: ["Fix applied or workaround offered", "Owner and timeline named"],
              guardrail_rules: [{ type: "forbidden_phrase", keyword: "refund", action: "warn" }] },
            { name: "Confirm & prevent", description: "Close the loop and stop the repeat.",
              required_items: ["Customer confirms resolution", "Preventive step or doc shared"], guardrail_rules: [] },
            { name: "Strengthen", description: "Turn a resolved issue into renewed trust.",
              required_items: ["Check broader satisfaction", "Flag expansion or risk signals to the account owner"], guardrail_rules: [] },
        ],
    },
]

// ─────────────────────────────────────────────────────────────────────────
// Spanish (es-419) kits — written in Spanish, not translated word-for-word.
// The guardrail keywords are what a rep actually says on a Spanish call.
// ─────────────────────────────────────────────────────────────────────────

const SALES_OBJECTIONS_ES: StarterObjection[] = [
    { objection: "Es muy caro / se sale de nuestro presupuesto", severity: "critical",
      response_guidance: "No des descuento al primer empujón. Reencuadra en retorno: ¿cuánto les cuesta el problema cada mes? Cambia cualquier concesión por un compromiso (plazo anual, más asientos, una referencia)." },
    { objection: "Ya estamos usando a un competidor", severity: "critical",
      response_guidance: "Pregunta qué sí les funciona y qué no antes de posicionarte. Diferénciate en lo que solo tú haces — no hables mal del proveedor actual, desplaza el hueco." },
    { objection: "Retomemos el próximo trimestre", severity: "normal",
      response_guidance: "Pregunta qué cambia el próximo trimestre. Cuantifica el costo de esperar con sus propios números. Ofrece empezar más chico ahora en vez de más grande después." },
    { objection: "Necesito consultarlo con mi jefe / con el equipo", severity: "normal",
      response_guidance: "Perfecto — ofrece sumarte a esa conversación. Pregunta cuál será su recomendación y qué es lo que más le va a importar a quien decide." },
    { objection: "No tenemos tiempo para implementar algo nuevo", severity: "normal",
      response_guidance: "Ancla en el tiempo hasta el primer resultado, no en el alcance total. Describe exactamente cómo se ve su primera semana y quién hace el trabajo." },
    { objection: "¿Me puedes mandar información?", severity: "normal",
      response_guidance: "Suele ser un no suave. Acepta, y haz una pregunta más de descubrimiento para encontrar la duda real — y agenda el seguimiento antes de colgar." },
]

const SUPPORT_OBJECTIONS_ES: StarterObjection[] = [
    { objection: "Esto es inaceptable — voy a cancelar", severity: "critical",
      response_guidance: "No defiendas ni ofrezcas descuento primero. Reconoce la molestia, repite el impacto en sus palabras y da un paso concreto con hora. Escala al dueño de la cuenta el mismo día." },
    { objection: "Quiero un reembolso o una nota de crédito", severity: "critical",
      response_guidance: "Nunca prometas en la llamada. Reconoce, captura la petición con precisión y compromete una respuesta a una hora definida por parte del equipo que aprueba créditos." },
    { objection: "Quiero hablar con tu supervisor", severity: "normal",
      response_guidance: "Acepta sin fricción y sigue siendo útil: ofrece llevarle tú mismo el contexto completo, y confirma exactamente qué resultado quieren que escuche." },
    { objection: "Su competencia resuelve esto mejor", severity: "normal",
      response_guidance: "Pregunta qué específicamente funciona mejor — eso es el requerimiento real. Regístralo, no discutas, y muestra lo más cercano que exista hoy." },
    { objection: "Este error lleva semanas abierto", severity: "normal",
      response_guidance: "Da el estado honesto; nunca les expliques su propio ticket de vuelta. Nombra al responsable, el bloqueo actual y la fecha de la próxima actualización — y luego envíala de verdad." },
    { objection: "Me prometieron que esto venía incluido", severity: "normal",
      response_guidance: "No vuelvas a litigar la venta. Registra quién prometió qué y cuándo, ofrece disculpas por el desajuste y escálalo al dueño de la cuenta para una respuesta esa misma semana." },
]

const STARTER_KITS_ES: StarterKit[] = [
    {
        key: "discovery-led",
        title: "Ventas por descubrimiento",
        tagline: "Flujo consultivo para SaaS y servicios: primero entender, después presentar.",
        methodology: "custom",
        team: "sales",
        lang: "es",
        objections: SALES_OBJECTIONS_ES,
        stages: [
            { name: "Apertura y rapport", description: "Definan la agenda juntos y gánate los siguientes 25 minutos.",
              required_items: ["Confirmar cuánto tiempo hay", "Acordar la agenda"], guardrail_rules: [] },
            { name: "Descubrimiento", description: "Entiende su mundo antes de mostrar el tuyo.",
              required_items: ["Proceso y herramientas actuales", "El dolor y lo que le cuesta al negocio", "Quién controla el presupuesto", "Fecha de decisión"], guardrail_rules: [] },
            { name: "Encuadre de valor", description: "Conecta lo que escuchaste con lo que haces — en sus palabras, no en tu lista de funciones.",
              required_items: ["Ligar el valor a un dolor que dijeron", "Contar un caso de cliente relevante"], guardrail_rules: [] },
            { name: "Objeciones", description: "Recibe bien la objeción — significa que están enganchados.",
              required_items: ["Reconocer antes de responder", "Confirmar que la objeción quedó resuelta"],
              // "garantizo" is the form a rep actually says out loud; "garantía"
              // is the noun a buyer asks about, which must NOT trip the rule.
              guardrail_rules: [{ type: "forbidden_phrase", keyword: "garantizo", action: "warn" }] },
            { name: "Siguientes pasos", description: "Nunca termines sin una fecha en el calendario.",
              required_items: ["Siguiente paso concreto acordado", "Fecha y responsable confirmados"], guardrail_rules: [] },
        ],
    },
    {
        key: "meddic-lite",
        title: "MEDDIC esencial",
        tagline: "Flujo de calificación primero, para tratos grandes y ciclos largos.",
        methodology: "MEDDIC",
        team: "sales",
        lang: "es",
        objections: SALES_OBJECTIONS_ES,
        stages: [
            { name: "Métricas", description: "Cuantifica el impacto que buscan.",
              required_items: ["Un número que le importe a quien compra"], guardrail_rules: [] },
            { name: "Comprador económico", description: "Encuentra quién firma.",
              required_items: ["Identificar al comprador económico", "Ruta para llegar a esa persona"], guardrail_rules: [] },
            { name: "Criterios y proceso de decisión", description: "Aprende cómo van a decidir antes de vender.",
              required_items: ["Criterios de decisión nombrados", "Proceso y fechas mapeados"], guardrail_rules: [] },
            { name: "Identificar el dolor", description: "Sin dolor no hay trato.",
              required_items: ["Dolor principal dicho en sus palabras", "Costo de no hacer nada"], guardrail_rules: [] },
            { name: "Campeón y cierre", description: "Construye a tu aliado interno y asegura el siguiente paso.",
              required_items: ["Campeón identificado", "Siguiente paso con fecha"],
              guardrail_rules: [{ type: "forbidden_phrase", keyword: "descuento", action: "flag" }] },
        ],
    },
    {
        key: "support-success",
        title: "Soporte y éxito del cliente",
        tagline: "Baja la tensión, resuelve, y deja la relación mejor de como la encontró el ticket.",
        methodology: "custom",
        team: "support",
        lang: "es",
        objections: SUPPORT_OBJECTIONS_ES,
        stages: [
            { name: "Reconocer y encuadrar", description: "Deja que se sientan escuchados antes de arreglar nada.",
              required_items: ["Repetir el problema en sus palabras", "Confirmar impacto y urgencia"], guardrail_rules: [] },
            { name: "Diagnosticar", description: "Llega al problema real, no solo al que reportaron.",
              required_items: ["Reproducir o acotar el problema", "Qué cambió recientemente", "A quién más le afecta"], guardrail_rules: [] },
            { name: "Resolver o comprometer", description: "Termina con una solución — o con un responsable y una fecha.",
              required_items: ["Solución aplicada o alternativa ofrecida", "Responsable y fecha nombrados"],
              guardrail_rules: [{ type: "forbidden_phrase", keyword: "reembolso", action: "warn" }] },
            { name: "Confirmar y prevenir", description: "Cierra el ciclo y evita que se repita.",
              required_items: ["El cliente confirma que quedó resuelto", "Paso preventivo o documento compartido"], guardrail_rules: [] },
            { name: "Fortalecer", description: "Convierte un problema resuelto en confianza renovada.",
              required_items: ["Revisar la satisfacción general", "Avisar al dueño de la cuenta señales de expansión o riesgo"], guardrail_rules: [] },
        ],
    },
]

/// Kits keyed by locale. `starterKitsFor` is what call sites should use — it
/// falls back to English for any locale without a hand-written kit rather
/// than machine-translating one, because a wrong guardrail keyword is worse
/// than an English one the team can see and edit.
const STARTER_KITS_BY_LOCALE: Record<Locale, StarterKit[]> = {
    en: STARTER_KITS_EN,
    es: STARTER_KITS_ES,
}

export function starterKitsFor(locale: Locale): StarterKit[] {
    return STARTER_KITS_BY_LOCALE[locale] ?? STARTER_KITS_EN
}

/// Applies a kit: inserts the playbook and seeds the objection library.
/// A brand-new org gets it ACTIVE immediately; if an active playbook already
/// exists (the owner went back and picked a second kit), it lands as a DRAFT
/// so two playbooks are never active at once. Objections are deduplicated by
/// text so re-applying can't double the library. Returns an error or null.
export async function applyStarterKit(orgId: string, kit: StarterKit): Promise<string | null> {
    const { data: activeExisting } = await supabase.from("org_playbooks")
        .select("id").eq("org_id", orgId).eq("status", "active").limit(1)
    const status = (activeExisting?.length ?? 0) > 0 ? "draft" : "active"

    const { error: pbErr } = await supabase.from("org_playbooks").insert({
        org_id: orgId,
        name: kit.title,
        methodology: kit.methodology,
        stages: kit.stages,
        // Top-level runtime shape — without it the kit's guardrails reach
        // neither the live coach nor the scorecard grader (D-181).
        guardrails: rollUpGuardrails(kit.stages, kit.lang),
        status,
        version: 1,
    })
    if (pbErr) return pbErr.message

    const { data: existing } = await supabase.from("org_objections")
        .select("objection").eq("org_id", orgId)
    const have = new Set((existing ?? []).map(r => (r.objection as string).toLowerCase()))
    const fresh = kit.objections.filter(o => !have.has(o.objection.toLowerCase()))

    if (fresh.length > 0) {
        const { data: inserted, error: objErr } = await supabase.from("org_objections").insert(
            fresh.map(o => ({
                org_id: orgId,
                objection: o.objection,
                response_guidance: o.response_guidance,
                // The live coach reads approved_responses; the admin UI edits
                // response_guidance. Write both or the objection matches and then
                // hands the rep nothing.
                approved_responses: approvedResponsesFrom(o.response_guidance),
                severity: o.severity,
                active: true,
                variants: null,
            }))
        ).select("id")
        if (objErr) return objErr.message

        // Embed them, or the whole starter library is invisible to objection-lookup
        // and the first call a new team makes coaches nothing. Non-fatal: the
        // Objections tab shows an un-indexed count and offers a re-index.
        await embedObjections(orgId, (inserted ?? []).map(r => r.id as string))
    }
    return null
}
