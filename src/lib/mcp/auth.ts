import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { AuthInfo } from "@modelcontextprotocol/server"

/// TalkPilot MCP (D-538) — auth for the remote connector.
///
/// Claude / ChatGPT get their token from the Supabase OAuth 2.1 server (the
/// consent screen is /oauth/consent on this app). That token IS the user's
/// Supabase JWT, so every query below runs as the user under RLS — the
/// connector can never see more than the user already sees in the apps or the
/// Command Center. There is no service-role key anywhere in this path.

export const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
export const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/// The issuer Supabase's OAuth server advertises (RFC 8414 metadata lives at
/// `<origin>/.well-known/oauth-authorization-server/auth/v1`).
export const AUTH_ISSUER = `${SUPABASE_URL}/auth/v1`

export function supabaseAs(token: string): SupabaseClient {
    return createClient(SUPABASE_URL, SUPABASE_ANON, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
}

function jwtClaims(token: string): Record<string, unknown> {
    try {
        const part = token.split(".")[1]
        return JSON.parse(Buffer.from(part, "base64url").toString("utf8"))
    } catch {
        return {}
    }
}

/// Verifies the bearer with Supabase Auth (a real round-trip, so a revoked
/// grant or a signed-out session stops working immediately, not at expiry).
export async function verifyToken(_req: Request, bearer?: string): Promise<AuthInfo | undefined> {
    if (!bearer) return undefined
    const sb = supabaseAs(bearer)
    const { data, error } = await sb.auth.getUser(bearer)
    if (error || !data.user) return undefined
    const claims = jwtClaims(bearer)
    return {
        token: bearer,
        clientId: typeof claims.client_id === "string" ? claims.client_id : "talkpilot",
        scopes: typeof claims.scope === "string" ? claims.scope.split(" ").filter(Boolean) : [],
        expiresAt: typeof claims.exp === "number" ? claims.exp : undefined,
        extra: { userId: data.user.id, email: data.user.email ?? null },
    }
}
