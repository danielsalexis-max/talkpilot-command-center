import { supabase } from "@/lib/supabase"
import type { Locale } from "@/i18n"

/// Team wording templates (D-770). The manager writes how the team's CRM
/// note, task and follow-up email look; reps start from it and can still
/// make their own version (no lock, D-771). Stored in `org_templates`, keyed
/// by tool group so a task looks the same whether a rep uses Monday, Asana,
/// Jira or ClickUp. Mirrors PROVIDER_SLOTS / PROVIDER_GROUP in the app repo's
/// supabase/functions/_shared/templates.ts.

export type TemplateGroup = "crm" | "tasks" | "email" | "slack"
export type TemplateSlot = "recap" | "call_log" | "task_name" | "task" | "email_subject" | "email_body"

export const GROUP_SLOTS: Record<TemplateGroup, TemplateSlot[]> = {
    crm:   ["call_log", "task_name", "task"],
    tasks: ["task_name", "task"],
    email: ["email_subject", "email_body"],
    slack: ["recap", "task"],
}

export const GROUP_ORDER: TemplateGroup[] = ["crm", "tasks", "email", "slack"]

export const TEMPLATE_TOKENS = [
    "contact_name", "company", "takeaway", "action_items", "deal_name",
    "deal_stage", "call_date", "call_title", "call_duration", "user_name",
] as const

export const MAX_TEMPLATE_CHARS = 8000

export function isSingleLine(slot: TemplateSlot): boolean {
    return slot === "task_name" || slot === "email_subject"
}

export interface OrgTemplateRow { tool_group: TemplateGroup; slot: TemplateSlot; template: string; updated_at: string }

export async function loadOrgTemplates(orgId: string): Promise<OrgTemplateRow[]> {
    const { data, error } = await supabase.from("org_templates")
        .select("tool_group, slot, template, updated_at")
        .eq("org_id", orgId)
    if (error) throw error
    return (data ?? []) as OrgTemplateRow[]
}

export async function saveOrgTemplate(orgId: string, group: TemplateGroup, slot: TemplateSlot, template: string) {
    const { error } = await supabase.from("org_templates")
        .upsert({ org_id: orgId, tool_group: group, slot, template }, { onConflict: "org_id,tool_group,slot" })
    if (error) throw error
}

export async function deleteOrgTemplate(orgId: string, group: TemplateGroup, slot: TemplateSlot) {
    const { error } = await supabase.from("org_templates")
        .delete().eq("org_id", orgId).eq("tool_group", group).eq("slot", slot)
    if (error) throw error
}

// ── Preview: the server's own renderer, against obvious sample values ────────

export interface TemplatePreview { rendered: string; missing: string[]; unknown: string[] }

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.functions.invoke(fn, { body })
    if (error) throw error
    return data as T
}

export function previewTemplate(slot: TemplateSlot, template: string): Promise<TemplatePreview> {
    return invoke<TemplatePreview>("integrations-status", { action: "preview_template", key: slot, template })
}

// ── "Make my template" from a pasted example (same prompt as the apps' ───────
// TemplateExampleExtractor, D-558). Instructions stay English; the output
// keeps the example's own language.

function slotPurpose(group: TemplateGroup, slot: TemplateSlot): string {
    if (group === "slack" && slot === "task") return "a Slack message about one follow-up from the call."
    switch (slot) {
        case "recap":         return "a recap posted to a Slack channel after the call."
        case "call_log":      return "the note written into the CRM to log the call."
        case "task_name":     return "the one-line title of a task created from the call."
        case "task":          return "the notes that go under a task created from the call."
        case "email_subject": return "the subject line of a follow-up email."
        case "email_body":    return "the body of a follow-up email sent after the call."
    }
}

