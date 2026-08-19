import type { Metadata, Viewport } from "next"
import { Hanken_Grotesk, Inter, Azeret_Mono } from "next/font/google"
import "./globals.css"
import AppShell from "@/components/AppShell"

const display = Hanken_Grotesk({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display" })
const body    = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body" })
const mono    = Azeret_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" })

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
    themeColor: "#0C9482",
}

// Resolve the saved appearance before first paint so the page never flashes
// the wrong skin. Mirrors src/lib/skin.ts (keep the two in sync).
const skinInit = `
try {
  var p = localStorage.getItem("tp-skin") || "light";
  var d = p === "dark" || (p === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.skin = d ? "dark" : "light";
} catch (e) { document.documentElement.dataset.skin = "light"; }
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" data-skin="light" suppressHydrationWarning className={`${display.variable} ${body.variable} ${mono.variable}`}>
            <body>
                <script dangerouslySetInnerHTML={{ __html: skinInit }} />
                <AppShell>{children}</AppShell>
            </body>
        </html>
    )
}
