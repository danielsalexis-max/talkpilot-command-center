import { NextResponse, type NextRequest } from "next/server"

/// D-475: AppSumo activation lives on its own host, served by this same app —
/// talkpilot-appsumo.vercel.app today (no DNS needed); appsumo.talkpilot.co
/// is also accepted once its GoDaddy record exists. A separate host means a separate cookie jar, so a
/// buyer's sign-in there never leaves them signed in to the Teams Command
/// Center on teams.talkpilot.co (it did while the page lived at
/// teams.talkpilot.co/appsumo).
///
///  * <appsumo host>/            → <appsumo host>/appsumo, query kept (a redirect,
///    not a rewrite: AppShell keys its public/no-dashboard mode off the
///    browser pathname, and a rewrite left it at "/", showing the Teams nav)
///  * <appsumo host>/<anything>  → <appsumo host>/appsumo (no Command Center there)
///  * teams.talkpilot.co/appsumo… → the canonical appsumo host, query kept
const APPSUMO_HOST = "talkpilot-appsumo.vercel.app"   // canonical — the URL registered with AppSumo
const APPSUMO_HOSTS = new Set([APPSUMO_HOST, "appsumo.talkpilot.co"])

export function middleware(req: NextRequest) {
    const host = (req.headers.get("host") ?? "").toLowerCase()
    const { pathname, search } = req.nextUrl

    if (APPSUMO_HOSTS.has(host)) {
        if (pathname === "/appsumo") return NextResponse.next()
        const keep = pathname === "/" ? search : ""
        return NextResponse.redirect(new URL(`https://${host}/appsumo${keep}`))
    }

    if (host === "teams.talkpilot.co" && pathname.startsWith("/appsumo")) {
        return NextResponse.redirect(new URL(`https://${APPSUMO_HOST}/appsumo${search}`), 308)
    }

    return NextResponse.next()
}

export const config = {
    // Pages only — never static assets, images or Next internals.
    matcher: ["/((?!_next/|api/|.*\\.(?:png|jpg|jpeg|svg|ico|webp|txt|xml|json)$).*)"],
}
