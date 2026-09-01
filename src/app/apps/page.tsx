"use client"

import { useT } from "@/i18n/LocaleProvider"
import { GetTheApp } from "@/components/GetTheApp"

/// "Get the app" as a permanent destination (D-230).
///
/// Every role can reach this. An owner needs it on day one — they are usually
/// the first person in the workspace to take a real call — and everyone needs
/// it again later, on a new laptop or a second device. Before this, the only
/// download screen in the product was the one an invited rep saw once, on the
/// way through accept-invite, and never again.
///
/// Deliberately not entitlement-gated: installing the app is free, and the
/// billing gate in AppShell already decides what the app does once signed in.

export default function AppsPage() {
    const t = useT()
    return (
        <div className="max-w-lg mx-auto py-4">
            <GetTheApp
                title={t.getApp.pageTitle}
                sub={t.getApp.pageSub}
                footnote={t.getApp.pageCredentials}
            />
        </div>
    )
}
