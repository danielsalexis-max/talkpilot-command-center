import type { Locale } from "@/i18n"

/// Canonical guardrail shapes (D-181).
///
/// A playbook row carries guardrails twice, on purpose:
///   • `stages[].guardrail_rules` — the AUTHORING shape
///     (`{type, keyword, action}`), scoped to the stage it was written under so
///     the Playbook editor and the starter kits can round-trip it. Nothing at
///     runtime reads it.
///   • top-level `guardrails` — the RUNTIME contract
///     (`[{rule, severity, keyword, action}]`). This is what every consumer
///     reads: the live-coach prompt block (`OrgContextService.buildOrgBlock`
///     on iOS/macOS, the same payload on Android), the on-device breach
///     detector (`HighValueDetector.checkGuardrails`), and the scorecard
///     grader (`score-session`).
///
/// Every writer must produce both, via `rollUpGuardrails`. Writing only the
/// stage-scoped shape is exactly the bug that left starter-kit orgs with no
/// working guardrails at all (D-181).

export interface StageGuardrailRule { type: string; keyword: string; action: string }

export interface RuntimeGuardrail {
    rule: string
    severity: "normal" | "critical"
    // The literal forbidden phrase, preserved verbatim so future matchers can
    // use it directly instead of re-extracting keywords from the sentence.
    // Today's clients read only `rule` and `severity` and ignore the rest.
    keyword: string
    action: string
}

/// The rule sentence is user-facing three times over — the model prompt, the
/// scorecard breach list, and the manager's dashboards — so it exists per
/// language (es-419 rule, D-177). Keep it minimal: `HighValueDetector`
/// keyword-matches every >3-letter non-stopword of this sentence against what
/// the rep says, so each extra word is a potential false trigger.
function ruleSentence(keyword: string, locale: Locale): string {
    switch (locale) {
        case "es": return `No digas "${keyword}"`
        default:   return `Never say "${keyword}"`
    }
}

export function severityFor(action: string | undefined): "normal" | "critical" {
    return action === "escalate" ? "critical" : "normal"
}

export function rollUpGuardrails(
    stages: Array<{ guardrail_rules?: StageGuardrailRule[] }>,
    locale: Locale,
): RuntimeGuardrail[] {
    return stages.flatMap(s => (s.guardrail_rules ?? [])
        .filter(g => g.keyword?.trim())
        .map(g => ({
            rule:     ruleSentence(g.keyword.trim(), locale),
            severity: severityFor(g.action),
            keyword:  g.keyword.trim(),
            action:   g.action ?? "warn",
        })))
}
