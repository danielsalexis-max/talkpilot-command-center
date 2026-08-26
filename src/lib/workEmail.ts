/// Is this a consumer mailbox rather than a company one?
///
/// A TalkPilot Teams workspace hangs its invites, billing and audit trail off
/// the owner's address, so the account that owns one has to be reachable at the
/// company (D-171). `create-org` enforces that server-side and is the real
/// backstop; everything here exists so the person finds out *before* an account
/// is created for them rather than a screen later.
///
/// This list lived in two places — the /start wizard and the `create-org` edge
/// function — and the third copy was about to be the login page. Two of the
/// three are in this repo, so at least those two can share one list; the edge
/// function keeps its own copy because it runs in a different runtime, and its
/// job is to refuse regardless of what any client believes.
const PERSONAL_DOMAINS = new Set([
    "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com",
    "hotmail.co.uk", "outlook.com", "live.com", "msn.com", "icloud.com", "me.com",
    "mac.com", "aol.com", "proton.me", "protonmail.com", "pm.me", "gmx.com",
    "gmx.de", "mail.com", "yandex.com", "yandex.ru", "zoho.com", "web.de",
])

export function isPersonalEmail(email: string): boolean {
    const domain = email.trim().toLowerCase().split("@").pop() ?? ""
    return PERSONAL_DOMAINS.has(domain)
}