function extractorPrompt(group: TemplateGroup, slot: TemplateSlot): string {
    return [
        "You turn one example message that a person wrote into a reusable template for TalkPilot, an app that sends messages for them after a work call.",
        "",
        `What this template is for: ${slotPurpose(group, slot)}`,
        "",
        "Rules:",
        "- Keep their format exactly: language, greeting, line breaks, headings, bullet style, emoji, tone, length and sign-off. Do not translate. Do not improve the writing.",
        "- Replace only the parts that change from call to call with these placeholders, spelled exactly like this, with double braces:",
        "  {{contact_name}} the person they spoke with",
        "  {{company}} that person's company",
        "  {{takeaway}} a short summary of what was discussed and decided",
        "  {{action_items}} the list of next steps, one per line",
        "  {{deal_name}} the deal's name",
        "  {{deal_stage}} the deal's stage",
        "  {{call_date}} the date of the call",
        "  {{call_title}} the meeting's title",
        "  {{call_duration}} how long the call took",
        "  {{user_name}} the sender's own name",
        "- Never invent any other placeholder.",
        "- If the example has a list of next steps or tasks, replace the whole list with {{action_items}}.",
        "- If the example summarizes the discussion, replace that summary with {{takeaway}}.",
        "- A specific detail that matches no placeholder (a price, a product, a place) is removed or made general, never kept as if it were true for every call.",
        "- Keep fixed text that would be the same every time (their sign-off, a standard line).",
        isSingleLine(slot) ? "- This is one line. Return a single line, even if the example has more." : "",
        "Return only the template text. No explanation, no quotes, no code fences.",
    ].join("\n")
}

export async function templateFromExample(example: string, group: TemplateGroup, slot: TemplateSlot): Promise<string> {
    const clipped = example.trim().slice(0, 6000)
    if (!clipped) throw new Error("empty")
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/claude-proxy`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 900,
            system: extractorPrompt(group, slot),
            messages: [{ role: "user", content: `<example>\n${clipped}\n</example>` }],
        }),
    })
    if (!res.ok) throw new Error(`claude-proxy ${res.status}`)
    const data = await res.json()
    let text: string = (data?.content?.[0]?.text ?? "").trim()
    if (text.startsWith("```")) {
        const lines = text.split("\n").slice(1)
        if (lines.length && lines[lines.length - 1].trim().startsWith("```")) lines.pop()
        text = lines.join("\n").trim()
    }
    text = text.replaceAll("<example>", "").replaceAll("</example>", "").trim()
    if (isSingleLine(slot)) text = (text.split(/\r?\n/).find(l => l.trim()) ?? "").trim()
    if (!text) throw new Error("empty")
    return text.slice(0, MAX_TEMPLATE_CHARS)
}

// ── Starting points, the same ones the apps offer (D-352, D-452) ─────────────
// Picking one fills the editor; nothing is saved until "Save for the team".

export interface TemplatePreset { id: string; name: string; summary: string; body: string }

type L<T> = Record<Locale, T>
interface PresetDef { id: string; name: L<string>; summary: L<string>; body: L<string> }

const TASK_NOTES: PresetDef[] = [
    { id: "tasknotes-context",
      name: { en: "With context", es: "Con contexto" },
      summary: { en: "Whoever picks this up knows why.", es: "Quien lo tome sabe por qué." },
      body: { en: "From the call with {{contact_name}} ({{company}}) on {{call_date}}.\n\n{{takeaway}}",
              es: "De la llamada con {{contact_name}} ({{company}}) del {{call_date}}.\n\n{{takeaway}}" } },
    { id: "tasknotes-min",
      name: { en: "Minimal", es: "Mínimo" },
      summary: { en: "A line of provenance, nothing else.", es: "Una línea de origen, nada más." },
      body: { en: "From {{call_title}}, {{call_date}}.", es: "De {{call_title}}, {{call_date}}." } },
]

