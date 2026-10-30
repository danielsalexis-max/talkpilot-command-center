import { createMcpHandler, withMcpAuth } from "mcp-handler"
import { registerTalkPilotTools } from "@/lib/mcp/tools"
import { verifyToken } from "@/lib/mcp/auth"

/// TalkPilot MCP server (D-538): the connector people add to Claude or
/// ChatGPT. URL: https://teams.talkpilot.co/api/mcp. OAuth via Supabase Auth's
/// OAuth 2.1 server; consent screen at /oauth/consent.

export const maxDuration = 60

const handler = createMcpHandler(
    server => registerTalkPilotTools(server),
    {
        serverInfo: { name: "TalkPilot", version: "1.3.0" },
        instructions:
            "TalkPilot records and coaches the user's live conversations (sales calls, meetings, interviews). " +
            "Use these tools to read their past conversations (summaries, Deep Dive analysis, transcripts), " +
            "prepare for upcoming calls, manage follow-up action items, see coaching progress, and update what the live coach knows. " +
            "TalkPilot Teams managers can also review their reps' scored calls, and admins can edit playbooks, objections and the knowledge base. " +
            "In transcripts, \"You\" is the user and \"Them\" is the other side. Answer in the user's language. " +
            "If the user asks you to set up their TalkPilot workspace or their profile, call get_setup_status and get_my_context first. " +
            "Before asking the user anything, use everything you already know about them and their company: your memory of them and past chats, " +
            "the project's files and instructions, files in the chat, their other connected tools (drive, email, CRM, calendar, notes) and read_website. " +
            "Draft every part from that, then show a plan that marks each part as found (say where), guessed, or missing. Ask only about the guessed and missing parts, " +
            "in one message, numbered, each with your suggested answer so the user can just confirm. Never ask what you already know. " +
            "Save with the TalkPilot tools only after they agree. Playbooks are saved as drafts that an admin turns on in the Command Center. " +
            "get_setup_status lists every playbook, objection and document with its id, plus warnings; point out old or wrong items in the plan and, if the user agrees, " +
            "replace them (add_knowledge with the same title, create_playbook with replace_draft) or take them out of use with archive_items. " +
            "Add the user's files with add_documents, sending their full text. " +
            "Set the team's message templates (CRM note, follow-up email, Slack recap, tasks) with get_templates and save_templates, best from a real example the team already sends. If a tool named in get_setup_status's tools_for_setup is missing from your tool list, " +
            "tell the user to disconnect and reconnect the TalkPilot connector instead of working around it.",
    },
)

const authed = withMcpAuth(handler, verifyToken, {
    required: true,
    resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp",
})

export { authed as GET, authed as POST, authed as DELETE }
