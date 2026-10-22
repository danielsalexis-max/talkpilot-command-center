import type { Metadata } from "next"

// D-673: the page URL carries a short-lived ticket, so other sites only ever
// get the origin, never the path or query. Not "no-referrer": the Picker API
// key only accepts teams.talkpilot.co as referrer, and with none Google
// answers "The API developer key is invalid" (2026-10-22).
export const metadata: Metadata = {
    referrer: "strict-origin",
    robots: { index: false, follow: false },
}

export default function ConnectedFilesLayout({ children }: { children: React.ReactNode }) {
    return children
}
