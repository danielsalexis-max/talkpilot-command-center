"use client"

import { useState } from "react"
import { useLocale } from "@/i18n/LocaleProvider"

/// A contact-email link that works even where `mailto:` is a dead end.
///
/// On a machine with no default mail client configured — common on managed
/// Macs, and on Chrome profiles that never claimed the mailto handler —
/// clicking a plain `mailto:` anchor does nothing at all, silently. Every
/// "talk to us" path in the product used to be exactly that anchor, so for
/// those people the product had no contact affordance whatsoever.
///
/// The fix keeps the mailto (it still opens compose where a handler exists)
/// and ALSO copies the address on the same click, confirming inline — so the
/// click always visibly does something and the address is always obtainable.
export function EmailLink({ email, subject, className, children }: {
    email: string
    subject?: string
    className?: string
    children: React.ReactNode
}) {
    const t = useLocale().t
    const [copied, setCopied] = useState(false)
    const href = `mailto:${email}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`

    return (
        <a
            href={href}
            className={className}
            onClick={() => {
                navigator.clipboard?.writeText(email).catch(() => {})
                setCopied(true)
                setTimeout(() => setCopied(false), 2500)
            }}
        >
            {children}
            {copied && <span className="ml-1.5 font-normal text-[var(--color-muted)]">{t.common.emailCopied}</span>}
        </a>
    )
}
