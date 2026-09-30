import type { Metadata } from "next"
import { getT } from "@/i18n/server"

// The AppSumo page is served on its own host (D-475), so its tab and link
// unfurl shouldn't say "TalkPilot Teams — Command Center".
export async function generateMetadata(): Promise<Metadata> {
    const t = await getT()
    return {
        title: { absolute: t.appsumo.tabTitle },
        applicationName: "TalkPilot",
        openGraph: {
            title: t.appsumo.tabTitle,
            description: t.appsumo.intro,
            url: "https://talkpilot-appsumo.vercel.app",
            siteName: "TalkPilot",
            type: "website",
            locale: t.ogLocale,
        },
        twitter: { card: "summary_large_image", title: t.appsumo.tabTitle, description: t.appsumo.intro },
    }
}

export default function AppSumoLayout({ children }: { children: React.ReactNode }) {
    return children
}
