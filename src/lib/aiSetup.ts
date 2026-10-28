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
        sub: "Your AI already knows your company. Let it write your company profile, playbooks and objections here. You check them before your team sees them.",
        step1: "Add TalkPilot to your AI",
        step1Claude: "Claude: Settings → Connectors → Add custom connector.",
        step1ChatGPT: "ChatGPT: Settings → Apps & Connectors → Create (Developer mode).",
        step1Then: "Paste this link, sign in to TalkPilot and click Allow.",
        step2: "Copy the prompt and paste it in a new chat",
        step2Hint: "Add your files to that chat too: sales deck, pricing, scripts.",
        step3: "Come back here",
        step3Hint: "Playbooks arrive as drafts. Open Playbook, check them and turn them on.",
        copyLink: "Copy link",
        copyPrompt: "Copy prompt",
        copied: "Copied",
        openPlaybook: "Open Playbook",
        settingsTitle: "Set up your workspace with AI",
        settingsHint: "Once connected, paste this prompt in Claude or ChatGPT. It builds your company profile, playbooks and objections from what your AI knows.",
        prompt:
`Set up my TalkPilot workspace. TalkPilot is the live coach my team uses on calls.

1. Use TalkPilot's get_setup_status to see what is already set up.
2. Use what you know about my company and the files in this chat or project. Ask me up to 5 short questions, only about what you can't find.
3. Before you save anything, show me the plan: a company profile, the sales stages we use, one playbook per stage with its steps, our most common objections with the answer we want the team to give, and the documents you will add.
4. When I say yes, save it with the TalkPilot tools. Playbooks are saved as drafts.
5. Write everything in the language my team uses on calls. At the end, tell me what is left to do in the Command Center.`,
    },
    es: {
        kicker: "Configuración rápida",
        title: "Configúralo con Claude o ChatGPT",
        sub: "Tu IA ya conoce tu empresa. Deja que escriba aquí el perfil de tu empresa, tus playbooks y tus objeciones. Tú los revisas antes de que tu equipo los vea.",
        step1: "Agrega TalkPilot a tu IA",
        step1Claude: "Claude: Settings → Connectors → Add custom connector.",
        step1ChatGPT: "ChatGPT: Settings → Apps & Connectors → Create (Developer mode).",
        step1Then: "Pega este enlace, inicia sesión en TalkPilot y haz clic en Permitir.",
        step2: "Copia el prompt y pégalo en un chat nuevo",
        step2Hint: "Agrega también tus archivos a ese chat: presentación de ventas, precios, guiones.",
        step3: "Vuelve aquí",
        step3Hint: "Los playbooks llegan como borradores. Abre Playbook, revísalos y actívalos.",
        copyLink: "Copiar enlace",
        copyPrompt: "Copiar prompt",
        copied: "Copiado",
        openPlaybook: "Abrir Playbook",
        settingsTitle: "Configura tu espacio de trabajo con IA",
        settingsHint: "Ya conectado, pega este prompt en Claude o ChatGPT. Arma el perfil de tu empresa, tus playbooks y tus objeciones con lo que tu IA ya sabe.",
        prompt:
`Configura mi espacio de trabajo en TalkPilot. TalkPilot es el coach en vivo que usa mi equipo en sus llamadas.

1. Usa get_setup_status de TalkPilot para ver qué ya está configurado.
2. Usa lo que sabes de mi empresa y los archivos de este chat o proyecto. Hazme hasta 5 preguntas cortas, solo sobre lo que no encuentres.
3. Antes de guardar nada, muéstrame el plan: un perfil de la empresa, las etapas de venta que usamos, un playbook por etapa con sus pasos, nuestras objeciones más comunes con la respuesta que queremos que dé el equipo, y los documentos que vas a agregar.
4. Cuando te diga que sí, guárdalo con las herramientas de TalkPilot. Los playbooks se guardan como borradores.
5. Escribe todo en el idioma que usa mi equipo en sus llamadas. Al final, dime qué falta hacer en el Command Center.`,
    },
}

export type AISetupCopy = typeof COPY.en

export function aiSetupCopy(locale: Locale): AISetupCopy {
    return COPY[locale]
}
