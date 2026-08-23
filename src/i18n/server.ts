/// Server-side locale helpers (Next 15: cookies()/headers() are async).
/// Import only from server components — never from anything with "use client".

import { cookies, headers } from "next/headers"
import { getDict, resolveLocale, LOCALE_COOKIE, type Dict, type Locale } from "./index"

export async function getLocale(): Promise<Locale> {
    const [cookieStore, headerStore] = await Promise.all([cookies(), headers()])
    return resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value, headerStore.get("accept-language"))
}

/// Server-component translation helper: `const t = await getT()`.
export async function getT(): Promise<Dict> {
    return getDict(await getLocale())
}