const PRESETS: Record<TemplateSlot, PresetDef[]> = {
    recap: [
        { id: "recap-call",
          name: { en: "Call recap", es: "Resumen de la llamada" },
          summary: { en: "Where you landed and what's next, signed by you.", es: "Dónde quedaron y qué sigue, con tu firma." },
          body: { en: "*Recap: {{call_title}}* ({{call_date}}, {{call_duration}})\n\n*Where we landed*\n{{takeaway}}\n\n*Next steps*\n{{action_items}}\n\nQuestions or anything I missed? Reply in the thread.\n{{user_name}}",
                  es: "*Resumen: {{call_title}}* ({{call_date}}, {{call_duration}})\n\n*Dónde quedamos*\n{{takeaway}}\n\n*Próximos pasos*\n{{action_items}}\n\n¿Preguntas o algo que se me haya pasado? Responde en el hilo.\n{{user_name}}" } },
        { id: "recap-deal",
          name: { en: "Deal update", es: "Avance del trato" },
          summary: { en: "Leads with where the deal stands.", es: "Empieza por cómo va el trato." },
          body: { en: "*Deal update: {{deal_name}}*\nStage: {{deal_stage}} · Call: {{call_title}} on {{call_date}}\n\n*What happened*\n{{takeaway}}\n\n*What's next*\n{{action_items}}\n\nI'll keep the CRM up to date. Flag anything that needs a hand.\n{{user_name}}",
                  es: "*Avance del trato: {{deal_name}}*\nEtapa: {{deal_stage}} · Llamada: {{call_title}} del {{call_date}}\n\n*Qué pasó*\n{{takeaway}}\n\n*Qué sigue*\n{{action_items}}\n\nVoy a mantener el CRM al día. Avísenme si algo necesita una mano.\n{{user_name}}" } },
        { id: "recap-handoff",
          name: { en: "Team handoff", es: "Traspaso al equipo" },
          summary: { en: "Hands the next steps to your team.", es: "Le pasa los próximos pasos a tu equipo." },
          body: { en: "Hi team 👋 Handoff from my call with {{company}} ({{call_date}}).\n\n*Context*\n{{takeaway}}\n\n*Who does what*\n{{action_items}}\n\nReact ✅ when you've picked up your item so nothing falls through.\n{{user_name}}",
                  es: "Hola, equipo 👋 Les dejo el traspaso de mi llamada con {{company}} ({{call_date}}).\n\n*Contexto*\n{{takeaway}}\n\n*Quién hace qué*\n{{action_items}}\n\nReaccionen con ✅ cuando tomen su tarea, así no se nos pasa nada.\n{{user_name}}" } },
        { id: "recap-quick",
          name: { en: "Quick heads-up", es: "Aviso rápido" },
          summary: { en: "For channels that move fast.", es: "Para canales que se mueven rápido." },
          body: { en: "Heads-up from today's call ({{call_title}}): {{takeaway}}\n\n*To do*\n{{action_items}}\n\nHappy to share more detail.\n{{user_name}}",
                  es: "Aviso de la llamada de hoy ({{call_title}}): {{takeaway}}\n\n*Pendientes*\n{{action_items}}\n\nCon gusto les doy más detalle.\n{{user_name}}" } },
    ],
    call_log: [
        { id: "log-standard",
          name: { en: "Full notes", es: "Notas completas" },
          summary: { en: "Everything, for the record.", es: "Todo, para que quede registrado." },
          body: { en: "{{call_title}} ({{call_duration}})\n\n{{takeaway}}\n\nCommitments:\n{{action_items}}",
                  es: "{{call_title}} ({{call_duration}})\n\n{{takeaway}}\n\nCompromisos:\n{{action_items}}" } },
        { id: "log-brief",
          name: { en: "Just the outcome", es: "Solo el resultado" },
          summary: { en: "One paragraph, no list.", es: "Un párrafo, sin lista." },
          body: { en: "Call on {{call_date}} ({{call_duration}}): {{takeaway}}",
                  es: "Llamada del {{call_date}} ({{call_duration}}): {{takeaway}}" } },
    ],
    task_name: [
        { id: "task-plain",
          name: { en: "Plain", es: "Simple" },
          summary: { en: "Just the commitment.", es: "Solo el compromiso." },
          body: { en: "{{call_title}}", es: "{{call_title}}" } },
        { id: "task-who",
          name: { en: "With the person", es: "Con la persona" },
          summary: { en: "Easier to scan on a shared board.", es: "Más fácil de ubicar en un tablero compartido." },
          body: { en: "{{contact_name}}: {{call_title}}", es: "{{contact_name}}: {{call_title}}" } },
    ],
    task: TASK_NOTES,
    email_subject: [
        { id: "subject-followup",
          name: { en: "Follow-up", es: "Seguimiento" },
          summary: { en: "Safe for almost any call.", es: "Sirve para casi cualquier llamada." },
          body: { en: "Following up on our call", es: "Seguimiento de nuestra llamada" } },
        { id: "subject-next",
          name: { en: "Next steps", es: "Próximos pasos" },
          summary: { en: "Dates the call so it's easy to find.", es: "Pone la fecha de la llamada para encontrarla fácil." },
          body: { en: "Next steps from our call on {{call_date}}", es: "Próximos pasos de nuestra llamada del {{call_date}}" } },
        { id: "subject-title",
          name: { en: "Names the call", es: "Menciona la llamada" },
          summary: { en: "Easier to find later.", es: "Más fácil de encontrar después." },
          body: { en: "{{call_title}}: recap and next steps", es: "{{call_title}}: resumen y próximos pasos" } },
        { id: "subject-friendly",
          name: { en: "Friendly", es: "Amistoso" },
          summary: { en: "Short and warm, for a first call.", es: "Corto y cálido, para una primera llamada." },
          body: { en: "Great talking today", es: "Qué gusto hablar hoy" } },
    ],
    email_body: [
        { id: "body-warm",
          name: { en: "Warm follow-up", es: "Seguimiento cercano" },
          summary: { en: "Thanks, recap, next steps.", es: "Gracias, resumen y próximos pasos." },
          body: { en: "Hi {{contact_name}},\n\nThanks for taking the time to talk today. Here's a quick summary so we're on the same page:\n\n{{takeaway}}\n\nNext steps:\n{{action_items}}\n\nIf I missed anything or you'd like to change something, just reply to this email.\n\nBest,\n{{user_name}}",
                  es: "Hola, {{contact_name}}:\n\nGracias por tomarte el tiempo de hablar hoy. Te dejo un resumen rápido para que estemos en la misma página:\n\n{{takeaway}}\n\nPróximos pasos:\n{{action_items}}\n\nSi se me pasó algo o quieres cambiar algo, solo responde este correo.\n\nSaludos,\n{{user_name}}" } },
        { id: "body-brief",
          name: { en: "Brief recap", es: "Resumen breve" },
          summary: { en: "Short: the gist and the next steps.", es: "Corto: lo esencial y los próximos pasos." },
          body: { en: "Hi {{contact_name}},\n\nGreat speaking today. In short: {{takeaway}}\n\nNext steps:\n{{action_items}}\n\nTalk soon,\n{{user_name}}",
                  es: "Hola, {{contact_name}}:\n\nQué gusto hablar hoy. En resumen: {{takeaway}}\n\nPróximos pasos:\n{{action_items}}\n\nHablamos pronto,\n{{user_name}}" } },
        { id: "body-proposal",
          name: { en: "Proposal next steps", es: "Próximos pasos de la propuesta" },
          summary: { en: "For a deal: the recap and what happens next.", es: "Para un trato: el resumen y lo que sigue." },
          body: { en: "Hi {{contact_name}},\n\nThank you for the conversation about {{deal_name}}. To recap what we discussed:\n\n{{takeaway}}\n\nHere's what happens next:\n{{action_items}}\n\nI'll follow up on each of these. If anyone else on your side should be included, feel free to loop them in.\n\nBest regards,\n{{user_name}}",
                  es: "Hola, {{contact_name}}:\n\nGracias por la conversación sobre {{deal_name}}. Para resumir lo que hablamos:\n\n{{takeaway}}\n\nEsto es lo que sigue:\n{{action_items}}\n\nVoy a dar seguimiento a cada punto. Si alguien más de tu lado debería estar al tanto, inclúyelo con confianza.\n\nSaludos cordiales,\n{{user_name}}" } },
        { id: "body-checkin",
          name: { en: "Check-in", es: "Retomar contacto" },
          summary: { en: "Picks things back up and asks for a short call.", es: "Retoma el tema y propone una llamada corta." },
          body: { en: "Hi {{contact_name}},\n\nI wanted to follow up on our call from {{call_date}}. The main takeaway on my side:\n\n{{takeaway}}\n\nOpen items:\n{{action_items}}\n\nWould a short call next week work to keep things moving? Let me know what time suits you.\n\nThanks,\n{{user_name}}",
                  es: "Hola, {{contact_name}}:\n\nTe escribo para dar seguimiento a nuestra llamada del {{call_date}}. Lo principal de mi lado:\n\n{{takeaway}}\n\nTemas pendientes:\n{{action_items}}\n\n¿Te funciona una llamada corta la próxima semana para seguir avanzando? Dime qué horario te queda mejor.\n\nGracias,\n{{user_name}}" } },
    ],
}

export function presetsFor(slot: TemplateSlot, locale: Locale): TemplatePreset[] {
    return PRESETS[slot].map(p => ({ id: p.id, name: p.name[locale], summary: p.summary[locale], body: p.body[locale] }))
}
