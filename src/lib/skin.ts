// Appearance ("skin") handling: light / dark / system, persisted per browser.
// The resolved value lands on <html data-skin="…"> — globals.css keys every
// token off that attribute. layout.tsx runs an inline copy of this resolution
// pre-hydration so first paint never flashes the wrong theme.

export type SkinPref = "light" | "dark" | "system"

const KEY = "tp-skin"

export function getSkinPref(): SkinPref {
    if (typeof window === "undefined") return "light"
    try {
        const v = localStorage.getItem(KEY)
        if (v === "light" || v === "dark" || v === "system") return v
    } catch { /* private mode */ }
    // No stored choice → follow the OS. An explicit pick in Settings still wins.
    return "system"
}

export function applySkin(pref: SkinPref = getSkinPref()) {
    if (typeof document === "undefined") return
    const sysDark = typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-color-scheme: dark)").matches
    const dark = pref === "dark" || (pref === "system" && sysDark)
    document.documentElement.dataset.skin = dark ? "dark" : "light"
}

export function setSkinPref(pref: SkinPref) {
    try { localStorage.setItem(KEY, pref) } catch { /* private mode */ }
    applySkin(pref)
}

export function watchSystemSkin(): () => void {
    if (typeof window === "undefined" || !window.matchMedia) return () => {}
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => applySkin()
    mq.addEventListener?.("change", handler)
    return () => mq.removeEventListener?.("change", handler)
}
