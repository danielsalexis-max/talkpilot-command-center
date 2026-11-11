/// Turns an error from Supabase, an edge function or the network into a line
/// the user can read in their own language.
///
/// Those errors arrive in English ("Invalid login credentials", "Failed to
/// fetch", "duplicate key value…"). Showing them as-is put English text in
/// the Spanish Command Center. Known ones map to `t.errors`; anything else
/// keeps its own text in English (it is often specific and useful) but falls
/// back to the caller's translated line in Spanish, or when it reads like
/// database internals. The raw text always goes to the console.

import { dictionaries, type Dict } from "@/i18n"

function rawText(e: unknown): string {
    if (!e) return ""
    if (typeof e === "string") return e
    if (typeof e === "object") {
        const o = e as Record<string, unknown>
        if (typeof o.message === "string") return o.message
        if (o.error && typeof o.error === "object" && typeof (o.error as Record<string, unknown>).message === "string") {
            return (o.error as Record<string, unknown>).message as string
        }
        if (typeof o.error === "string") return o.error
    }
    return String(e)
}

const SPANISH_WORDS = /\b(el|la|los|las|de|del|que|no|tu|tus|un|una|ya|para|con|por|este|esta|ese|esa|hay|puedes|debes)\b/gi

function looksSpanish(raw: string): boolean {
    if (/[áéíóúñ¿¡]/i.test(raw)) return true
    return (raw.match(SPANISH_WORDS) ?? []).length >= 2
}

const DB_SMELL = /violates|constraint|relation |column |duplicate key|syntax error|row-level security|foreign key|null value in|PGRST|pgrst|invalid input syntax/i

/// The `t.errors` line for an error we recognize, or null.
export function knownError(raw: string, t: Dict): string | null {
    const r = raw.toLowerCase()
    if (!r) return null
    if (/failed to fetch|networkerror|load failed|network request failed|fetch failed/.test(r)) return t.errors.network
    if (/invalid login credentials|invalid_credentials/.test(r)) return t.errors.invalidLogin
    if (/email not confirmed/.test(r)) return t.errors.emailNotConfirmed
    if (/already (been )?registered|user_already_exists|email_exists/.test(r)) return t.errors.alreadyRegistered
    if (/should be different from the old/.test(r)) return t.errors.samePassword
    if (/password should be|weak_password|password is too short/.test(r)) {
        const n = raw.match(/at least (\d+)/i)
        return t.errors.weakPassword(n ? Number(n[1]) : null)
    }
    if (/invalid format|invalid email|email_address_invalid/.test(r)) return t.errors.invalidEmail
    if (/token has expired|otp_expired|link is invalid or has expired|email link is invalid/.test(r)) return t.errors.linkExpired
    if (/jwt expired|auth session missing|not authenticated|invalid jwt|session_not_found|refresh token/.test(r)) return t.errors.sessionExpired
    if (/rate limit|too many requests|over_email_send_rate_limit|for security purposes, you can only request/.test(r)) return t.errors.tooMany
    if (/seat_limit|seat limit/.test(r)) return t.errors.seatLimit
    if (/permission denied|not allowed|forbidden|not authorized|unauthorized/.test(r)) return t.errors.notAllowed
    if (/payload too large|file too large|too large|413/.test(r)) return t.errors.tooLarge
    return null
}

/// The line to show for `e`. `fallback` is the caller's own translated
/// message for this action (defaults to "Something went wrong").
export function userError(e: unknown, t: Dict, fallback?: string): string {
    const raw = rawText(e).trim()
    if (raw) console.error("[userError]", raw)
    const known = knownError(raw, t)
    if (known) return known
    const safe = fallback ?? t.errors.generic
    if (!raw || DB_SMELL.test(raw) || /^request failed \(\d+\)$/i.test(raw)) return safe
    // Unrecognized server text is usually English: only English readers see
    // it, unless it is already Spanish (a few functions answer in the
    // caller's language).
    if (t === dictionaries.en) return raw
    return looksSpanish(raw) ? raw : safe
}
