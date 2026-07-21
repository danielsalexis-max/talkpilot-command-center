import type { Metadata, Viewport } from "next"
import "./globals.css"
import AppShell from "@/components/AppShell"

// Server root layout: owns metadata (title, description, Open Graph, icons —
// icon.png / apple-icon.png / opengraph-image.png in this folder are picked up
// by Next automatically). All client chrome lives in <AppShell>.
export const metadata: Metadata = {
    metadataBase: new URL("https://teams.talkpilot.co"),
    title: {
        default: "TalkPilot Teams — Command Center",
        template: "%s · TalkPilot Teams",
    },
    description:
        "The command center for your team's conversations. Scorecards, coaching insights, playbooks, and Team DNA — powered by TalkPilot's real-time AI copilot.",
    applicationName: "TalkPilot Teams",
    openGraph: {
        title: "TalkPilot Teams — Command Center",
        description:
            "Scorecards, coaching insights, playbooks, and Team DNA for every conversation your team has.",
        url: "https://teams.talkpilot.co",
        siteName: "TalkPilot Teams",
        type: "website",
        locale: "en_US",
    },
    twitter: {
        card: "summary_large_image",
        title: "TalkPilot Teams — Command Center",
        description:
            "Scorecards, coaching insights, playbooks, and Team DNA for every conversation your team has.",
    },
    // Private admin surface — keep it out of search results (links still
    // unfurl with the OG card when shared).
    robots: { index: false, follow: false },
}

export const viewport: Viewport = {
    themeColor: "#4F46E5",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body>
                <AppShell>{children}</AppShell>
            </body>
        </html>
    )
}
