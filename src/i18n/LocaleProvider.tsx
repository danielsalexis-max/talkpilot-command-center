"use client"

import { createContext, useCallback, useContext, useState } from "react"
import { dictionaries, DEFAULT_LOCALE, LOCALE_COOKIE, intlLocale, type Dict, type Locale } from "@/i18n"

interface LocaleContextValue {
    locale: Locale
    /// BCP-47 tag for toLocaleDateString / Intl formatting.
    intl: string
    t: Dict
    setLocale: (l: Locale) => void
}

const LocaleContext = createContext<LocaleContextValue>({
    locale: DEFAULT_LOCALE,
    intl: intlLocale(DEFAULT_LOCALE),
    t: dictionaries[DEFAULT_LOCALE],
    setLocale: () => {},
})

/// The server layout resolves the locale (cookie → Accept-Language → en) and
/// hands it down as `initialLocale`, so SSR and the first client render agree.
/// `setLocale` re-renders everything instantly and persists the cookie for the
/// next request.
export function LocaleProvider({ initialLocale, children }: { initialLocale: Locale; children: React.ReactNode }) {
    const [locale, setLocaleState] = useState<Locale>(initialLocale)

    const setLocale = useCallback((l: Locale) => {
        setLocaleState(l)
        document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`
        document.documentElement.lang = l
    }, [])

    return (
        <LocaleContext.Provider value={{ locale, intl: intlLocale(locale), t: dictionaries[locale], setLocale }}>
            {children}
        </LocaleContext.Provider>
    )
}

export function useLocale(): LocaleContextValue {
    return useContext(LocaleContext)
}

/// Shorthand used across pages/components: `const t = useT()`.
export function useT(): Dict {
    return useContext(LocaleContext).t
}
