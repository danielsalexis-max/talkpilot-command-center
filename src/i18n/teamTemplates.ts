/// Strings for the team wording templates page (/templates, D-770).
///
/// Kept in their own file instead of en.ts/es.ts: other work edits those
/// dictionaries in parallel, and this page's strings move together. Spanish
/// is neutral LATAM (tuteo). Terms match the apps' catalog: "Crear mi
/// plantilla", "Pegar un ejemplo", "Registro de llamada", "Vista previa".

import type { Locale } from "@/i18n"

const en = {
    nav: "Templates",
    title: "Templates",
    sub: "Set how your team's CRM notes, tasks and follow-up emails look. Reps start from these and can still make their own version.",
    readOnly: "Only owners, admins and managers can change these.",
    groups: {
        crm:   { title: "CRM update",      tools: "HubSpot, Salesforce" },
        tasks: { title: "Tasks",           tools: "Monday, Asana, Jira, ClickUp" },
        email: { title: "Follow-up email", tools: "Gmail, Outlook, Apple Mail" },
        slack: { title: "Slack",           tools: "Slack" },
    },
    slots: {
        call_log: "Call note",
        task_name: "Task title",
        task: "Task notes",
        email_subject: "Subject",
        email_body: "Body",
        recap: "Recap",
        slackTask: "Follow-up message",
    },
    statusTeam: "Team template",
    statusBuiltIn: "Built-in wording",
    edit: "Edit",
    close: "Close",
    startFrom: "Start from",
    pasteExample: "Paste an example",
    pasteHelp: "Paste a message you wrote before. TalkPilot keeps its format and fills in the details from each call.",
    makeMine: "Make my template",
    making: "Making…",
    madeFromExample: "Made from your example. Check it, change anything, then save.",
    exampleFailed: "Couldn't make a template from that. Try again or write it here.",
    tokens: "Insert a detail",
    preview: "Preview",
    previewSample: "With sample details, not a real call.",
    previewEmpty: "Write something to see the preview.",
    unknownWarning: "Not a real detail, it will show as written:",
    save: "Save for the team",
    saving: "Saving…",
    saved: "Saved. Reps get it on their next send.",
    useBuiltIn: "Use built-in wording",
    removed: "Removed. Reps without their own version get the built-in wording.",
    saveFailed: "Couldn't save. Try again.",
    tooLong: (max: number) => `Too long. Keep it under ${max} characters.`,
    empty: "Write the template first.",
    howItWorks: "How it works",
    howItWorksBody: "Each rep uses their own version if they made one. If not, they get the team template. If there's none, TalkPilot writes it for them. Reps see in the app when a template comes from the team.",
}

export type TeamTemplatesDict = typeof en

const es: TeamTemplatesDict = {
    nav: "Plantillas",
    title: "Plantillas",
    sub: "Define cómo se ven las notas del CRM, las tareas y los correos de seguimiento de tu equipo. Los vendedores parten de estas y pueden hacer su propia versión.",
    readOnly: "Solo los dueños, administradores y gerentes pueden cambiarlas.",
    groups: {
        crm:   { title: "Actualización del CRM",  tools: "HubSpot, Salesforce" },
        tasks: { title: "Tareas",                 tools: "Monday, Asana, Jira, ClickUp" },
        email: { title: "Correo de seguimiento",  tools: "Gmail, Outlook, Apple Mail" },
        slack: { title: "Slack",                  tools: "Slack" },
    },
    slots: {
        call_log: "Registro de llamada",
        task_name: "Título de la tarea",
        task: "Notas de la tarea",
        email_subject: "Asunto",
        email_body: "Cuerpo",
        recap: "Resumen",
        slackTask: "Mensaje de seguimiento",
    },
    statusTeam: "Plantilla del equipo",
    statusBuiltIn: "Texto de TalkPilot",
    edit: "Editar",
    close: "Cerrar",
    startFrom: "Empezar con",
    pasteExample: "Pegar un ejemplo",
    pasteHelp: "Pega un mensaje que ya hayas escrito. TalkPilot mantiene su formato y completa los datos de cada llamada.",
    makeMine: "Crear mi plantilla",
    making: "Creando…",
    madeFromExample: "Lo hicimos con tu ejemplo. Revísalo, cambia lo que quieras y guárdalo.",
    exampleFailed: "No pudimos crear una plantilla con eso. Inténtalo de nuevo o escríbela aquí.",
    tokens: "Insertar un dato",
    preview: "Vista previa",
    previewSample: "Con datos de ejemplo, no de una llamada real.",
    previewEmpty: "Escribe algo para ver la vista previa.",
    unknownWarning: "No es un dato real, se verá tal cual:",
    save: "Guardar para el equipo",
    saving: "Guardando…",
    saved: "Guardada. Los vendedores la usan desde su próximo envío.",
    useBuiltIn: "Usar el texto de TalkPilot",
    removed: "Quitada. Quien no tenga su propia versión usa el texto de TalkPilot.",
    saveFailed: "No se pudo guardar. Inténtalo de nuevo.",
    tooLong: (max: number) => `Es muy largo. Usa menos de ${max} caracteres.`,
    empty: "Primero escribe la plantilla.",
    howItWorks: "Cómo funciona",
    howItWorksBody: "Cada vendedor usa su propia versión si hizo una. Si no, usa la plantilla del equipo. Si no hay ninguna, TalkPilot la escribe sola. En la app, el vendedor ve cuándo una plantilla viene del equipo.",
}

export const teamTemplatesDict: Record<Locale, TeamTemplatesDict> = { en, es }
