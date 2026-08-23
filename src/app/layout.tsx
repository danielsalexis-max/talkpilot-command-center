import type { Metadata, Viewport } from "next"
import { Hanken_Grotesk, Inter, Azeret_Mono } from "next/font/google"
import "./globals.css"
import AppShell from "@/components/AppShell"
import { LocaleProvider } from "@/i18n/LocaleProvider"
import { getLocale, getT } from "@/i18n/server"

const display = Hanken_Grotesk({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display" })
const body    = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body" })
const mono    = Azeret_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" })

// Server root layout: owns metadata (title, description, Open Graph, icons —
// icon.png / apple-icon.png / opengraph-image.png in this folder are picked up
// by Next automatically). All client chrome lives in <AppShell>.
// Resolved per-request so a Spanish visitor's tab title and link unfurls are
// Spanish too (same cookie → Accept-Language → en order as the page itself).
export async function generateMetadata(): Promise<Metadata> {
    const t = await getT()
    return {
        metadataBase: new URL("https://teams.talkpilot.co"),
        title: {
            default: t.meta.title,
            template: t.meta.titleTemplate,
        },
        description: t.meta.description,
        applicationName: "TalkPilot Teams",
        openGraph: {
            title: t.meta.title,
            description: t.meta.ogDescription,
            url: "https://teams.talkpilot.co",
            siteName: "TalkPilot Teams",
            type: "website",
            locale: t.ogLocale,
        },
        twitter: {
            card: "summary_large_image",
            title: t.meta.title,
            description: t.meta.ogDescription,
        },
        // Private admin surface — keep it out of search results (links still
        // unfurl with the OG card when shared).
        robots: { index: false, follow: false },
    }
}

export const viewport: Viewport = {
    themeColor: "#0C9482",
}

// Resolve the saved appearance before first paint so the page never flashes
// the wrong skin. Mirrors src/lib/skin.ts (keep the two in sync).
const skinInit = `
try {
  var p = localStorage.getItem("tp-skin") || "system";
  var d = p === "dark" || (p === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.skin = d ? "dark" : "light";
} catch (e) { document.documentElement.dataset.skin = "light"; }
`

export default async function RootLayout({ children }: { children: React.ReactNode }) {
    // Locale: cookie (tp_locale) wins, else Accept-Language, else English.
    // Resolved server-side so SSR markup and hydration agree on the language.
    const locale = await getLocale()
    return (
        <html lang={locale} data-skin="light" suppressHydrationWarning className={`${display.variable} ${body.variable} ${mono.variable}`}>
            <body>
                <script dangerouslySetInnerHTML={{ __html: skinInit }} />
                <LocaleProvider initialLocale={locale}>
                    <AppShell>{children}</AppShell>
                </LocaleProvider>
            </body>
        </html>
    )
}
