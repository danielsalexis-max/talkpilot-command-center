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
        serverInfo: { name: "TalkPilot", version: "1.0.0" },
        instructions:
            "TalkPilot records and coaches the user's live conversations (sales calls, meetings, interviews). " +
            "Use these tools to read their past conversations (summaries, Deep Dive analysis, transcripts), " +
            "prepare for upcoming calls, manage follow-up action items, see coaching progress, and update what the live coach knows. " +
            "TalkPilot Teams managers can also review their reps' scored calls, and admins can edit playbooks, objections and the knowledge base. " +
            "In transcripts, \"You\" is the user and \"Them\" is the other side. Answer in the user's language. " +
            "If the user asks you to set up their TalkPilot workspace, call get_setup_status first, use what you know and the files they shared, " +
            "show them a plan, and save with the TalkPilot tools only after they agree. Playbooks are saved as drafts that an admin turns on in the Command Center.",
    },
)

const authed = withMcpAuth(handler, verifyToken, {
    required: true,
    resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp",
})

export { authed as GET, authed as POST, authed as DELETE }
