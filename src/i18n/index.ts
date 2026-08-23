/// Client-safe i18n core: locale type, cookie name, resolver, dictionaries.
/// (The server-only `getT()` lives in ./server.ts so importing this file from
/// client components never drags in next/headers.)

import { en, type Dict } from "./en"
import { es } from "./es"

export type { Dict }

export type Locale = "en" | "es"
export const LOCALES: Locale[] = ["en", "es"]
export const DEFAULT_LOCALE: Locale = "en"

/// Cookie the language switcher writes. The server layout reads it before
/// first paint so SSR and hydration agree on the language.
export const LOCALE_COOKIE = "tp_locale"

export const dictionaries: Record<Locale, Dict> = { en, es }

export function isLocale(v: unknown): v is Locale {
    return v === "en" || v === "es"
}

/// Resolution order: explicit cookie wins; else the Accept-Language header
/// (server) / navigator.language (client); else English.
export function resolveLocale(cookieValue?: string | null, acceptLanguage?: string | null): Locale {
    if (isLocale(cookieValue)) return cookieValue
    if (acceptLanguage) {
        // First language range that starts with "es" wins ("es", "es-419",
        // "es-MX", …) — quality factors are honored by order of appearance.
        for (const part of acceptLanguage.split(",")) {
            const tag = part.split(";")[0].trim().toLowerCase()
            if (tag === "es" || tag.startsWith("es-")) return "es"
            if (tag === "en" || tag.startsWith("en-")) return "en"
        }
    }
    return DEFAULT_LOCALE
}

export function getDict(locale: Locale): Dict {
    return dictionaries[locale]
}

/// Client-only escape hatch for non-React code (API helpers) that can't call
/// `useLocale()`. Reads the same cookie the switcher writes, so it always
/// agrees with what the user is looking at. On the server it falls back to the
/// default — server code should use `getLocale()` from ./server instead.
export function clientLocale(): Locale {
    if (typeof document === "undefined") return DEFAULT_LOCALE
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]*)`))
    return resolveLocale(match?.[1], typeof navigator === "undefined" ? null : navigator.language)
}

/// Dictionary for whatever the browser is currently showing.
export function clientDict(): Dict {
    return dictionaries[clientLocale()]
}

/// BCP-47 tag for Intl/date formatting.
export function intlLocale(locale: Locale): string {
    return locale === "es" ? "es-419" : "en-US"
}
