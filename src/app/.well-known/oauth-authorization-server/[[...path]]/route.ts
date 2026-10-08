import { metadataCorsOptionsRequestHandler } from "mcp-handler"
import { SUPABASE_URL } from "@/lib/mcp/auth"

/// Some MCP clients still look for authorization-server metadata on the
/// resource's own origin instead of following the protected-resource
/// document. Relay Supabase Auth's (D-538) so they find the real endpoints.
export async function GET() {
    const res = await fetch(`${SUPABASE_URL}/.well-known/oauth-authorization-server/auth/v1`, { next: { revalidate: 3600 } })
    const body = await res.text()
    return new Response(body, {
        status: res.status,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" },
    })
}

export const OPTIONS = metadataCorsOptionsRequestHandler()
