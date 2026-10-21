/// B2B analytics for teams.talkpilot.co (D-636): the /start wizard and the
/// Command Center. Until this, the B2B half had no product analytics at all —
/// only the Google Ads conversion — so the Teams funnel stopped at the /teams
/// CTA click on talkpilot.co.
///
/// - **PostHog**, the SAME project as talkpilot.co. PostHog's cookie is
///   cross-subdomain by default, so the visitor who clicked the /teams CTA is
///   the same person who creates the workspace — one funnel, no stitching.
///   Every event here is `teams_*`, and the super properties `product: "teams"`
///   / `surface` keep it separable from B2C. Workspaces are a PostHog GROUP
///   (`organization`), so funnels can be read per company, not just per person.
/// - **Hotjar** (same site as talkpilot.co) for recordings/heatmaps of the
///   wizard and dashboard.
/// - **Meta pixel + LinkedIn Insight** on /start only — the ad platforms
///   need the conversion on the page where it happens (D-611 flagged that
///   pilot-first signups were invisible to Meta).
///
/// Production host only; preview deploys and localhost never send. Never
/// throws: analytics must not break onboarding. The e2e identity (D-613) is
/// opted out entirely; other @talkpilot.co accounts are tagged internal so
/// insights can filter them.

const POSTHOG_KEY = "phc_ym77qFstG4UKiZEWCB8nnfjFAuqNKVH8roh6C3o6issW"
const HOTJAR_ID = 6516956
const META_PIXEL_ID = "651514427512173"
const LINKEDIN_PARTNER_ID = "8892300"
const E2E_EMAIL = "e2e@talkpilot.co"

type Props = Record<string, unknown>
type PH = {
    capture: (e: string, p?: Props) => void
    identify: (id: string, p?: Props) => void
    group: (type: string, key: string, p?: Props) => void
    register: (p: Props) => void
    opt_out_capturing: () => void
    reset: () => void
    __loaded?: boolean
}
declare global {
    interface Window {
        posthog?: PH
        hj?: (...a: unknown[]) => void
        fbq?: (...a: unknown[]) => void
        lintrk?: (...a: unknown[]) => void
        _linkedin_data_partner_ids?: string[]
    }
}

const onProdHost = () =>
    typeof window !== "undefined" && window.location.hostname === "teams.talkpilot.co"

function addScript(src: string) {
    const s = document.createElement("script")
    s.async = true
    s.src = src
    document.head.appendChild(s)
}

let booted = false
let adPixelsBooted = false
// The signed-in user, so groupOrg() can add plan/org_id to Hotjar's identify
// once the workspace is known.
let hjUserId: string | null = null
// The e2e identity's workspaces are not leads; Meta must never optimize on them.
let adOptOut = false

/// PostHog + Hotjar, on every Command Center page.
export function initTeamsAnalytics() {
    if (booted || !onProdHost()) return
    // D-673: /connected/files carries a sign-in ticket in its URL. PostHog's
    // pageview and Hotjar's recording would both store it; that page runs
    // without analytics.
    if (window.location.pathname.startsWith("/connected/files")) return
    booted = true
    try {
        // Official PostHog loader stub, same as talkpilot.co's AnalyticsScripts.
        /* eslint-disable */
        // @ts-ignore
        !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload group identify setPersonProperties setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys onSessionId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
        /* eslint-enable */
        ;(window.posthog as unknown as { init: (k: string, o: Props) => void }).init(POSTHOG_KEY, {
            api_host: "https://us.i.posthog.com",
            defaults: "2025-05-24",
            capture_pageview: "history_change",
            capture_pageleave: true,
            // `surface` is read per event, not registered once: a super
            // property set at boot kept saying "onboarding" on every pageview
            // after /start's client-side navigation into the app.
            before_send: (e: { properties?: Props } | null) => {
                if (e) e.properties = { ...e.properties, surface: surfaceOf(window.location.pathname) }
                return e
            },
        })
        window.posthog?.register({ product: "teams" })
    } catch { /* never break the page */ }

    try {
        window.hj = window.hj || function (...a: unknown[]) {
            ((window.hj as unknown as { q?: unknown[] }).q ||= []).push(a)
        }
        ;(window as unknown as { _hjSettings: Props })._hjSettings = { hjid: HOTJAR_ID, hjsv: 6 }
        addScript(`https://static.hotjar.com/c/hotjar-${HOTJAR_ID}.js?sv=6`)
    } catch { /* never break the page */ }
}

