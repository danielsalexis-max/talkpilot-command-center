import { redirect } from "next/navigation"

/// Insights folded into Home (D-175) — the accuracy, objection-pattern and
/// digest sections render there now. Redirect keeps old bookmarks working.
export default function InsightsRedirect() {
    redirect("/")
}
