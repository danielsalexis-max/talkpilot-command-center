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

/// Which industry's preset list a kit belongs to (D-192 #5).
///
/// Scoped to playbook presets deliberately: it decides which kits the Command
/// Center offers and nothing else today. It is stored on the org
/// (`settings.vertical`) rather than held in component state so other surfaces
/// — modes, practice scenarios — can adopt it later without a migration.
export type Vertical = "sales" | "real_estate" | "customer_care" | "contact_center"

export const VERTICALS: Vertical[] = ["sales", "real_estate", "customer_care", "contact_center"]

export interface StarterKit {
    key: string
    title: string
    tagline: string
    methodology: string
    team: "sales" | "support"
    vertical: Vertical
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

const REAL_ESTATE_OBJECTIONS_EN: StarterObjection[] = [
    { objection: "That price is too high for this area", severity: "critical",
      response_guidance: "Don't defend the number — evidence it. Bring the three closest comparables and what separates this property from them. If the gap is real, say so and take it back to the seller rather than arguing on the call." },
    { objection: "We want to think about it / see a few more first", severity: "normal",
      response_guidance: "Perfectly normal at this stage. Ask what specifically they'd want to compare it against, and book the next viewing before the call ends so the comparison actually happens." },
    { objection: "Your commission is higher than the agency down the road", severity: "critical",
      response_guidance: "Never discount on the call. Move the conversation to what the fee buys — marketing reach, viewings handled, average days on market, achieved-vs-asking. Trade any reduction for a longer exclusivity, and only with approval." },
    { objection: "The property needs too much work", severity: "normal",
      response_guidance: "Agree with what's visibly true, then quantify: a rough cost of the work against the price gap versus renovated comparables. Never estimate structural or legal costs on the call." },
    { objection: "We're not ready — our own place hasn't sold", severity: "normal",
      response_guidance: "That's a chain problem, not a lack of interest. Offer to look at their property too, and keep them on the list for this one with an agreed check-in date." },
    { objection: "Can you just hold it for us?", severity: "normal",
      response_guidance: "Never promise to hold. Explain what actually reserves a property in writing, and offer the concrete step that does it." },
]

const STARTER_KITS_EN: StarterKit[] = [
    {
        key: "discovery-led",
        title: "Discovery-led sales",
        tagline: "Consultative flow for SaaS and services — understand first, pitch second.",
        methodology: "custom",
        team: "sales",
        vertical: "sales",
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
        vertical: "sales",
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
        vertical: "customer_care",
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
    {
        key: "spiced",
        title: "SPICED",
        tagline: "Situation · Pain · Impact · Critical event · Decision — for teams that sell on urgency.",
        methodology: "SPICED",
        team: "sales",
        vertical: "sales",
        lang: "en",
        objections: SALES_OBJECTIONS_EN,
        stages: [
            { name: "Situation", description: "Where they are today, in facts rather than adjectives.",
              required_items: ["Current stack and process", "Team size and who is affected"], guardrail_rules: [] },
            { name: "Pain", description: "What is actually broken — asked, not assumed.",
              required_items: ["Pain in the buyer's own words", "How long it has been happening"], guardrail_rules: [] },
            { name: "Impact", description: "What the pain costs. A number they said, never one you supplied.",
              required_items: ["Quantified cost or risk", "Who feels it beyond this call"],
              guardrail_rules: [{ type: "forbidden_phrase", keyword: "guarantee", action: "warn" }] },
            { name: "Critical event", description: "The date that makes this real. No critical event, no urgency.",
              required_items: ["A dated event driving the timeline", "What happens if it slips"], guardrail_rules: [] },
            { name: "Decision", description: "How the choice gets made and by whom.",
              required_items: ["Decision criteria", "Approvers and process", "Next step with a date"],
              guardrail_rules: [{ type: "forbidden_phrase", keyword: "discount", action: "flag" }] },
        ],
    },
    {
        key: "bant",
        title: "BANT qualification",
        tagline: "Budget · Authority · Need · Timing — a fast qualification call.",
        methodology: "BANT",
        team: "sales",
        vertical: "sales",
        lang: "en",
        objections: SALES_OBJECTIONS_EN,
        stages: [
            { name: "Need", description: "Establish there is a real problem before anything else.",
              required_items: ["Problem stated by the buyer", "What they have already tried"], guardrail_rules: [] },
            { name: "Budget", description: "Find the range, not the exact figure — and never quote before you know it.",
              required_items: ["Budget range or funding source", "Who owns that budget"],
              guardrail_rules: [{ type: "forbidden_phrase", keyword: "discount", action: "flag" }] },
            { name: "Authority", description: "Who can say yes, and who can say no.",
              required_items: ["Decision maker named", "Other people who must agree"], guardrail_rules: [] },
            { name: "Timing", description: "When they need this working, and what sets that date.",
              required_items: ["Target date", "What drives it"], guardrail_rules: [] },
            { name: "Next step", description: "Qualify in or out — both are good outcomes.",
              required_items: ["Explicit qualify in/out", "Next step with a date and owner"], guardrail_rules: [] },
        ],
    },
    {
        key: "sandler",
        title: "Sandler",
        tagline: "Up-front contracts and mutual qualification — the buyer earns the demo.",
        methodology: "Sandler",
        team: "sales",
        vertical: "sales",
        lang: "en",
        objections: SALES_OBJECTIONS_EN,
        stages: [
            { name: "Bonding & up-front contract", description: "Agree what this call is for and how it can end — including 'no'.",
              required_items: ["Agenda agreed by both sides", "Permitted outcomes stated, no included"], guardrail_rules: [] },
            { name: "Pain", description: "Get to the third layer: the surface reason, the business reason, the personal one.",
              required_items: ["Surface problem", "Business impact", "Why it matters to this person"], guardrail_rules: [] },
            { name: "Budget", description: "Money before presentation. If it cannot be funded, stop here.",
              required_items: ["Willingness and ability to invest", "Range confirmed"],
              guardrail_rules: [{ type: "forbidden_phrase", keyword: "guarantee", action: "warn" }] },
            { name: "Decision", description: "Map the real process before you present, not after.",
              required_items: ["Who, how and when the decision is made", "What could stop it"], guardrail_rules: [] },
            { name: "Fulfilment & post-sell", description: "Present only what the pain demands, then protect against buyer's remorse.",
              required_items: ["Presentation tied to stated pain", "Objections surfaced deliberately", "Next step confirmed"], guardrail_rules: [] },
        ],
    },
    {
        key: "real-estate",
        title: "Property enquiry to offer",
        tagline: "Buyer and seller calls — qualify, show, and get to a written offer.",
        methodology: "custom",
        team: "sales",
        vertical: "real_estate",
        lang: "en",
        objections: REAL_ESTATE_OBJECTIONS_EN,
        stages: [
            { name: "Qualify the enquiry", description: "Understand who is calling and what they can actually transact.",
              required_items: ["Buying or selling, and timeline", "Budget or expected price", "Financing status or chain position"], guardrail_rules: [] },
            { name: "Needs and constraints", description: "The must-haves, and the ones that are really nice-to-haves.",
              required_items: ["Location and property requirements", "Non-negotiables vs preferences", "Who else decides"], guardrail_rules: [] },
            { name: "Match and show", description: "Present properties against what they said, not what you want to move.",
              required_items: ["Properties tied to stated criteria", "Viewing booked or scheduled"],
              guardrail_rules: [{ type: "forbidden_phrase", keyword: "guarantee", action: "warn" }] },
            { name: "Handle concerns", description: "Price, condition and timing are the three that decide it.",
              required_items: ["Concern acknowledged and answered", "Comparable evidence offered"],
              guardrail_rules: [{ type: "forbidden_phrase", keyword: "appraise", action: "flag" }] },
            { name: "Advance to offer", description: "Every call ends with a dated next step toward paperwork.",
              required_items: ["Concrete next step", "Date and owner confirmed"], guardrail_rules: [] },
        ],
    },
    {
        key: "contact-center",
        title: "Contact centre handling",
        tagline: "High-volume inbound — verify, resolve, and close the loop within handle time.",
        methodology: "custom",
        team: "support",
        vertical: "contact_center",
        lang: "en",
        objections: SUPPORT_OBJECTIONS_EN,
        stages: [
            { name: "Greeting and verification", description: "Open consistently and confirm who you are speaking to.",
              required_items: ["Standard greeting used", "Identity verified per policy"],
              guardrail_rules: [{ type: "forbidden_phrase", keyword: "password", action: "escalate" }] },
            { name: "Understand the reason", description: "Let them finish. The stated reason is rarely the whole one.",
              required_items: ["Reason for the call in their words", "Confirmed understanding back to them"], guardrail_rules: [] },
            { name: "Resolve or route", description: "Fix it now, or hand it off cleanly with context attached.",
              required_items: ["Action taken or owner named", "Expectation set with a time"],
              guardrail_rules: [{ type: "forbidden_phrase", keyword: "refund", action: "flag" }] },
            { name: "Confirm and close", description: "Check nothing else is open before ending.",
              required_items: ["Resolution confirmed by the customer", "Anything else asked"], guardrail_rules: [] },
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

const REAL_ESTATE_OBJECTIONS_ES: StarterObjection[] = [
    { objection: "Ese precio está muy alto para la zona", severity: "critical",
      response_guidance: "No defiendas el número — susténtalo. Lleva los tres comparables más cercanos y qué distingue a esta propiedad. Si la diferencia es real, dilo y llévalo al propietario en vez de discutirlo en la llamada." },
    { objection: "Lo vamos a pensar / queremos ver otras primero", severity: "normal",
      response_guidance: "Es normal en esta etapa. Pregunta con qué exactamente quieren compararla y agenda la siguiente visita antes de colgar, para que la comparación de verdad ocurra." },
    { objection: "Su comisión es más alta que la de la inmobiliaria de al lado", severity: "critical",
      response_guidance: "Nunca bajes la comisión en la llamada. Mueve la conversación a qué compra ese honorario — alcance del marketing, visitas gestionadas, días promedio en mercado, precio logrado vs. pedido. Cualquier reducción se cambia por exclusividad más larga, y solo con autorización." },
    { objection: "La propiedad necesita demasiado trabajo", severity: "normal",
      response_guidance: "Dale la razón en lo que es visiblemente cierto y luego cuantifica: un costo aproximado de la obra contra la diferencia de precio frente a comparables ya remodelados. Nunca estimes costos estructurales o legales en la llamada." },
    { objection: "No estamos listos — todavía no vendemos la nuestra", severity: "normal",
      response_guidance: "Eso es un tema de cadena, no falta de interés. Ofrece revisar también su propiedad y déjalos en la lista de esta con una fecha de seguimiento acordada." },
    { objection: "¿Nos la puede apartar?", severity: "normal",
      response_guidance: "Nunca prometas apartarla. Explica qué reserva realmente una propiedad por escrito y ofrece el paso concreto que lo logra." },
]

const STARTER_KITS_ES: StarterKit[] = [
    {
        key: "discovery-led",
        title: "Ventas por descubrimiento",
        tagline: "Flujo consultivo para SaaS y servicios: primero entender, después presentar.",
        methodology: "custom",
        team: "sales",
        vertical: "sales",
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
        vertical: "sales",
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
        vertical: "customer_care",
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
    {
        key: "spiced",
        title: "SPICED",
        tagline: "Situación · Dolor · Impacto · Evento crítico · Decisión — para equipos que venden por urgencia.",
        methodology: "SPICED",
        team: "sales",
        vertical: "sales",
        lang: "es",
        objections: SALES_OBJECTIONS_ES,
        stages: [
            { name: "Situación", description: "Dónde están hoy, en hechos y no en adjetivos.",
              required_items: ["Herramientas y proceso actual", "Tamaño del equipo y a quiénes afecta"], guardrail_rules: [] },
            { name: "Dolor", description: "Qué está realmente roto — preguntado, no supuesto.",
              required_items: ["El dolor en palabras del cliente", "Desde cuándo ocurre"], guardrail_rules: [] },
            { name: "Impacto", description: "Cuánto cuesta ese dolor. Un número que dijo el cliente, nunca uno que pusiste tú.",
              required_items: ["Costo o riesgo cuantificado", "A quién más le pega"],
              guardrail_rules: [{ type: "forbidden_phrase", keyword: "garantizo", action: "warn" }] },
            { name: "Evento crítico", description: "La fecha que lo vuelve real. Sin evento crítico no hay urgencia.",
              required_items: ["Un evento con fecha que marca el plazo", "Qué pasa si se recorre"], guardrail_rules: [] },
            { name: "Decisión", description: "Cómo se toma la decisión y quién la toma.",
              required_items: ["Criterios de decisión", "Quiénes aprueban y el proceso", "Siguiente paso con fecha"],
              guardrail_rules: [{ type: "forbidden_phrase", keyword: "descuento", action: "flag" }] },
        ],
    },
    {
        key: "bant",
        title: "Calificación BANT",
        tagline: "Presupuesto · Autoridad · Necesidad · Tiempo — una llamada de calificación rápida.",
        methodology: "BANT",
        team: "sales",
        vertical: "sales",
        lang: "es",
        objections: SALES_OBJECTIONS_ES,
        stages: [
            { name: "Necesidad", description: "Confirma que hay un problema real antes que cualquier otra cosa.",
              required_items: ["El problema dicho por el cliente", "Qué han intentado ya"], guardrail_rules: [] },
            { name: "Presupuesto", description: "Busca el rango, no la cifra exacta — y nunca cotices antes de conocerlo.",
              required_items: ["Rango de presupuesto u origen de los fondos", "Quién es dueño de ese presupuesto"],
              guardrail_rules: [{ type: "forbidden_phrase", keyword: "descuento", action: "flag" }] },
            { name: "Autoridad", description: "Quién puede decir que sí, y quién puede decir que no.",
              required_items: ["Tomador de decisión identificado", "Quiénes más deben estar de acuerdo"], guardrail_rules: [] },
            { name: "Tiempo", description: "Para cuándo lo necesitan funcionando y qué marca esa fecha.",
              required_items: ["Fecha objetivo", "Qué la determina"], guardrail_rules: [] },
            { name: "Siguiente paso", description: "Califica dentro o fuera — ambos son buenos resultados.",
              required_items: ["Calificación explícita dentro/fuera", "Siguiente paso con fecha y responsable"], guardrail_rules: [] },
        ],
    },
    {
        key: "sandler",
        title: "Sandler",
        tagline: "Contrato previo y calificación mutua — el cliente se gana la demo.",
        methodology: "Sandler",
        team: "sales",
        vertical: "sales",
        lang: "es",
        objections: SALES_OBJECTIONS_ES,
        stages: [
            { name: "Vínculo y contrato previo", description: "Acuerden para qué es esta llamada y cómo puede terminar — incluido un 'no'.",
              required_items: ["Agenda acordada por ambas partes", "Resultados posibles dichos, incluido el no"], guardrail_rules: [] },
            { name: "Dolor", description: "Llega a la tercera capa: la razón de superficie, la del negocio y la personal.",
              required_items: ["Problema de superficie", "Impacto en el negocio", "Por qué le importa a esta persona"], guardrail_rules: [] },
            { name: "Presupuesto", description: "El dinero antes de la presentación. Si no se puede financiar, se detiene aquí.",
              required_items: ["Disposición y capacidad de invertir", "Rango confirmado"],
              guardrail_rules: [{ type: "forbidden_phrase", keyword: "garantizo", action: "warn" }] },
            { name: "Decisión", description: "Mapea el proceso real antes de presentar, no después.",
              required_items: ["Quién, cómo y cuándo se decide", "Qué podría frenarlo"], guardrail_rules: [] },
            { name: "Cumplimiento y post-venta", description: "Presenta solo lo que el dolor exige y luego protege contra el arrepentimiento.",
              required_items: ["Presentación ligada al dolor declarado", "Objeciones sacadas a propósito", "Siguiente paso confirmado"], guardrail_rules: [] },
        ],
    },
    {
        key: "real-estate",
        title: "De consulta a oferta",
        tagline: "Llamadas con compradores y propietarios — califica, muestra y llega a una oferta por escrito.",
        methodology: "custom",
        team: "sales",
        vertical: "real_estate",
        lang: "es",
        objections: REAL_ESTATE_OBJECTIONS_ES,
        stages: [
            { name: "Califica la consulta", description: "Entiende quién llama y qué puede realmente concretar.",
              required_items: ["Compra o vende, y en qué plazo", "Presupuesto o precio esperado", "Situación de crédito o de su propiedad actual"], guardrail_rules: [] },
            { name: "Necesidades y límites", description: "Los indispensables, y los que en realidad son deseables.",
              required_items: ["Zona y requisitos de la propiedad", "Innegociables vs. preferencias", "Quién más decide"], guardrail_rules: [] },
            { name: "Propuesta y visita", description: "Presenta propiedades según lo que dijeron, no según lo que quieres mover.",
              required_items: ["Propiedades ligadas a los criterios dichos", "Visita agendada"],
              guardrail_rules: [{ type: "forbidden_phrase", keyword: "garantizo", action: "warn" }] },
            { name: "Maneja las dudas", description: "Precio, estado y tiempos son las tres que deciden.",
              required_items: ["Duda reconocida y respondida", "Comparables ofrecidos como evidencia"],
              guardrail_rules: [{ type: "forbidden_phrase", keyword: "avalúo", action: "flag" }] },
            { name: "Avanza a la oferta", description: "Toda llamada termina con un siguiente paso con fecha hacia el papeleo.",
              required_items: ["Siguiente paso concreto", "Fecha y responsable confirmados"], guardrail_rules: [] },
        ],
    },
    {
        key: "contact-center",
        title: "Atención en contact center",
        tagline: "Entrantes de alto volumen — verifica, resuelve y cierra dentro del tiempo de atención.",
        methodology: "custom",
        team: "support",
        vertical: "contact_center",
        lang: "es",
        objections: SUPPORT_OBJECTIONS_ES,
        stages: [
            { name: "Saludo y verificación", description: "Abre igual siempre y confirma con quién hablas.",
              required_items: ["Saludo estándar usado", "Identidad verificada según política"],
              guardrail_rules: [{ type: "forbidden_phrase", keyword: "contraseña", action: "escalate" }] },
            { name: "Entiende el motivo", description: "Déjalo terminar. El motivo que dice rara vez es todo el motivo.",
              required_items: ["Motivo de la llamada en sus palabras", "Confirmaste que entendiste"], guardrail_rules: [] },
            { name: "Resuelve o deriva", description: "Resuélvelo ahora, o derívalo limpio y con contexto.",
              required_items: ["Acción tomada o responsable nombrado", "Expectativa fijada con un tiempo"],
              guardrail_rules: [{ type: "forbidden_phrase", keyword: "reembolso", action: "flag" }] },
            { name: "Confirma y cierra", description: "Verifica que no quede nada abierto antes de terminar.",
              required_items: ["Resolución confirmada por el cliente", "Preguntaste si falta algo más"], guardrail_rules: [] },
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
