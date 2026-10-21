import type { Metadata } from "next"

// D-673: the page URL carries a short-lived ticket. Never send it to Google's
// script host (or anyone else) in a Referer header, and keep it out of search.
export const metadata: Metadata = {
    referrer: "no-referrer",
    robots: { index: false, follow: false },
}

export default function ConnectedFilesLayout({ children }: { children: React.ReactNode }) {
    return children
}
