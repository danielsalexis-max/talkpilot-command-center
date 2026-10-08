import { protectedResourceHandler, metadataCorsOptionsRequestHandler } from "mcp-handler"
import { AUTH_ISSUER } from "@/lib/mcp/auth"

/// RFC 9728 metadata for the TalkPilot MCP (D-538). Served both at the root
/// and path-suffixed (/.well-known/oauth-protected-resource/api/mcp), since
/// clients probe either. The resource is always the /api/mcp endpoint.
const handler = (req: Request) => {
    const origin = new URL(req.url).origin
    const forwardedHost = req.headers.get("x-forwarded-host")
    const base = forwardedHost ? `${req.headers.get("x-forwarded-proto") ?? "https"}://${forwardedHost}` : origin
    return protectedResourceHandler({ authServerUrls: [AUTH_ISSUER], resourceUrl: `${base}/api/mcp` })(req)
}

const OPTIONS = metadataCorsOptionsRequestHandler()

export { handler as GET, OPTIONS }
