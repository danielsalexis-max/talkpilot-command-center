import { supabase } from "@/lib/supabase"
import { approvedResponsesFrom, embedObjections } from "@/lib/orgBrain"

/// Starter coaching kits for /start (D-163): one click gives a brand-new org
/// an active playbook + objection library, so the readiness gate passes and
/// reps get real coaching on their very first call. Everything here is
/// editable afterwards under Playbook.
///
/// Severity vocabulary is `normal` | `critical` ONLY — it mirrors the
/// org_objections_severity_check constraint. The original kit shipped
/// high/medium/low and the whole batch insert failed on the constraint,
/// which left new orgs with an active playbook and zero objections (D-171).

interface StarterStage {
    name: string
    description: string
    required_items: string[]
    guardrail_rules: Array<{ type: string; keyword: string; action: string }>
}

export interface StarterObjection {
    objection: string
    response_guidance: string
    severity: "normal" | "critical"
}

export interface StarterKit {
    key: string
    title: string
    tagline: string
    methodology: string
    team: "sales" | "support"
    stages: StarterStage[]
    objections: StarterObjection[]
}

const SALES_OBJECTIONS: StarterObjection[] = [
    { objection: "It's too expensive / above our budget", severity: "critical",
      response_guidance: "Don't discount on the first push. Reframe around payback: what does the problem cost them monthly? Trade any concession for a commitment (annual term, more seats, a reference)." },
    { objection: "We're already using a competitor", severity: "critical",
      response_guidance: "Ask what's working and what isn't before positioning. Differentiate on what only you do — don't disparage the incumbent, displace the gap." },
    { objection: "Let's revisit next quarter", severity: "normal",
      response_guidance: "Ask what changes next quarter. Quantify the cost of waiting in their numbers. Offer a smaller start now instead of a bigger start later." },
    { objection: "I need to check with my boss / the team", severity: "normal",
      response_guidance: "Great — offer to join that conversation. Ask what their recommendation will be and what the decision-maker will care about most." },
    { objection: "We don't have time to implement something new", severity: "normal",
      response_guidance: "Anchor on time-to-first-value, not total scope. Name exactly what their first week looks like and who does the work." },
    { objection: "Can you send me some information?", severity: "normal",
      response_guidance: "Often a soft no. Agree, then ask one more discovery question to find the real hesitation — and book the follow-up before hanging up." },
]

const SUPPORT_OBJECTIONS: StarterObjection[] = [
    { objection: "This is unacceptable — I'm going to cancel", severity: "critical",
      response_guidance: "Don't defend or discount first. Acknowledge the frustration, restate the impact in their words, and give one concrete next step with a time attached. Escalate to the account owner the same day." },
    { objection: "I want a refund or credit for this", severity: "critical",
      response_guidance: "Never promise on the call. Acknowledge, capture the ask precisely, and commit to a decision by a named time from the team that owns credits." },
    { objection: "Let me speak to your manager", severity: "normal",
      response_guidance: "Agree without friction and stay useful: offer to bring the manager the full context yourself, and confirm exactly what outcome they want the manager to hear." },
    { objection: "Your competitor handles this better", severity: "normal",
      response_guidance: "Ask what specifically works better — that's the real feature request. Log it, don't argue, and show the nearest thing that exists today." },
    { objection: "This bug has been open for weeks", severity: "normal",
      response_guidance: "Give the honest status; never re-explain their own ticket back to them. Name the owner, the current blocker, and the next update date — then actually send that update." },
    { objection: "I was promised this would be included", severity: "normal",
      response_guidance: "Don't relitigate the sale. Capture who promised what and when, apologize for the mismatch, and route it to the account owner for a same-week answer." },
]

export const STARTER_KITS: StarterKit[] = [
    {
        key: "discovery-led",
        title: "Discovery-led sales",
        tagline: "Consultative flow for SaaS and services — understand first, pitch second.",
        methodology: "custom",
        team: "sales",
        objections: SALES_OBJECTIONS,
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
        team: "sales",
        objections: SALES_OBJECTIONS,
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
    {
        key: "support-success",
        title: "Support & success calls",
        tagline: "De-escalate, resolve, and leave the relationship stronger than the ticket found it.",
        methodology: "custom",
        team: "support",
        objections: SUPPORT_OBJECTIONS,
        stages: [
            { name: "Acknowledge & frame", description: "Let them be fully heard before you fix anything.",
              required_items: ["Restate the issue in their words", "Confirm impact and urgency"], guardrail_rules: [] },
            { name: "Diagnose", description: "Get to the real problem, not just the reported one.",
              required_items: ["Reproduce or scope the issue", "What changed recently", "Who else is affected"], guardrail_rules: [] },
            { name: "Resolve or commit", description: "End with a fix — or a named owner and a date.",
              required_items: ["Fix applied or workaround offered", "Owner and timeline named"],
              guardrail_rules: [{ type: "forbidden_phrase", keyword: "refund", action: "warn" }] },
            { name: "Confirm & prevent", description: "Close the loop and stop the repeat.",
              required_items: ["Customer confirms resolution", "Preventive step or doc shared"], guardrail_rules: [] },
            { name: "Strengthen", description: "Turn a resolved issue into renewed trust.",
              required_items: ["Check broader satisfaction", "Flag expansion or risk signals to the account owner"], guardrail_rules: [] },
        ],
    },
]

/// Applies a kit: inserts the playbook and seeds the objection library.
/// A brand-new org gets it ACTIVE immediately; if an active playbook already
/// exists (the owner went back and picked a second kit), it lands as a DRAFT
/// so two playbooks are never active at once. Objections are deduplicated by
/// text so re-applying can't double the library. Returns an error or null.
export async function applyStarterKit(orgId: string, kit: StarterKit): Promise<string | null> {
    const { data: activeExisting } = await supabase.from("org_playbooks")
        .select("id").eq("org_id", orgId).eq("status", "active").limit(1)
    const status = (activeExisting?.length ?? 0) > 0 ? "draft" : "active"

    const { error: pbErr } = await supabase.from("org_playbooks").insert({
        org_id: orgId,
        name: kit.title,
        methodology: kit.methodology,
        stages: kit.stages,
        status,
        version: 1,
    })
    if (pbErr) return pbErr.message

    const { data: existing } = await supabase.from("org_objections")
        .select("objection").eq("org_id", orgId)
    const have = new Set((existing ?? []).map(r => (r.objection as string).toLowerCase()))
    const fresh = kit.objections.filter(o => !have.has(o.objection.toLowerCase()))

    if (fresh.length > 0) {
        const { data: inserted, error: objErr } = await supabase.from("org_objections").insert(
            fresh.map(o => ({
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
    }
    return null
}
