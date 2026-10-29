/// "Set it up with Claude or ChatGPT" (D-800): the prompt an admin pastes into
/// their AI once the TalkPilot connector is added, plus the card's copy.
///
/// Kept here, not in en.ts/es.ts, so this feature merges cleanly with other
/// work on the big dictionaries (same pattern as salesStages.ts). The prompt's
/// tool names are the MCP server's (src/lib/mcp/tools.ts) and are never
/// translated.

import type { Locale } from "@/i18n"

const COPY = {
    en: {
        kicker: "Faster setup",
        title: "Set it up with Claude or ChatGPT",
        sub: "Your AI already knows you and your company. It fills in what it knows, asks you only about what is missing, and saves it here. You check it before your team sees it.",
        step1: "Add TalkPilot to your AI",
        step1Claude: "Claude: Settings → Connectors → Add custom connector.",
        step1ChatGPT: "ChatGPT: Settings → Apps & Connectors → Create (Developer mode).",
        step1Then: "Paste this link, sign in to TalkPilot and click Allow.",
        step2: "Start the chat with our prompt",
        step2Hint: "Use it where your AI knows your company best: a Claude or ChatGPT project about your company works great. Add files too: sales deck, pricing, scripts.",
        chatgptHint: "In ChatGPT, turn TalkPilot on for that chat, then paste.",
        openClaude: "Open in Claude",
        openChatGPT: "Copy and open ChatGPT",
        step3: "Come back here",
        step3Hint: "Playbooks arrive as drafts. Open Playbook, check them and turn them on.",
        copyLink: "Copy link",
        copyPrompt: "Copy prompt",
        copied: "Copied",
        openPlaybook: "Open Playbook",
        settingsTitle: "Set up your workspace with AI",
        tabTitle: "Integrations",
        tabSub: "Connect TalkPilot to the tools your team already uses.",
        connectTitle: "Connect your AI",
        claudePath: "Settings → Connectors → Add custom connector",
        chatgptPath: "Settings → Apps & Connectors → Create (Developer mode)",
        thenAllow: "Paste the link, sign in to TalkPilot and click Allow.",
        setupTitle: "Set up your workspace",
        setupSub: "Your AI fills in your profile, company, playbooks and objections from what it already knows, and asks you only about what is missing. Playbooks arrive as drafts.",
        canSee: "What it can see",
        appNote: "Reps can also connect from the TalkPilot app: Settings → Integrations → Claude & ChatGPT.",
        notUsed: "Not used yet",
        crmTitle: "CRM and tools",
        crmSub: "Each rep connects their own accounts in the TalkPilot app. Here you see who connected and set the rules for the team.",
        notConnected: "Not connected",
        saveRule: "Save",
        saved: "Saved.",
        saveError: "Could not save. Try again.",
        settingsHint: "Once connected, start a chat with this prompt. Your AI fills in what it knows and asks you only about what is missing.",
        prompt:
`Set up my TalkPilot workspace. TalkPilot is the live coach my team uses on calls.

1. Call TalkPilot's get_setup_status and get_my_context to see what is already there.
2. Before you ask me anything, gather what you already know about me and my company: your memory of me and our past chats, this project's files and instructions, the files in this chat, the tools I have connected (Drive, email, CRM, calendar, notes) and our website (use read_website).
3. Draft everything from that: my own profile (who I am, my role, what my calls are for), the company profile, the sales stages we use, one playbook per stage with its steps, our most common objections with the answer we want the team to give, the documents to add, and anything we already have that is out of date or wrong, with what you would replace or archive.
4. Show me the plan and mark each part: ✅ you found it (say where), 🤔 your best guess, ❓ missing. Then ask me only about the 🤔 and ❓ parts, all in one message, numbered, with your best guess next to each so I can just answer "ok". Don't ask what you already know.
5. When I say yes, save it with the TalkPilot tools. Playbooks are saved as drafts. If I change something, change only that.
6. Write everything in the language my team uses on calls. At the end, tell me what you saved and what is left to do in the Command Center.`,
    },
    es: {
        kicker: "Configuración rápida",
        title: "Configúralo con Claude o ChatGPT",
        sub: "Tu IA ya te conoce a ti y a tu empresa. Llena lo que sabe, te pregunta solo lo que falta y lo guarda aquí. Tú lo revisas antes de que tu equipo lo vea.",
        step1: "Agrega TalkPilot a tu IA",
        step1Claude: "Claude: Settings → Connectors → Add custom connector.",
        step1ChatGPT: "ChatGPT: Settings → Apps & Connectors → Create (Developer mode).",
        step1Then: "Pega este enlace, inicia sesión en TalkPilot y haz clic en Permitir.",
        step2: "Empieza el chat con nuestro prompt",
        step2Hint: "Úsalo donde tu IA más sabe de tu empresa: un proyecto de Claude o ChatGPT sobre tu empresa funciona muy bien. Agrega también archivos: presentación de ventas, precios, guiones.",
        chatgptHint: "En ChatGPT, activa TalkPilot en ese chat y luego pega el prompt.",
        openClaude: "Abrir en Claude",
        openChatGPT: "Copiar y abrir ChatGPT",
        step3: "Vuelve aquí",
        step3Hint: "Los playbooks llegan como borradores. Abre Playbook, revísalos y actívalos.",
        copyLink: "Copiar enlace",
        copyPrompt: "Copiar prompt",
        copied: "Copiado",
        openPlaybook: "Abrir Playbook",
        settingsTitle: "Configura tu espacio de trabajo con IA",
        tabTitle: "Integraciones",
        tabSub: "Conecta TalkPilot con las herramientas que tu equipo ya usa.",
        connectTitle: "Conecta tu IA",
        claudePath: "Settings → Connectors → Add custom connector",
        chatgptPath: "Settings → Apps & Connectors → Create (Developer mode)",
        thenAllow: "Pega el enlace, inicia sesión en TalkPilot y haz clic en Permitir.",
        setupTitle: "Configura tu espacio de trabajo",
        setupSub: "Tu IA llena tu perfil, tu empresa, tus playbooks y tus objeciones con lo que ya sabe, y te pregunta solo lo que falta. Los playbooks llegan como borradores.",
        canSee: "Qué puede ver",
        appNote: "Los reps también pueden conectarlo desde la app de TalkPilot: Ajustes → Integraciones → Claude y ChatGPT.",
        notUsed: "Sin uso todavía",
        crmTitle: "CRM y herramientas",
        crmSub: "Cada rep conecta sus propias cuentas en la app de TalkPilot. Aquí ves quién se conectó y pones las reglas del equipo.",
        notConnected: "Sin conectar",
        saveRule: "Guardar",
        saved: "Guardado.",
        saveError: "No se pudo guardar. Intenta de nuevo.",
        settingsHint: "Ya conectado, empieza un chat con este prompt. Tu IA llena lo que sabe y te pregunta solo lo que falta.",
        prompt:
`Configura mi espacio de trabajo en TalkPilot. TalkPilot es el coach en vivo que usa mi equipo en sus llamadas.

1. Usa get_setup_status y get_my_context de TalkPilot para ver qué ya está configurado.
2. Antes de preguntarme nada, reúne lo que ya sabes de mí y de mi empresa: lo que recuerdas de mí y de nuestras conversaciones, los archivos e instrucciones de este proyecto, los archivos de este chat, las herramientas que tengo conectadas (Drive, correo, CRM, calendario, notas) y nuestro sitio web (usa read_website).
3. Con eso, arma todo: mi perfil (quién soy, mi rol, para qué son mis llamadas), el perfil de la empresa, las etapas de venta que usamos, un playbook por etapa con sus pasos, nuestras objeciones más comunes con la respuesta que queremos que dé el equipo, los documentos que vas a agregar, y lo que ya tenemos que esté viejo o mal, con lo que reemplazarías o archivarías.
4. Muéstrame el plan y marca cada parte: ✅ lo encontraste (di dónde), 🤔 es tu mejor suposición, ❓ falta. Luego pregúntame solo por lo 🤔 y lo ❓, todo en un mensaje, numerado y con tu mejor suposición al lado, para que yo solo responda "ok". No me preguntes lo que ya sabes.
5. Cuando te diga que sí, guárdalo con las herramientas de TalkPilot. Los playbooks se guardan como borradores. Si cambio algo, cambia solo eso.
6. Escribe todo en el idioma que usa mi equipo en sus llamadas. Al final, dime qué guardaste y qué falta hacer en el Command Center.`,
    },
}

export type AISetupCopy = typeof COPY.en

export function aiSetupCopy(locale: Locale): AISetupCopy {
    return COPY[locale]
}

/// D-804: Claude takes the prompt in the URL and opens a new chat with it
/// typed in, not sent (checked 2026-10-28; Claude shows a "use caution" note
/// above it). ChatGPT's `?q=` can send right away, before the person turns the
/// connector on for that chat, so ChatGPT gets copy-then-open.
export const claudeNewChatURL = (prompt: string) => `https://claude.ai/new?q=${encodeURIComponent(prompt)}`
export const CHATGPT_URL = "https://chatgpt.com/"
