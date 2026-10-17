/// Google Ads conversion for self-serve Teams signups. talkpilot.co loads the
/// same AW tag, which stores the ad click in a _gcl_aw cookie on .talkpilot.co;
/// loading the tag here on /start lets the workspace-created conversion credit
/// that click. Production host only, and it never blocks onboarding.
const GOOGLE_ADS_ID = "AW-18470712301"
const WORKSPACE_CREATED = `${GOOGLE_ADS_ID}/tFOyCJHkwJ8dEO3nwudE`

type Gtag = (...args: unknown[]) => void
declare global {
    interface Window { dataLayer?: unknown[]; gtag?: Gtag }
}

const onProdHost = () =>
    typeof window !== "undefined" && window.location.hostname === "teams.talkpilot.co"

export function loadGoogleAdsTag() {
    if (!onProdHost() || window.gtag) return
    window.dataLayer = window.dataLayer || []
    window.gtag = function gtag() { window.dataLayer!.push(arguments) }
    window.gtag("js", new Date())
    window.gtag("config", GOOGLE_ADS_ID)
    const s = document.createElement("script")
    s.async = true
    s.src = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`
    document.head.appendChild(s)
}

export function trackWorkspaceCreated() {
    try {
        if (onProdHost()) window.gtag?.("event", "conversion", { send_to: WORKSPACE_CREATED, value: 1, currency: "USD" })
    } catch { /* analytics must never break onboarding */ }
}
