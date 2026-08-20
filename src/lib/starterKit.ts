import { supabase } from "@/lib/supabase"
import { approvedResponsesFrom, embedObjections } from "@/lib/orgBrain"

/// Starter coaching kits for /start (D-163): one click gives a brand-new org
/// an active playbook + objection library, so the readiness gate passes and
/// reps get real coaching on their very first call. Everything here is
/// editable afterwards under Playbook.

interface StarterStage {
    name: string
    description: string
    required_items: string[]
    guardrail_rules: Array<{ type: string; keyword: string; action: string }>
}

export interface StarterKit {
    key: string
    title: string
    tagline: string
    methodology: string
    stages: StarterStage[]
}

export const STARTER_KITS: StarterKit[] = [
    {
        key: "discovery-led",
        title: "Discovery-led sales",
        tagline: "Consultative flow for SaaS and services — understand first, pitch second.",
        methodology: "custom",
        stages: [
            { name: "Open & rapport", description: "Set the agenda together and earn the next 25 minutes.",
              required_items: ["Confirm time available", "Agree on the agenda"], guardrail_rules: [] },
            { name: "Discovery", description: "Understand their world before showing yours.",
              required_items: ["Current process and tools", "Pain and its business cost", "Who owns the budget", "Decision timeline"], guardrail_rules: [] },
            { name: "Value framing", description: "Connect what you heard to what you do — their words, not your feature list.",
              required_items: ["Tie value to a stated pain", "Share a relevant customer story"], guardrail_rules: [] },
            { name: "Objections", description: "Welcome pushback — it means they're engaging.",
              required_items: ["Acknowledge before answering", "Confirm the objection is resolved"],
              guardrail_rules: [{ type: "forbidden_phrase", keyword: "guarantee", action: "warn" }] },
            { name: "Next steps", description: "Never end without a date on the calendar.",
              required_items: ["Concrete next step agreed", "Date and owner confirmed"], guardrail_rules: [] },
        ],
    },
    {
        key: "meddic-lite",
        title: "MEDDIC essentials",
        tagline: "Qualification-first flow for bigger deals and longer cycles.",
        methodology: "MEDDIC",
        stages: [
            { name: "Metrics", description: "Quantify the impact they're after.",
              required_items: ["A number the buyer cares about"], guardrail_rules: [] },
            { name: "Economic buyer", description: "Find who signs.",
              required_items: ["Identify the economic buyer", "Path to reach them"], guardrail_rules: [] },
            { name: "Decision criteria & process", description: "Learn how they'll decide before you sell.",
              required_items: ["Decision criteria named", "Process and timeline mapped"], guardrail_rules: [] },
            { name: "Identify pain", description: "No pain, no deal.",
              required_items: ["Primary pain stated in their words", "Cost of doing nothing"], guardrail_rules: [] },
            { name: "Champion & close", description: "Build your inside advocate and lock the next step.",
              required_items: ["Champion identified", "Next step with a date"],
              guardrail_rules: [{ type: "forbidden_phrase", keyword: "discount", action: "flag" }] },
        ],
    },
]

export const STARTER_OBJECTIONS: Array<{
    objection: string; response_guidance: string; severity: string
}> = [
    { objection: "It's too expensive / above our budget", severity: "critical",
      response_guidance: "Don't discount on the first push. Reframe around payback: what does the problem cost them monthly? Trade any concession for a commitment (annual term, more seats, a reference)." },
    { objection: "We're already using a competitor", severity: "high",
      response_guidance: "Ask what's working and what isn't before positioning. Differentiate on what only you do — don't disparage the incumbent, displace the gap." },
    { objection: "Let's revisit next quarter", severity: "high",
      response_guidance: "Ask what changes next quarter. Quantify the cost of waiting in their numbers. Offer a smaller start now instead of a bigger start later." },
    { objection: "I need to check with my boss / the team", severity: "medium",
      response_guidance: "Great — offer to join that conversation. Ask what their recommendation will be and what the decision-maker will care about most." },
    { objection: "We don't have time to implement something new", severity: "medium",
      response_guidance: "Anchor on time-to-first-value, not total scope. Name exactly what their first week looks like and who does the work." },
    { objection: "Can you send me some information?", severity: "low",
      response_guidance: "Often a soft no. Agree, then ask one more discovery question to find the real hesitation — and book the follow-up before hanging up." },
]

/// Applies a kit: inserts the playbook as ACTIVE (a brand-new org has no other
/// playbooks, so no deactivation pass is needed) and seeds the objection
/// library. Returns an error message or null.
export async function applyStarterKit(orgId: string, kit: StarterKit): Promise<string | null> {
    const { error: pbErr } = await supabase.from("org_playbooks").insert({
        org_id: orgId,
        name: kit.title,
        methodology: kit.methodology,
        stages: kit.stages,
        status: "active",
        version: 1,
    })
    if (pbErr) return pbErr.message

    const { data: inserted, error: objErr } = await supabase.from("org_objections").insert(
        STARTER_OBJECTIONS.map(o => ({
            org_id: orgId,
            objection: o.objection,
            response_guidance: o.response_guidance,
            // The live coach reads approved_responses; the admin UI edits
            // response_guidance. Write both or the objection matches and then
            // hands the rep nothing.
            approved_responses: approvedResponsesFrom(o.response_guidance),
            severity: o.severity,
            active: true,
            variants: null,
        }))
    ).select("id")
    if (objErr) return objErr.message

    // Embed them, or the whole starter library is invisible to objection-lookup
    // and the first call a new team makes coaches nothing. Non-fatal: the
    // Objections tab shows an un-indexed count and offers a re-index.
    await embedObjections(orgId, (inserted ?? []).map(r => r.id as string))
    return null
}
