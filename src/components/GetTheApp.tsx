"use client"

import { useEffect, useState } from "react"
import { useT } from "@/i18n/LocaleProvider"

/// One "get the app" surface, shared by every role (D-230).
///
/// This screen used to live inside the accept-invite page and nowhere else,
/// which meant the invited REP got platform detection and a direct .dmg, while
/// the OWNER — the person paying, and the one most likely to try the product
/// before rolling it out to the team — got a footnote link on the wizard that
/// pointed at the marketing site. Same component now serves the invited rep,
/// the owner finishing /start, and the permanent /apps page.
///
/// The surrounding copy is passed in because the framing genuinely differs
/// ("you're on the team" vs "install it on the device you take calls on"); the
/// platform list, the release lookup and the store links are the shared part.

const MAC_RELEASES_API  = "https://api.github.com/repos/danielsalexis-max/talkpilot-releases/releases/latest"
const MAC_RELEASES_PAGE = "https://github.com/danielsalexis-max/talkpilot-releases/releases/latest"
const IOS_APP_STORE     = "https://apps.apple.com/app/id6763953639"
// Android is live on Play since 2026-08-23, so Play is the install path.
// The signed APK on GitHub stays the SIDELOAD channel for Teams (a different
// signing key — an upload-key build will not install over a sideload), and is
// only offered when Play is not an option.
const ANDROID_PLAY_STORE = "https://play.google.com/store/apps/details?id=co.talkpilot.android"

export type Platform = "mac" | "ios" | "android" | "windows" | "other"

export function detectPlatform(): Platform {
    if (typeof navigator === "undefined") return "other"
    const ua = navigator.userAgent
    if (/iPhone|iPad|iPod/.test(ua)) return "ios"
    if (/Android/.test(ua)) return "android"
    if (/Macintosh/.test(ua)) return "mac"
    if (/Windows/.test(ua)) return "windows"
    return "other"
}

export function GetTheApp({ eyebrow, title, sub, footnote }: {
    eyebrow?: string
    title: string
    sub: string
    footnote?: string
}) {
    const t = useT()
    const [platform] = useState<Platform>(detectPlatform)
    const [macUrl, setMacUrl] = useState(MAC_RELEASES_PAGE)
    const [androidApk, setAndroidApk] = useState<string | null>(null)

    useEffect(() => {
        // Resolve the direct Mac download from the latest GitHub release, falling
        // back to the release page. The .apk is picked up too, but only as the
        // secondary sideload link under the Play Store row.
        fetch(MAC_RELEASES_API)
            .then(r => r.json())
            .then(rel => {
                const dmg = rel.assets?.find((a: { name: string }) => a.name.endsWith(".dmg"))
                if (dmg?.browser_download_url) setMacUrl(dmg.browser_download_url)
                const apk = rel.assets?.find((a: { name: string }) => a.name.endsWith(".apk"))
                if (apk?.browser_download_url) setAndroidApk(apk.browser_download_url)
            })
            .catch(() => {})
    }, [])

    const rows: { key: Platform; label: string; sub: string; href?: string; soon?: boolean; altHref?: string; altLabel?: string }[] = [
        { key: "mac",     label: "Mac",     sub: t.getApp.macSub, href: macUrl },
        { key: "ios",     label: "iPhone",  sub: t.getApp.iosSub, href: IOS_APP_STORE },
        { key: "android", label: "Android", sub: t.getApp.androidPlaySub, href: ANDROID_PLAY_STORE,
          altHref: androidApk ?? undefined, altLabel: t.getApp.androidApkLink },
        { key: "windows", label: "Windows", sub: t.getApp.comingSoon, soon: true },
    ]
    // Detected platform first
    rows.sort((a, b) => (a.key === platform ? -1 : 0) - (b.key === platform ? -1 : 0))

    const primary = rows[0].key === platform && !rows[0].soon ? rows[0] : null

    return (
        <div className="space-y-4">
            <div className="text-center space-y-1">
                {eyebrow && <p className="text-emerald-600 text-sm font-medium">{eyebrow}</p>}
                <h2 className="text-lg font-semibold text-[var(--color-text)]">{title}</h2>
                <p className="text-sm text-[var(--color-text-secondary)]">{sub}</p>
            </div>

            {primary && (
                <a href={primary.href} target="_blank" rel="noopener noreferrer"
                    className="block w-full py-3 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] text-[var(--btn-ink)] text-sm font-semibold rounded-xl transition-colors text-center">
                    {primary.key === "mac" ? t.getApp.downloadMac : t.getApp.getAppStore}
                </a>
            )}

            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl divide-y divide-[var(--color-border)] shadow-sm">
                {rows.map(r => (
                    <div key={r.key} className="flex items-center justify-between px-4 py-3">
                        <div>
                            <p className="text-sm font-medium text-[var(--color-text)]">{r.label}
                                {r.key === platform && <span className="ml-2 text-xs text-[var(--color-accent)]">{t.getApp.thisDevice}</span>}
                            </p>
                            <p className="text-xs text-[var(--color-text-secondary)]">{r.sub}</p>
                            {r.altHref && (
                                <a href={r.altHref} target="_blank" rel="noopener noreferrer"
                                    className="text-[11px] text-[var(--color-muted)] hover:text-[var(--color-text-secondary)] underline">
                                    {r.altLabel}
                                </a>
                            )}
                        </div>
                        {r.soon ? (
                            <span className="text-xs text-[var(--color-muted)] border border-[var(--color-border)] rounded-full px-2.5 py-1">{t.getApp.soon}</span>
                        ) : (
                            <a href={r.href} target="_blank" rel="noopener noreferrer"
                                className="text-xs font-medium text-[var(--color-accent)] border border-[var(--color-accent)] rounded-lg px-3 py-1.5 hover:bg-teal-50 transition-colors">
                                {r.key === "mac" ? t.getApp.download
                                 : r.key === "android" ? t.getApp.playStore
                                 : t.getApp.appStore}
                            </a>
                        )}
                    </div>
                ))}
            </div>

            {footnote && (
                <p className="text-xs text-[var(--color-muted)] text-center">{footnote}</p>
            )}
        </div>
    )
}