/// Meta pixel + LinkedIn Insight — /start only (the ad-conversion page).
export function initAdPixels() {
    if (adPixelsBooted || !onProdHost()) return
    adPixelsBooted = true
    try {
        /* eslint-disable */
        // @ts-ignore
        !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
        /* eslint-enable */
        window.fbq?.("init", META_PIXEL_ID)
        window.fbq?.("track", "PageView")
    } catch { /* never break onboarding */ }
    try {
        window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || []
        window._linkedin_data_partner_ids.push(LINKEDIN_PARTNER_ID)
        addScript("https://snap.licdn.com/li.lms-analytics/insight.min.js")
    } catch { /* never break onboarding */ }
}

function surfaceOf(path: string): string {
    if (path.startsWith("/start")) return "onboarding"
    if (path.startsWith("/oauth")) return "mcp_consent"
    if (path === "/login") return "login"
    return "command_center"
}

/// A `teams_*` event. Pass the bare name ("workspace_created"); the prefix is
/// added here so nothing in the B2B app can emit an un-namespaced event.
export function track(event: string, props: Props = {}) {
    try {
        if (!onProdHost()) return
        // A page's mount effect runs before AppShell's, so /start's
        // start_viewed and checkout_completed fired before init and were
        // dropped. Booting here (idempotent) queues them on the stub instead.
        initTeamsAnalytics()
        window.posthog?.capture(`teams_${event}`, {
            surface: surfaceOf(window.location.pathname),
            ...props,
        })
    } catch { /* never break the page */ }
}

/// Tie the browser to the account. The e2e identity is opted out (its
/// workspaces live 5 minutes and would pollute every funnel); TalkPilot's own
/// addresses are tagged so insights can exclude them.
export function identifyTeamsUser(userId: string, email: string | null | undefined, props: Props = {}) {
    try {
        if (!onProdHost()) return
        initTeamsAnalytics()
        if (!window.posthog) return
        const e = (email ?? "").toLowerCase()
        if (e === E2E_EMAIL) { adOptOut = true; window.posthog.opt_out_capturing(); return }
        window.posthog.identify(userId, {
            email: e || undefined,
            is_internal: e.endsWith("@talkpilot.co"),
            b2b_user: true,
            ...props,
        })
        // Hotjar gets NO PII (no email, no name): the user id plus B2B tags.
        // plan/org_id are added by groupOrg() once the workspace is known.
        hjUserId = userId
        window.hj?.("identify", userId, { b2b: true })
    } catch { /* never break the page */ }
}

/// The workspace as a PostHog group — company-level funnels and properties.
export function groupOrg(orgId: string, props: Props = {}) {
    try {
        if (!onProdHost()) return
        initTeamsAnalytics()
        window.posthog?.group("organization", orgId, props)
        if (hjUserId) {
            window.hj?.("identify", hjUserId, {
                b2b: true,
                plan: typeof props.plan === "string" ? props.plan : "unknown",
                org_id: orgId,
            })
        }
    } catch { /* never break the page */ }
}

/// Hotjar sees a Next.js client-side navigation (and each /start wizard
/// screen, which shares one URL) only if told: without this every recording
/// and heatmap lumped the whole session onto the first page.
export function hjStateChange(url: string) {
    try {
        if (!onProdHost()) return
        window.hj?.("stateChange", url)
    } catch { /* never break the page */ }
}

/// Standard ad-platform conversion events (Meta: CompleteRegistration /
/// StartTrial / Lead; LinkedIn conversions are configured by URL in Campaign
/// Manager, so only Meta needs explicit calls).
export function trackAdConversion(name: "CompleteRegistration" | "StartTrial" | "Lead", props: Props = {}) {
    try {
        if (!onProdHost() || adOptOut) return
        window.fbq?.("track", name, props)
    } catch { /* never break onboarding */ }
}

/// On sign-out, so the next person on a shared machine isn't merged in.
export function resetTeamsAnalytics() {
    hjUserId = null
    try { if (onProdHost()) window.posthog?.reset() } catch { /* never break */ }
}
