import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { supabaseAs, SUPABASE_URL } from "./auth"
import { decodeBytea, formatTranscript, minutesBetween, parseJsonOrBase64, safeSearch } from "./data"
import { rollUpGuardrails } from "@/lib/guardrails"
import { SALES_STAGES } from "@/lib/salesStages"
import { GROUP_ORDER, GROUP_SLOTS, MAX_TEMPLATE_CHARS, TEMPLATE_TOKENS, isSingleLine, type TemplateGroup, type TemplateSlot } from "@/lib/templateSlots"

/// TalkPilot MCP (D-538) — the tools Claude / ChatGPT see.
///
/// Rules every tool follows:
///  * Runs as the signed-in user (their JWT, RLS). Nothing here widens access:
///    a manager reads a rep's call only where the Command Center already lets
///    them (manages_user + the org's visibility tier).
///  * Pro or Teams only. A free account can connect, but every tool answers
///    with how to upgrade instead of data.
///  * Every call is written to mcp_access_log. A read of someone else's call
///    records them as the subject, so the rep can see it happened.
///  * Output is for a model, so it is plain JSON in English field names. The
///    model answers the person in their own language.

type Ctx = { http?: { authInfo?: { token: string; clientId: string; extra?: Record<string, unknown> } } }

type Who = { sb: SupabaseClient; token: string; userId: string; email: string | null; clientId: string }

type Membership = { org_id: string; role: "owner" | "admin" | "manager" | "member"; team_id: string | null }

const PRO_URL = "https://talkpilot.co/pricing"

function who(ctx: Ctx): Who | null {
    const a = ctx.http?.authInfo
    const userId = a?.extra?.userId
    if (!a?.token || typeof userId !== "string") return null
    const email = typeof a.extra?.email === "string" ? a.extra.email : null
    return { sb: supabaseAs(a.token), token: a.token, userId, email, clientId: a.clientId }
}

/// D-803: the most common setup failure is a connector signed in with the
/// wrong account (a personal email, not the one in the workspace). Say which
/// account it is and how to switch, instead of a bare "not in a workspace".
function noWorkspace(w: Who): string {
    const as = w.email ? `as ${w.email}` : "with an account"
    return `You are signed in to TalkPilot ${as}, which is not part of a TalkPilot Teams workspace. ` +
        "If the team's workspace uses another email, disconnect the TalkPilot connector in this AI app and connect it again, signing in with that email. " +
        "To create a workspace: https://teams.talkpilot.co/start"
}

function ok(data: unknown) {
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] }
}

function fail(message: string) {
    return { content: [{ type: "text" as const, text: message }], isError: true }
}

async function isPro(w: Who): Promise<boolean> {
    const { data } = await w.sb.from("user_profiles")
        .select("tier, pro_source, pro_expires_at").eq("id", w.userId).maybeSingle()
    if (!data || data.tier !== "pro") return false
    if (data.pro_source === "stripe" || !data.pro_expires_at) return true
    // Same 3-day grace the apps give a store renewal that is still landing.
    return new Date(data.pro_expires_at).getTime() + 3 * 86400_000 > Date.now()
}

async function membership(w: Who): Promise<Membership | null> {
    const { data } = await w.sb.from("org_members")
        .select("org_id, role, team_id").eq("user_id", w.userId).eq("status", "active").maybeSingle()
    return (data as Membership | null) ?? null
}

async function log(w: Who, tool: string, extra: { subject?: string | null; org?: string | null; target?: string | null } = {}) {
    try {
        await w.sb.from("mcp_access_log").insert({
            user_id: w.userId, client_id: w.clientId, tool,
            subject_user_id: extra.subject && extra.subject !== w.userId ? extra.subject : null,
            org_id: extra.org ?? null, target_id: extra.target ?? null,
        })
    } catch { /* logging must never break the answer */ }
}

/// D-800: an org write made from Claude / ChatGPT also lands in the workspace
/// audit log, so the Command Center shows who changed the playbook and that it
/// came through an AI app. RLS lets owners/admins append rows as themselves.
async function audit(w: Who, org: string, action: string, target: string | null, meta: Record<string, unknown> = {}) {
    try {
        await w.sb.from("org_audit_log").insert({
            org_id: org, actor_id: w.userId, action, target,
            meta: { ...meta, via: "mcp", client_id: w.clientId },
        })
    } catch { /* same as log(): never break the answer */ }
}

/// Calls a Supabase edge function as the user (their JWT), the way the
/// Command Center does from the browser.
async function callFunction(w: Who, name: string, body: unknown): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${w.token}`, "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
        body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({})) as Record<string, unknown>
    return { ok: res.ok, status: res.status, json }
}

function errorText(json: Record<string, unknown>, fallback: string): string {
    const e = json.error as { message?: string } | string | undefined
    return (typeof e === "string" ? e : e?.message) ?? fallback
}

const STAGE_ENUM = z.enum(SALES_STAGES)

/// The two titles the company profile doc can carry; a second run finds and
/// replaces whichever one exists instead of adding a copy.
const COMPANY_PROFILE_TITLES = { en: "Company profile", es: "Perfil de la empresa" } as const

/// D-824: what each template slot is, in the model's words.
const SLOT_PURPOSE: Record<string, string> = {
    "crm.call_log": "The note logged on the contact in HubSpot or Salesforce after the call.",
    "crm.task_name": "The title of a CRM task made from a follow-up.",
    "crm.task": "The notes under that CRM task.",
    "tasks.task_name": "The title of a task in Monday, Asana, Jira or ClickUp.",
    "tasks.task": "The notes under that task.",
    "email.email_subject": "The subject of the follow-up email to the person on the call.",
    "email.email_body": "The body of that follow-up email.",
    "slack.recap": "The recap posted to a Slack channel after the call.",
    "slack.task": "A Slack message about one follow-up.",
}

const TOKEN_HELP: Record<string, string> = {
    contact_name: "the person they spoke with",
    company: "that person's company",
    takeaway: "a short summary of what was discussed and decided",
    action_items: "the next steps, one per line",
    deal_name: "the CRM deal's name",
    deal_stage: "the CRM deal's stage",
    call_date: "the date of the call",
    call_title: "the meeting's title",
    call_duration: "how long the call took",
    user_name: "the rep's own name",
}

const NOT_SIGNED_IN = "Not signed in to TalkPilot. Reconnect the TalkPilot connector."
const NEEDS_PRO = `Using TalkPilot inside Claude or ChatGPT is part of TalkPilot Pro and TalkPilot Teams. This account is on the free plan. Upgrade in the TalkPilot app or at ${PRO_URL}, then try again.`

/// Wraps a tool body with the sign-in + Pro gate and the access log.
function guarded<A>(tool: string, body: (w: Who, args: A) => Promise<ReturnType<typeof ok> | ReturnType<typeof fail>>) {
    return async (args: A, ctx: Ctx) => {
        const w = who(ctx)
        if (!w) return fail(NOT_SIGNED_IN)
        if (!(await isPro(w))) return fail(NEEDS_PRO)
        try {
            return await body(w, args)
        } catch (e) {
            return fail(`TalkPilot error: ${e instanceof Error ? e.message : String(e)}`)
        }
    }
}

const READ = { readOnlyHint: true, openWorldHint: false }
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false }

const CALL_LIST_COLUMNS = "id, label, generated_title, generated_takeaway, topics, start_time, end_time, activation_trigger, org_id"

function callSummaryRow(r: Record<string, unknown>) {
    return {
        call_id: r.id,
        title: (r.generated_title as string) || (r.label as string) || "Untitled conversation",
        started_at: r.start_time,
        minutes: minutesBetween(r.start_time as string, r.end_time as string),
        summary: r.generated_takeaway ?? null,
        topics: r.topics ?? [],
        practice: r.activation_trigger === "practice",
    }
}

export function registerTalkPilotTools(server: McpServer) {
    // ── Your conversations ────────────────────────────────────────────────

    server.registerTool("list_conversations", {
        title: "List my TalkPilot conversations",
        description: "List the user's recorded TalkPilot conversations (calls, meetings, interviews), newest first, with a one-line summary each. Use `search` to find calls about a person, company or topic (matches titles, summaries, notes and the Deep Dive analysis). Practice sessions are left out unless include_practice is true. Use get_conversation for the full transcript and analysis.",
        inputSchema: z.object({
            search: z.string().optional().describe("Words to look for, e.g. a person, company or topic"),
            since: z.string().optional().describe("ISO date; only calls on or after this"),
            until: z.string().optional().describe("ISO date; only calls before this"),
            include_practice: z.boolean().optional(),
            limit: z.number().int().min(1).max(50).optional().describe("Default 15"),
        }),
        annotations: READ,
    }, guarded("list_conversations", async (w, a: { search?: string; since?: string; until?: string; include_practice?: boolean; limit?: number }) => {
        let q = w.sb.from("plus_conversations").select(CALL_LIST_COLUMNS)
            .eq("user_id", w.userId).order("start_time", { ascending: false }).limit(a.limit ?? 15)
        if (!a.include_practice) q = q.or("activation_trigger.is.null,activation_trigger.neq.practice")
        if (a.since) q = q.gte("start_time", a.since)
        if (a.until) q = q.lt("start_time", a.until)
        const s = a.search ? safeSearch(a.search) : ""
        if (s) {
            const p = `*${s}*`
            q = q.or(`label.ilike.${p},generated_title.ilike.${p},generated_takeaway.ilike.${p},brief_notes.ilike.${p},generated_analysis.ilike.${p}`)
        }
        const { data, error } = await q
        if (error) return fail(error.message)
        await log(w, "list_conversations")
        return ok({ conversations: (data ?? []).map(callSummaryRow) })
    }))

    server.registerTool("get_conversation", {
        title: "Get one TalkPilot conversation",
        description: "Get one of the user's conversations: summary, the Deep Dive analysis, the user's notes, action items, practice result, and the full transcript (\"You\" is the user, \"Them\" is the other side). Use this to write follow-ups, recaps, CRM notes, or to answer questions about what was said.",
        inputSchema: z.object({
            call_id: z.string().uuid(),
            include_transcript: z.boolean().optional().describe("Default true"),
            max_transcript_chars: z.number().int().min(1000).max(200000).optional().describe("Default 60000"),
        }),
        annotations: READ,
    }, guarded("get_conversation", async (w, a: { call_id: string; include_transcript?: boolean; max_transcript_chars?: number }) => {
        const { data: r, error } = await w.sb.from("plus_conversations")
            .select("id, user_id, label, generated_title, generated_takeaway, generated_analysis, brief_notes, practice_result, objective_scores, topics, start_time, end_time, activation_trigger, org_id, transcript_json, action_items_json")
            .eq("id", a.call_id).maybeSingle()
        if (error) return fail(error.message)
        if (!r) return fail("No conversation with that id that this account can see.")
        const { data: items } = await w.sb.from("action_items")
            .select("id, title, description, status, due_at").eq("conversation_id", a.call_id)
        const legacyItems = (items ?? []).length === 0 ? decodeBytea(r.action_items_json) : null
        const out: Record<string, unknown> = {
            ...callSummaryRow(r),
            deep_dive: r.generated_analysis ?? null,
            notes: r.brief_notes ?? null,
            action_items: (items ?? []).length ? items : (Array.isArray(legacyItems) ? legacyItems : []),
            practice_result: r.practice_result ?? null,
            objective_scores: r.objective_scores ?? null,
        }
        if (a.include_transcript !== false) {
            const t = formatTranscript(decodeBytea(r.transcript_json), a.max_transcript_chars ?? 60000)
            out.transcript = t.text || null
            out.transcript_truncated = t.truncated
        }
        await log(w, "get_conversation", { subject: r.user_id as string, org: r.org_id as string | null, target: a.call_id })
        return ok(out)
    }))

    server.registerTool("prepare_for_call", {
        title: "Prepare for an upcoming call",
        description: "Gather everything TalkPilot knows before a call with a person or company: past conversations that mention them (with summaries), open action items from those calls, what the user's Memory says about that person or company (and the user's own notes on them), and, for TalkPilot Teams members, the team's active playbooks and most common objections. Use it to write a prep brief.",
        inputSchema: z.object({
            who_or_what: z.string().min(2).describe("Person, company or topic of the upcoming call"),
        }),
        annotations: READ,
    }, guarded("prepare_for_call", async (w, a: { who_or_what: string }) => {
        const s = safeSearch(a.who_or_what)
        const p = `*${s}*`
        const { data: calls } = await w.sb.from("plus_conversations").select("id, label, generated_title, generated_takeaway, topics, start_time, end_time, activation_trigger, org_id, brief_notes")
            .eq("user_id", w.userId)
            .or(`label.ilike.${p},generated_title.ilike.${p},generated_takeaway.ilike.${p},brief_notes.ilike.${p},generated_analysis.ilike.${p}`)
            .order("start_time", { ascending: false }).limit(8)
        const ids = (calls ?? []).map(c => c.id as string)
        const { data: open } = ids.length
            ? await w.sb.from("action_items").select("id, title, description, status, due_at, conversation_id")
                .in("conversation_id", ids).in("status", ["pending", "approved", "failed"])
            : { data: [] }
        // D-823: what Memory knows about them (People and Companies). Missing
        // before the memory migration runs; then this is just empty.
        const [{ data: people }, { data: companies }] = await Promise.all([
            w.sb.from("memory_people").select("email, name, company_domain, about, notes")
                .or(`name.ilike.${p},email.ilike.${p},company_domain.ilike.${p}`).limit(5),
            w.sb.from("memory_companies").select("domain, name, about, notes")
                .or(`name.ilike.${p},domain.ilike.${p}`).limit(3),
        ])
        const m = await membership(w)
        let team: Record<string, unknown> | null = null
        if (m) {
            const { data: ctx } = await w.sb.rpc("get_org_context")
            if (ctx) {
                team = {
                    org: ctx.org_name,
                    playbooks: (ctx.playbooks ?? []).map((pb: Record<string, unknown>) => ({ name: pb.name, sales_stage: pb.sales_stage ?? null, call_type: pb.call_type, stages: pb.stages })),
                    top_objections: (ctx.objections ?? []).slice(0, 15).map((o: Record<string, unknown>) => ({ objection: o.objection, approved_responses: o.approved_responses })),
                }
            }
        }
        await log(w, "prepare_for_call", { org: m?.org_id })
        return ok({
            past_conversations: (calls ?? []).map(c => ({ ...callSummaryRow(c), notes: c.brief_notes ?? null })),
            open_action_items: open ?? [],
            memory: { people: people ?? [], companies: companies ?? [] },
            team,
            note: (calls ?? []).length === 0 ? "No past conversations matched. Try a shorter name or the company name." : undefined,
        })
    }))

    // ── Action items ──────────────────────────────────────────────────────

    server.registerTool("list_action_items", {
        title: "List my action items",
        description: "List the follow-ups TalkPilot pulled out of the user's calls. status: open (default), done, or all.",
        inputSchema: z.object({
            status: z.enum(["open", "done", "all"]).optional(),
            limit: z.number().int().min(1).max(100).optional().describe("Default 30"),
        }),
        annotations: READ,
    }, guarded("list_action_items", async (w, a: { status?: "open" | "done" | "all"; limit?: number }) => {
        let q = w.sb.from("action_items").select("id, title, description, status, due_at, priority, conversation_id, created_at, completed_at")
            .eq("user_id", w.userId).order("created_at", { ascending: false }).limit(a.limit ?? 30)
        const st = a.status ?? "open"
        if (st === "open") q = q.in("status", ["pending", "approved", "failed"])
        if (st === "done") q = q.eq("status", "completed")
        const { data, error } = await q
        if (error) return fail(error.message)
        await log(w, "list_action_items")
        return ok({ action_items: data ?? [] })
    }))

    server.registerTool("update_action_item", {
        title: "Update an action item",
        description: "Mark one of the user's action items done, reopen it, dismiss it, or change its title, description or due date.",
        inputSchema: z.object({
            id: z.string().uuid(),
            status: z.enum(["done", "open", "dismissed"]).optional(),
            title: z.string().min(1).max(300).optional(),
            description: z.string().max(4000).optional(),
            due_at: z.string().nullable().optional().describe("ISO date-time, or null to clear"),
        }),
        annotations: WRITE,
    }, guarded("update_action_item", async (w, a: { id: string; status?: "done" | "open" | "dismissed"; title?: string; description?: string; due_at?: string | null }) => {
        const now = new Date().toISOString()
        const patch: Record<string, unknown> = { updated_at: now }
        if (a.status === "done") { patch.status = "completed"; patch.completed_at = now }
        if (a.status === "open") { patch.status = "pending"; patch.completed_at = null }
        if (a.status === "dismissed") patch.status = "dismissed"
        if (a.title !== undefined) patch.title = a.title
        if (a.description !== undefined) patch.description = a.description
        if (a.due_at !== undefined) patch.due_at = a.due_at
        const { data, error } = await w.sb.from("action_items").update(patch)
            .eq("id", a.id).eq("user_id", w.userId).select("id, title, status, due_at").maybeSingle()
        if (error) return fail(error.message)
        if (!data) return fail("No action item with that id on this account.")
        await log(w, "update_action_item", { target: a.id })
        return ok({ updated: data })
    }))

    server.registerTool("add_action_item", {
        title: "Add an action item",
        description: "Add a follow-up to the user's TalkPilot action items, optionally tied to a conversation.",
        inputSchema: z.object({
            title: z.string().min(1).max(300),
            description: z.string().max(4000).optional(),
            due_at: z.string().optional().describe("ISO date-time"),
            call_id: z.string().uuid().optional(),
        }),
        annotations: WRITE,
    }, guarded("add_action_item", async (w, a: { title: string; description?: string; due_at?: string; call_id?: string }) => {
        const m = await membership(w)
        const { data, error } = await w.sb.from("action_items").insert({
            user_id: w.userId, org_id: m?.org_id ?? null, conversation_id: a.call_id ?? null,
            title: a.title, description: a.description ?? null, due_at: a.due_at ?? null, status: "pending",
        }).select("id, title, status, due_at").single()
        if (error) return fail(error.message)
        await log(w, "add_action_item", { target: data.id as string })
        return ok({ created: data })
    }))

    // ── Progress & context ────────────────────────────────────────────────

    server.registerTool("get_my_progress", {
        title: "Get my coaching progress",
        description: "The user's progress over time: call scores and growth areas (TalkPilot Teams scorecards), recent practice results, and how many calls they had. Use it for coaching questions like \"what should I work on?\".",
        inputSchema: z.object({
            days: z.number().int().min(7).max(365).optional().describe("Look-back window, default 30"),
        }),
        annotations: READ,
    }, guarded("get_my_progress", async (w, a: { days?: number }) => {
        const since = new Date(Date.now() - (a.days ?? 30) * 86400_000).toISOString()
        const [{ data: cards }, { data: calls }] = await Promise.all([
            w.sb.from("session_scorecards")
                .select("id, session_title, started_at, duration_minutes, overall_score, adherence_score, objection_score, accuracy_score, talk_ratio, highlights, growth_areas")
                .eq("user_id", w.userId).eq("status", "scored").is("excluded_at", null)
                .gte("started_at", since).order("started_at", { ascending: false }).limit(40),
            w.sb.from("plus_conversations").select("id, generated_title, label, start_time, end_time, activation_trigger, practice_result")
                .eq("user_id", w.userId).gte("start_time", since).order("start_time", { ascending: false }).limit(200),
        ])
        const all = calls ?? []
        const practice = all.filter(c => c.activation_trigger === "practice")
        const scores = (cards ?? []).map(c => c.overall_score).filter((n): n is number => typeof n === "number")
        await log(w, "get_my_progress")
        return ok({
            window_days: a.days ?? 30,
            calls: all.length - practice.length,
            practice_sessions: practice.length,
            average_score: scores.length ? Math.round(scores.reduce((s, n) => s + n, 0) / scores.length) : null,
            scorecards: cards ?? [],
            recent_practice: practice.slice(0, 15).map(p => ({
                call_id: p.id, title: p.generated_title || p.label, at: p.start_time, result: p.practice_result,
            })),
        })
    }))

    server.registerTool("get_my_context", {
        title: "Get what TalkPilot knows about me",
        description: "What the user told TalkPilot about themselves (role, company, notes the coach uses on every call) and, for TalkPilot Teams members, their team and role there.",
        inputSchema: z.object({}),
        annotations: READ,
    }, guarded("get_my_context", async (w) => {
        const { data: p } = await w.sb.from("user_profiles")
            .select("full_name, role_description, preferences").eq("id", w.userId).maybeSingle()
        const prefs = (p?.preferences ?? {}) as Record<string, string>
        const m = await membership(w)
        let org: Record<string, unknown> | null = null
        if (m) {
            const { data: ctx } = await w.sb.rpc("get_org_context")
            org = ctx ? { name: ctx.org_name, my_role: ctx.member_role, playbooks: (ctx.playbooks ?? []).map((x: Record<string, unknown>) => x.name) } : null
        }
        await log(w, "get_my_context", { org: m?.org_id })
        return ok({
            name: p?.full_name ?? null,
            about_me: prefs.mac_user_context || p?.role_description || null,
            company: prefs.company_description || null,
            coach_notes: prefs.mac_knowledge_base || null,
            focus_areas: prefs.mac_focus_areas || null,
            team: org,
        })
    }))

    server.registerTool("update_my_context", {
        title: "Update what TalkPilot knows about me",
        description: "Rewrite what the live coach knows about the user. Each field replaces the old text, so read get_my_context first and send the full new text. about_me: who they are and what their calls are for. company: what their company does. coach_notes: facts the coach should always have (prices, product details, names). Leave out a field to keep it. Draft it from what you already know about the user (your memory, past chats, their files) and show it to them before saving.",
        inputSchema: z.object({
            about_me: z.string().max(4000).optional(),
            company: z.string().max(4000).optional(),
            coach_notes: z.string().max(20000).optional(),
        }),
        annotations: WRITE,
    }, guarded("update_my_context", async (w, a: { about_me?: string; company?: string; coach_notes?: string }) => {
        const updates: Record<string, string> = {}
        if (a.about_me !== undefined) updates.mac_user_context = a.about_me
        if (a.company !== undefined) updates.company_description = a.company
        if (a.coach_notes !== undefined) updates.mac_knowledge_base = a.coach_notes
        if (Object.keys(updates).length === 0) return fail("Nothing to update.")
        const { error } = await w.sb.rpc("merge_user_preferences", { updates })
        if (error) return fail(error.message)
        // iPhone reads `role_description`; desktop reads mac_user_context.
        if (a.about_me !== undefined) {
            await w.sb.from("user_profiles").update({ role_description: a.about_me }).eq("id", w.userId)
        }
        await log(w, "update_my_context")
        return ok({ saved: Object.keys(a).filter(k => (a as Record<string, unknown>)[k] !== undefined), note: "The apps pick this up the next time they refresh the profile." })
    }))

    // ── TalkPilot Teams: managers and admins ─────────────────────────────

    async function requireTeams(w: Who, need: "manager" | "admin"): Promise<Membership | string> {
        const m = await membership(w)
        if (!m) return noWorkspace(w)
        const ok = need === "admin" ? ["owner", "admin"].includes(m.role) : ["owner", "admin", "manager"].includes(m.role)
        if (!ok) return need === "admin"
            ? `Only workspace owners and admins can change this, and ${w.email ?? "this account"} is a ${m.role}. Ask an admin.`
            : "Only managers and admins can see the team's calls."
        return m
    }

    server.registerTool("list_team_members", {
        title: "List my team (Teams)",
        description: "TalkPilot Teams managers and admins: the reps this person manages, with their call count and average score over the last 30 days.",
        inputSchema: z.object({}),
        annotations: READ,
    }, guarded("list_team_members", async (w) => {
        const m = await requireTeams(w, "manager")
        if (typeof m === "string") return fail(m)
        const { data: members, error } = await w.sb.rpc("get_org_members_with_email", { p_org: m.org_id })
        if (error) return fail(error.message)
        const active = (members ?? []).filter((x: { status: string; user_id: string }) => x.status === "active" && x.user_id !== w.userId)
        const managed = (await Promise.all(active.map(async (x: { user_id: string }) => {
            const { data } = await w.sb.rpc("manages_user", { p_org: m.org_id, p_user: x.user_id })
            return data ? x : null
        }))).filter(Boolean) as { user_id: string; email: string; full_name: string | null; role: string; team_id: string | null }[]
        const since = new Date(Date.now() - 30 * 86400_000).toISOString()
        const { data: cards } = await w.sb.from("session_scorecards").select("user_id, overall_score")
            .eq("org_id", m.org_id).eq("status", "scored").is("excluded_at", null).gte("started_at", since)
        await log(w, "list_team_members", { org: m.org_id })
        return ok({
            members: managed.map(x => {
                const mine = (cards ?? []).filter(c => c.user_id === x.user_id && typeof c.overall_score === "number")
                return {
                    member_id: x.user_id, name: x.full_name, email: x.email, role: x.role,
                    scored_calls_30d: mine.length,
                    average_score_30d: mine.length ? Math.round(mine.reduce((s, c) => s + (c.overall_score as number), 0) / mine.length) : null,
                }
            }),
        })
    }))

    server.registerTool("list_team_calls", {
        title: "List my team's calls (Teams)",
        description: "TalkPilot Teams managers and admins: scored calls from the reps they manage, newest first, with scores, highlights and growth areas. Filter by member_id from list_team_members. Use get_team_call for one call's transcript.",
        inputSchema: z.object({
            member_id: z.string().uuid().optional(),
            since: z.string().optional().describe("ISO date"),
            limit: z.number().int().min(1).max(50).optional().describe("Default 20"),
        }),
        annotations: READ,
    }, guarded("list_team_calls", async (w, a: { member_id?: string; since?: string; limit?: number }) => {
        const m = await requireTeams(w, "manager")
        if (typeof m === "string") return fail(m)
        let q = w.sb.from("session_scorecards")
            .select("id, user_id, session_title, started_at, duration_minutes, overall_score, adherence_score, objection_score, accuracy_score, talk_ratio, highlights, growth_areas")
            .eq("org_id", m.org_id).eq("status", "scored").is("excluded_at", null).neq("user_id", w.userId)
            .order("started_at", { ascending: false }).limit(a.limit ?? 20)
        if (a.member_id) q = q.eq("user_id", a.member_id)
        if (a.since) q = q.gte("started_at", a.since)
        const { data, error } = await q
        if (error) return fail(error.message)
        await log(w, "list_team_calls", { org: m.org_id, subject: a.member_id ?? null })
        return ok({ calls: (data ?? []).map(c => ({ team_call_id: c.id, member_id: c.user_id, ...c, id: undefined, user_id: undefined })) })
    }))

    server.registerTool("get_team_call", {
        title: "Get one of my team's calls (Teams)",
        description: "TalkPilot Teams managers and admins: one rep's call, with its scorecard, summary and transcript. The transcript and summary are only returned when the workspace's visibility setting allows full transcripts, the same rule as the Command Center. The rep can see that this call was opened.",
        inputSchema: z.object({
            team_call_id: z.string().uuid(),
            include_transcript: z.boolean().optional().describe("Default true"),
            max_transcript_chars: z.number().int().min(1000).max(200000).optional().describe("Default 60000"),
        }),
        annotations: READ,
    }, guarded("get_team_call", async (w, a: { team_call_id: string; include_transcript?: boolean; max_transcript_chars?: number }) => {
        const m = await requireTeams(w, "manager")
        if (typeof m === "string") return fail(m)
        const { data: card, error } = await w.sb.from("session_scorecards").select("*").eq("id", a.team_call_id).maybeSingle()
        if (error) return fail(error.message)
        if (!card) return fail("No team call with that id that this account can see.")
        const out: Record<string, unknown> = {
            team_call_id: card.id, member_id: card.user_id, title: card.session_title, started_at: card.started_at,
            minutes: card.duration_minutes, scores: {
                overall: card.overall_score, playbook: card.adherence_score, objections: card.objection_score, accuracy: card.accuracy_score,
            },
            talk_ratio: card.talk_ratio, highlights: card.highlights, growth_areas: card.growth_areas,
            playbook_detail: card.adherence, guardrail_breaches: card.guardrail_breaches,
        }
        if (card.session_source === "plus_conversations" && card.session_id) {
            const { data: conv } = await w.sb.from("plus_conversations")
                .select("generated_takeaway, generated_analysis").eq("id", card.session_id).maybeSingle()
            out.summary = conv?.generated_takeaway ?? null
            out.deep_dive = conv?.generated_analysis ?? null
        }
        if (a.include_transcript !== false) {
            const { data: raw } = await w.sb.rpc("get_scorecard_transcript", { p_scorecard_id: a.team_call_id })
            if (raw) {
                const t = formatTranscript(parseJsonOrBase64(raw as string), a.max_transcript_chars ?? 60000)
                out.transcript = t.text || null
                out.transcript_truncated = t.truncated
            } else {
                out.transcript = null
                out.transcript_note = "The workspace's visibility setting does not share transcripts with managers, or this call has none."
            }
        }
        await log(w, "get_team_call", { org: m.org_id, subject: card.user_id as string, target: a.team_call_id })
        return ok(out)
    }))

    server.registerTool("get_playbooks", {
        title: "Get the team playbooks (Teams)",
        description: "TalkPilot Teams: the workspace's playbooks, each with its sales stage (prospecting, discovery, demo, proposal, negotiation, close, onboarding, customer_success, renewal, or null), with their steps (talking points, required steps, exit criteria) and guardrails. Members see what is shared with them; admins see all, including drafts.",
        inputSchema: z.object({}),
        annotations: READ,
    }, guarded("get_playbooks", async (w) => {
        const m = await membership(w)
        if (!m) return fail(noWorkspace(w))
        const { data, error } = await w.sb.from("org_playbooks")
            .select("id, name, sales_stage, call_type, methodology, status, version, stages, guardrails, updated_at")
            .eq("org_id", m.org_id).order("updated_at", { ascending: false })
        if (error) return fail(error.message)
        await log(w, "get_playbooks", { org: m.org_id })
        return ok({ playbooks: data ?? [] })
    }))

    server.registerTool("update_playbook_stage", {
        title: "Edit a playbook step (Teams admins)",
        description: "TalkPilot Teams owners and admins: change one step of a playbook (the playbook's `stages` list; each item is a step). Each list you send replaces that list; leave a field out to keep it. Name the step by its key, its name or its number. Live playbooks change for reps on their next call.",
        inputSchema: z.object({
            playbook_id: z.string().uuid(),
            stage_key: z.string().min(1).describe("The step: its key, its name, or its number (1 = first) from get_setup_status or get_playbooks"),
            name: z.string().min(1).max(120).optional(),
            description: z.string().max(1000).optional().describe("What the rep does in this step"),
            talking_points: z.array(z.string().min(1).max(500)).max(30).optional(),
            required: z.array(z.string().min(1).max(300)).max(30).optional(),
            exit_criteria: z.string().max(500).optional(),
        }),
        annotations: WRITE,
    }, guarded("update_playbook_stage", async (w, a: { playbook_id: string; stage_key: string; name?: string; description?: string; talking_points?: string[]; required?: string[]; exit_criteria?: string }) => {
        const m = await requireTeams(w, "admin")
        if (typeof m === "string") return fail(m)
        const { data: pb, error } = await w.sb.from("org_playbooks").select("id, version, stages")
            .eq("id", a.playbook_id).eq("org_id", m.org_id).maybeSingle()
        if (error) return fail(error.message)
        if (!pb) return fail("No playbook with that id in this workspace.")
        const stages = Array.isArray(pb.stages) ? [...pb.stages] as Record<string, unknown>[] : []
        // D-803: older playbooks (templates, early editor) have steps with no
        // `key`, so a step can also be named by its name or its 1-based number.
        const want = a.stage_key.trim()
        let i = stages.findIndex(s => s.key === want)
        if (i < 0) i = stages.findIndex(s => typeof s.name === "string" && s.name.trim().toLowerCase() === want.toLowerCase())
        if (i < 0 && /^\d+$/.test(want) && Number(want) >= 1 && Number(want) <= stages.length) i = Number(want) - 1
        if (i < 0) return fail(`No step "${want}". Steps: ${stages.map((s, n) => `${n + 1}. ${s.name ?? s.key}`).join(", ")}`)
        // Only the named fields change; guardrail_rules and anything else on the
        // stage are kept as they are, so the guardrails rollup stays valid.
        const next = { ...stages[i] }
        if (a.name !== undefined) next.name = a.name
        if (a.description !== undefined) next.description = a.description
        if (a.talking_points !== undefined) next.talking_points = a.talking_points
        // `required_items` is the editor's older key (D-165); keep both in step.
        if (a.required !== undefined) { next.required = a.required; next.required_items = a.required }
        if (a.exit_criteria !== undefined) next.exit_criteria = a.exit_criteria
        stages[i] = next
        const { error: upErr } = await w.sb.from("org_playbooks")
            .update({ stages, version: (pb.version ?? 0) + 1, updated_at: new Date().toISOString() }).eq("id", pb.id)
        if (upErr) return fail(upErr.message)
        await log(w, "update_playbook_stage", { org: m.org_id, target: a.playbook_id })
        await audit(w, m.org_id, "playbook.step_edited", a.playbook_id, { step: a.stage_key })
        return ok({ updated_stage: next, version: (pb.version ?? 0) + 1 })
    }))

    server.registerTool("list_objections", {
        title: "List the team's objections (Teams)",
        description: "TalkPilot Teams: the objection library the live coach answers from, with approved responses and how often each came up.",
        inputSchema: z.object({ include_inactive: z.boolean().optional() }),
        annotations: READ,
    }, guarded("list_objections", async (w, a: { include_inactive?: boolean }) => {
        const m = await membership(w)
        if (!m) return fail(noWorkspace(w))
        let q = w.sb.from("org_objections")
            .select("id, objection, category, severity, variants, response_guidance, approved_responses, active, hit_count")
            .eq("org_id", m.org_id).order("hit_count", { ascending: false }).limit(300)
        if (!a.include_inactive) q = q.eq("active", true)
        const { data, error } = await q
        if (error) return fail(error.message)
        await log(w, "list_objections", { org: m.org_id })
        return ok({ objections: data ?? [] })
    }))

    // ── Objections: one or many (D-800 adds stages, category and the batch) ──

    const OBJECTION_SHAPE = {
        id: z.string().uuid().optional().describe("Leave out to add a new one"),
        objection: z.string().min(3).max(500),
        response: z.string().max(3000).optional().describe("The approved answer"),
        variants: z.array(z.string().min(2).max(300)).max(20).optional().describe("Other ways people say it"),
        category: z.string().max(60).optional().describe("Short tag, e.g. price, competitor, timing, trust"),
        sales_stages: z.array(STAGE_ENUM).max(9).optional().describe("Stages it applies to; empty or left out = every stage"),
        severity: z.enum(["normal", "critical"]).optional(),
        active: z.boolean().optional(),
    }
    type ObjectionIn = { id?: string; objection: string; response?: string; variants?: string[]; category?: string; sales_stages?: string[]; severity?: "normal" | "critical"; active?: boolean }

    /// Saves one objection and returns its id, or an error string. A new one
    /// whose text already exists in the workspace edits that row instead, so
    /// running the setup prompt twice does not double the library.
    async function saveObjectionRow(w: Who, org: string, a: ObjectionIn): Promise<{ id: string; created: boolean } | string> {
        const row: Record<string, unknown> = { objection: a.objection.trim(), updated_at: new Date().toISOString() }
        if (a.response !== undefined) {
            const t = a.response.trim()
            row.response_guidance = t || null
            row.approved_responses = t ? [{ text: t }] : []
        }
        if (a.variants !== undefined) row.variants = a.variants
        if (a.category !== undefined) row.category = a.category.trim() || null
        if (a.sales_stages !== undefined) row.sales_stages = Array.from(new Set(a.sales_stages))
        if (a.severity !== undefined) row.severity = a.severity
        if (a.active !== undefined) row.active = a.active
        let id = a.id
        if (!id) {
            const { data: same } = await w.sb.from("org_objections").select("id")
                .eq("org_id", org).ilike("objection", a.objection.trim().replace(/[\\%_]/g, "\\$&")).limit(1)
            id = (same?.[0]?.id as string | undefined) ?? undefined
        }
        if (id) {
            // The text may have changed, so the old embedding may no longer match it.
            row.embedding = null
            const { data, error } = await w.sb.from("org_objections").update(row)
                .eq("id", id).eq("org_id", org).select("id").maybeSingle()
            if (error) return error.message
            if (!data) return "No objection with that id in this workspace."
            return { id, created: false }
        }
        const { data, error } = await w.sb.from("org_objections").insert({
            org_id: org, severity: "normal", active: true, source: "mcp", variants: [], ...row,
        }).select("id").single()
        if (error) return error.message
        return { id: data.id as string, created: true }
    }

    /// Embed so they can be matched mid-call (same path the Command Center uses).
    async function embedObjections(w: Who, org: string, ids: string[]): Promise<boolean> {
        if (ids.length === 0) return true
        const r = await callFunction(w, "ingest-knowledge", { org_id: org, objection_ids: ids }).catch(() => null)
        return !!r?.ok
    }

    server.registerTool("save_objection", {
        title: "Add or edit an objection (Teams admins)",
        description: "TalkPilot Teams owners and admins: add an objection with the approved answer, or edit one (pass its id). Tie it to sales stages, or leave them out for every stage. The live coach starts using it on reps' next calls. For several at once use save_objections.",
        inputSchema: z.object(OBJECTION_SHAPE),
        annotations: WRITE,
    }, guarded("save_objection", async (w, a: ObjectionIn) => {
        const m = await requireTeams(w, "admin")
        if (typeof m === "string") return fail(m)
        const r = await saveObjectionRow(w, m.org_id, a)
        if (typeof r === "string") return fail(r)
        const embedded = await embedObjections(w, m.org_id, [r.id])
        await log(w, "save_objection", { org: m.org_id, target: r.id })
        await audit(w, m.org_id, r.created ? "objection.created" : "objection.updated", r.id)
        return ok({ saved_id: r.id, created: r.created, searchable_mid_call: embedded })
    }))

    server.registerTool("save_objections", {
        title: "Add or edit many objections (Teams admins)",
        description: "TalkPilot Teams owners and admins: save up to 30 objections in one call, each with the approved answer, other ways people say it, and the sales stages it applies to. One whose text already exists is updated, not duplicated. Read list_objections first.",
        inputSchema: z.object({ objections: z.array(z.object(OBJECTION_SHAPE)).min(1).max(30) }),
        annotations: WRITE,
    }, guarded("save_objections", async (w, a: { objections: ObjectionIn[] }) => {
        const m = await requireTeams(w, "admin")
        if (typeof m === "string") return fail(m)
        const saved: { objection: string; id: string; created: boolean }[] = []
        const failed: { objection: string; error: string }[] = []
        for (const o of a.objections) {
            const r = await saveObjectionRow(w, m.org_id, o)
            if (typeof r === "string") failed.push({ objection: o.objection, error: r })
            else saved.push({ objection: o.objection, ...r })
        }
        const embedded = await embedObjections(w, m.org_id, saved.map(s => s.id))
        await log(w, "save_objections", { org: m.org_id })
        if (saved.length) {
            await audit(w, m.org_id, "objection.batch_saved", null, {
                created: saved.filter(s => s.created).length, updated: saved.filter(s => !s.created).length,
            })
        }
        return ok({ saved, failed, searchable_mid_call: embedded })
    }))

    server.registerTool("list_knowledge", {
        title: "List the team knowledge base (Teams)",
        description: "TalkPilot Teams: documents in the workspace knowledge base that the live coach can quote (title, kind, summary, status).",
        inputSchema: z.object({}),
        annotations: READ,
    }, guarded("list_knowledge", async (w) => {
        const m = await membership(w)
        if (!m) return fail(noWorkspace(w))
        const { data, error } = await w.sb.from("org_knowledge")
            .select("id, title, kind, summary, status, updated_at").eq("org_id", m.org_id)
            .order("updated_at", { ascending: false }).limit(200)
        if (error) return fail(error.message)
        await log(w, "list_knowledge", { org: m.org_id })
        return ok({ documents: data ?? [] })
    }))

    const KIND_ENUM = z.enum(["doc", "pricing", "battlecard", "faq", "objection", "compliance", "case_study"])

    /// Adds one document, or re-indexes the live one with the same title (D-803),
    /// so running the setup prompt again updates "Precios" instead of adding a
    /// second copy the coach would quote from too.
    async function saveDocument(w: Who, org: string, d: { title: string; content: string; kind?: string; language?: "en" | "es" }):
        Promise<{ knowledge_id: string | null; replaced: boolean; chunks_indexed: unknown } | string> {
        const title = d.title.trim()
        const { data: same } = await w.sb.from("org_knowledge").select("id")
            .eq("org_id", org).ilike("title", title.replace(/[\\%_]/g, "\\$&")).neq("status", "archived")
            .order("updated_at", { ascending: false }).limit(1)
        const existing = (same?.[0]?.id as string | undefined) ?? null
        if (existing && d.kind) await w.sb.from("org_knowledge").update({ kind: d.kind }).eq("id", existing).eq("org_id", org)
        const r = existing
            ? await callFunction(w, "ingest-knowledge", { org_id: org, knowledge_id: existing, content: d.content, locale: d.language ?? "en" })
            : await callFunction(w, "ingest-knowledge", { org_id: org, title, kind: d.kind ?? "doc", content: d.content, locale: d.language ?? "en" })
        if (!r.ok || r.json.status === "failed") return errorText(r.json, String(r.status))
        return { knowledge_id: existing ?? (r.json.knowledge_id as string | undefined) ?? null, replaced: !!existing, chunks_indexed: r.json.chunk_count ?? null }
    }

    server.registerTool("add_knowledge", {
        title: "Add a document to the team knowledge base (Teams admins)",
        description: "TalkPilot Teams owners and admins: add a text document (pricing, product facts, case studies, policies, FAQ, battlecard) to the workspace knowledge base. It is split, indexed and summarized; the live coach can quote it on reps' next calls and the truth audit checks reps' claims against it. For files the user shared with you (PDF, Word, slides), send their full text. A live document with the same title is replaced in place, not duplicated. For several documents use add_documents; for the company overview use set_company_profile.",
        inputSchema: z.object({
            title: z.string().min(2).max(200),
            content: z.string().min(20).max(200000),
            kind: KIND_ENUM.optional().describe("Default doc"),
            language: z.enum(["en", "es"]).optional().describe("Language the summary is written in; default en"),
        }),
        annotations: WRITE,
    }, guarded("add_knowledge", async (w, a: { title: string; content: string; kind?: string; language?: "en" | "es" }) => {
        const m = await requireTeams(w, "admin")
        if (typeof m === "string") return fail(m)
        const r = await saveDocument(w, m.org_id, a)
        if (typeof r === "string") return fail(`Could not add it: ${r}`)
        await log(w, "add_knowledge", { org: m.org_id, target: r.knowledge_id })
        await audit(w, m.org_id, r.replaced ? "knowledge.replaced" : "knowledge.added", r.knowledge_id, { title: a.title })
        return ok(r)
    }))

    server.registerTool("add_documents", {
        title: "Add several documents to the knowledge base (Teams admins)",
        description: "TalkPilot Teams owners and admins: add up to 10 text documents in one call (pricing, product, security, integrations, battlecard, case studies). Same rules as add_knowledge: send the full text of each file, and a live document with the same title is replaced in place.",
        inputSchema: z.object({
            documents: z.array(z.object({
                title: z.string().min(2).max(200),
                content: z.string().min(20).max(100000),
                kind: KIND_ENUM.optional().describe("Default doc"),
            })).min(1).max(10),
            language: z.enum(["en", "es"]).optional().describe("Language the summaries are written in; default en"),
        }),
        annotations: WRITE,
    }, guarded("add_documents", async (w, a: { documents: { title: string; content: string; kind?: string }[]; language?: "en" | "es" }) => {
        const m = await requireTeams(w, "admin")
        if (typeof m === "string") return fail(m)
        const saved: Record<string, unknown>[] = []
        const failed: { title: string; error: string }[] = []
        for (const d of a.documents) {
            const r = await saveDocument(w, m.org_id, { ...d, language: a.language })
            if (typeof r === "string") failed.push({ title: d.title, error: r })
            else saved.push({ title: d.title, ...r })
        }
        await log(w, "add_documents", { org: m.org_id })
        if (saved.length) await audit(w, m.org_id, "knowledge.batch_added", null, { titles: saved.map(s => s.title) })
        return ok({ saved, failed })
    }))

    // ── Taking things out of use (D-803) ─────────────────────────────────

    server.registerTool("archive_items", {
        title: "Archive playbooks, documents or objections (Teams admins)",
        description: "TalkPilot Teams owners and admins: take old playbooks, knowledge documents or objections out of use, for example when the user wants to start over or something is out of date. Get ids from get_setup_status. Playbooks become archived (reps stop getting them on their next call), documents become archived (the coach stops quoting them), objections are turned off. Nothing is deleted. Set restore: true to undo: playbooks come back as drafts, documents come back, objections turn back on. Only do this after the user agreed to it.",
        inputSchema: z.object({
            playbook_ids: z.array(z.string().uuid()).max(50).optional(),
            document_ids: z.array(z.string().uuid()).max(50).optional(),
            objection_ids: z.array(z.string().uuid()).max(300).optional(),
            restore: z.boolean().optional().describe("Default false"),
        }),
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    }, guarded("archive_items", async (w, a: { playbook_ids?: string[]; document_ids?: string[]; objection_ids?: string[]; restore?: boolean }) => {
        const m = await requireTeams(w, "admin")
        if (typeof m === "string") return fail(m)
        const now = new Date().toISOString()
        const out: Record<string, unknown> = {}
        if (a.playbook_ids?.length) {
            // Restoring never makes a playbook live: it comes back as a draft (D-800).
            const { data, error } = await w.sb.from("org_playbooks")
                .update({ status: a.restore ? "draft" : "archived", updated_at: now })
                .eq("org_id", m.org_id).in("id", a.playbook_ids).select("id, name, status")
            if (error) return fail(`Playbooks: ${error.message}`)
            out.playbooks = data ?? []
        }
        if (a.document_ids?.length) {
            const { data, error } = await w.sb.from("org_knowledge")
                .update({ status: a.restore ? "ready" : "archived", updated_at: now })
                .eq("org_id", m.org_id).in("id", a.document_ids).select("id, title, status")
            if (error) return fail(`Documents: ${error.message}`)
            out.documents = data ?? []
        }
        if (a.objection_ids?.length) {
            const { data, error } = await w.sb.from("org_objections")
                .update({ active: !!a.restore, updated_at: now })
                .eq("org_id", m.org_id).in("id", a.objection_ids).select("id, objection, active")
            if (error) return fail(`Objections: ${error.message}`)
            out.objections = data ?? []
        }
        const asked = (a.playbook_ids?.length ?? 0) + (a.document_ids?.length ?? 0) + (a.objection_ids?.length ?? 0)
        if (asked === 0) return fail("Send at least one id in playbook_ids, document_ids or objection_ids.")
        const done = ["playbooks", "documents", "objections"].reduce((n, k) => n + ((out[k] as unknown[] | undefined)?.length ?? 0), 0)
        await log(w, "archive_items", { org: m.org_id })
        await audit(w, m.org_id, a.restore ? "setup.items_restored" : "setup.items_archived", null, {
            playbooks: a.playbook_ids?.length ?? 0, documents: a.document_ids?.length ?? 0, objections: a.objection_ids?.length ?? 0,
        })
        return ok({
            ...out,
            not_found: asked - done,
            note: done < asked ? "Some ids were not found in this workspace; they were skipped." : undefined,
        })
    }))

    // ── Workspace setup with AI (D-800) ──────────────────────────────────

    // ── Team wording templates (D-824) ──────────────────────────────────────
    // The same rows the Command Center's Templates page writes (org_templates,
    // D-770). Owners, admins and managers write (the table's RLS says so too);
    // any member reads. Every send uses the rep's own version, else the
    // team's, else the built-in wording, so nothing here locks a rep in.

    server.registerTool("get_templates", {
        title: "Get the team's message templates (Teams)",
        description: "TalkPilot Teams: the wording TalkPilot uses for what it sends after a call, per tool group and slot. Groups and slots: crm (call_log = the note logged in HubSpot/Salesforce, task_name, task) · tasks (task_name, task; Monday, Asana, Jira, ClickUp) · email (email_subject, email_body; the follow-up email) · slack (recap, task). A slot with no team text uses TalkPilot's built-in wording. Templates are plain text with {{token}} placeholders; the allowed tokens are listed in the answer.",
        inputSchema: z.object({}),
        annotations: READ,
    }, guarded("get_templates", async (w) => {
        const m = await membership(w)
        if (!m) return fail(noWorkspace(w))
        const { data, error } = await w.sb.from("org_templates")
            .select("tool_group, slot, template, updated_at").eq("org_id", m.org_id)
        if (error) return fail(`TalkPilot error: ${error.message}`)
        const rows = (data ?? []) as { tool_group: TemplateGroup; slot: TemplateSlot; template: string; updated_at: string }[]
        await log(w, "get_templates", { org: m.org_id })
        return ok({
            can_edit: ["owner", "admin", "manager"].includes(m.role),
            slots: GROUP_ORDER.flatMap(g => GROUP_SLOTS[g].map(slot => {
                const row = rows.find(r => r.tool_group === g && r.slot === slot)
                return {
                    tool_group: g, slot, what_it_is: SLOT_PURPOSE[`${g}.${slot}`], one_line: isSingleLine(slot),
                    team_template: row?.template ?? null, uses: row ? "team" : "built-in", updated_at: row?.updated_at ?? null,
                }
            })),
            tokens: TOKEN_HELP,
            rules: "Plain text only, no logic. Use only the tokens listed. task_name and email_subject are one line. Keep the team's own language, greeting, format and sign-off.",
        })
    }))

    server.registerTool("save_templates", {
        title: "Save the team's message templates (Teams leads)",
        description: "TalkPilot Teams owners, admins and managers: set how the team's CRM note, task, follow-up email and Slack messages look after a call. Best made from a real message the team already sends: keep its language, format and sign-off and swap the parts that change per call for tokens. Send several slots at once. An empty template puts that slot back to TalkPilot's built-in wording. Reps can still make their own version. Each saved slot comes back with a preview filled with sample values; show it to the user.",
        inputSchema: z.object({
            templates: z.array(z.object({
                tool_group: z.enum(["crm", "tasks", "email", "slack"]),
                slot: z.enum(["recap", "call_log", "task_name", "task", "email_subject", "email_body"]),
                template: z.string().max(MAX_TEMPLATE_CHARS).describe("Plain text with {{token}} placeholders. Empty = back to the built-in wording."),
            })).min(1).max(12),
        }),
        annotations: WRITE,
    }, guarded("save_templates", async (w, args: { templates: { tool_group: TemplateGroup; slot: TemplateSlot; template: string }[] }) => {
        const m = await membership(w)
        if (!m) return fail(noWorkspace(w))
        if (!["owner", "admin", "manager"].includes(m.role)) {
            return fail(`Only workspace owners, admins and managers can change the team's templates. This person's role is ${m.role}.`)
        }
        const results: Record<string, unknown>[] = []
        for (const t of args.templates) {
            const key = `${t.tool_group}.${t.slot}`
            if (!GROUP_SLOTS[t.tool_group].includes(t.slot)) {
                results.push({ slot: key, saved: false, error: `The ${t.tool_group} group has no ${t.slot} slot. Its slots: ${GROUP_SLOTS[t.tool_group].join(", ")}.` })
                continue
            }
            let text = t.template.replace(/\r\n/g, "\n").trim()
            if (isSingleLine(t.slot)) text = text.replace(/\s*\n\s*/g, " ")
            if (!text) {
                const { error } = await w.sb.from("org_templates").delete()
                    .eq("org_id", m.org_id).eq("tool_group", t.tool_group).eq("slot", t.slot)
                results.push(error ? { slot: key, saved: false, error: error.message } : { slot: key, saved: true, uses: "built-in" })
                if (!error) await audit(w, m.org_id, "template.reset", key)
                continue
            }
            const unknown = [...text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map(x => x[1])
                .filter(tok => !(TEMPLATE_TOKENS as readonly string[]).includes(tok))
            if (unknown.length) {
                results.push({ slot: key, saved: false, error: `Unknown token(s): ${[...new Set(unknown)].join(", ")}. Use only: ${TEMPLATE_TOKENS.join(", ")}.` })
                continue
            }
            const { error } = await w.sb.from("org_templates").upsert(
                { org_id: m.org_id, tool_group: t.tool_group, slot: t.slot, template: text, updated_by: w.userId },
                { onConflict: "org_id,tool_group,slot" })
            if (error) { results.push({ slot: key, saved: false, error: error.message }); continue }
            await audit(w, m.org_id, "template.save", key)
            const preview = await callFunction(w, "integrations-status", { action: "preview_template", key: t.slot, template: text })
            results.push({ slot: key, saved: true, uses: "team", preview: preview.ok ? preview.json.rendered ?? null : null })
        }
        await log(w, "save_templates", { org: m.org_id })
        return ok({ results, command_center: "https://teams.talkpilot.co/templates" })
    }))

    server.registerTool("get_setup_status", {
        title: "Get the workspace setup status (Teams)",
        description: "TalkPilot Teams: everything that is set up in the workspace and what is missing or inconsistent, so you can help the admin finish it. Call this first when the user asks you to set up TalkPilot. Returns the workspace, the user's role (only owners and admins can change setup), the sales stages turned on, every playbook (drafts too), every active objection and every document with their ids (use them to update, replace or archive), whether a company profile exists, team size, warnings about things that don't fit together, and the next steps.",
        inputSchema: z.object({}),
        annotations: READ,
    }, guarded("get_setup_status", async (w) => {
        const m = await membership(w)
        if (!m) return fail(noWorkspace(w))
        const [{ data: org }, { data: stages }, { data: playbooks }, { data: objectionRows }, { data: knowledge }, { data: members }, { count: invites }, { data: me }, { data: tmpl }] = await Promise.all([
            w.sb.from("organizations").select("name, settings").eq("id", m.org_id).maybeSingle(),
            w.sb.from("org_sales_stages").select("stage, enabled, tone").eq("org_id", m.org_id),
            w.sb.from("org_playbooks").select("id, name, sales_stage, status, methodology, stages, updated_at").eq("org_id", m.org_id).neq("status", "archived"),
            w.sb.from("org_objections").select("id, objection, category, severity, sales_stages, hit_count, updated_at")
                .eq("org_id", m.org_id).eq("active", true).order("hit_count", { ascending: false }).limit(300),
            w.sb.from("org_knowledge").select("id, title, kind, status, updated_at, created_at").eq("org_id", m.org_id).neq("status", "archived").limit(200),
            w.sb.rpc("get_org_members_with_email", { p_org: m.org_id }),
            w.sb.from("org_invites").select("id", { count: "exact", head: true }).eq("org_id", m.org_id)
                .is("accepted_at", null).is("revoked_at", null).gt("expires_at", new Date().toISOString()),
            w.sb.from("user_profiles").select("role_description, preferences").eq("id", w.userId).maybeSingle(),
            w.sb.from("org_templates").select("tool_group, slot").eq("org_id", m.org_id),
        ])
        const templatesSet = ((tmpl ?? []) as { tool_group: string; slot: string }[]).map(t => `${t.tool_group}.${t.slot}`)
        const myPrefs = ((me?.preferences ?? {}) as Record<string, string>)
        const aboutMe = (myPrefs.mac_user_context || me?.role_description || "").trim()
        const pbs = (playbooks ?? []) as { id: string; name: string; sales_stage: string | null; status: string; methodology: string | null; stages: unknown; updated_at: string | null }[]
        const docs = (knowledge ?? []) as { id: string; title: string; kind: string; status: string; updated_at: string | null; created_at: string | null }[]
        const objs = (objectionRows ?? []) as { id: string; objection: string; category: string | null; severity: string; sales_stages: string[] | null; hit_count: number | null; updated_at: string | null }[]
        const objections = objs.length
        const active = pbs.filter(p => p.status === "active").length
        const drafts = pbs.filter(p => p.status === "draft").length
        const on = ((stages ?? []) as { stage: string; enabled: boolean; tone: string | null }[]).filter(s => s.enabled)
        const onSet = new Set(on.map(s => s.stage))
        const titles = Object.values(COMPANY_PROFILE_TITLES) as string[]
        const hasProfile = docs.some(d => titles.includes(d.title))
        const activeMembers = ((members ?? []) as { status?: string }[]).filter(x => x.status === "active" || !x.status).length
        const isAdmin = ["owner", "admin"].includes(m.role)
        const settings = (org?.settings ?? {}) as Record<string, unknown>
        const profile = (settings.onboarding_profile ?? {}) as Record<string, unknown>

        // D-803: things that are each fine alone but don't fit together. The
        // Home checklist only counts rows, so a workspace can read "ready"
        // while its playbooks sit on stages nobody turned on.
        const warnings: string[] = []
        for (const p of pbs) {
            if (p.sales_stage && !onSet.has(p.sales_stage)) {
                warnings.push(`Playbook "${p.name}" (${p.status}) is for the ${p.sales_stage} stage, which is turned off. Turn the stage on with set_sales_stages, or archive the playbook.`)
            }
            if (!p.sales_stage && p.status === "active") {
                warnings.push(`Playbook "${p.name}" is active but has no sales stage, so the coach cannot tell when to use it.`)
            }
        }
        for (const s of on) {
            const forStage = pbs.filter(p => p.sales_stage === s.stage)
            if (forStage.length === 0) warnings.push(`The ${s.stage} stage is on but has no playbook.`)
            else if (!forStage.some(p => p.status === "active")) warnings.push(`The ${s.stage} stage only has draft playbooks; reps get nothing there until an admin turns one on in the Command Center.`)
            if (forStage.filter(p => p.status === "active").length > 1) warnings.push(`The ${s.stage} stage has ${forStage.filter(p => p.status === "active").length} active playbooks; reps pick one per call.`)
        }
        const STALE_DAYS = 30
        const stale = docs.filter(d => {
            const t = Date.parse(d.updated_at ?? d.created_at ?? "")
            return Number.isFinite(t) && Date.now() - t > STALE_DAYS * 86400_000 && !titles.includes(d.title)
        })
        if (stale.length) warnings.push(`${stale.length} document(s) were last updated more than ${STALE_DAYS} days ago (${stale.map(d => `"${d.title}"`).join(", ")}). Ask the user whether prices, dates and product facts in them are still true; replace them with add_knowledge (same title) or archive them.`)
        for (const d of docs.filter(d => d.status === "failed")) warnings.push(`Document "${d.title}" failed to index; the coach cannot use it. Add it again with add_knowledge.`)
        const seen = new Map<string, number>()
        for (const o of objs) {
            const k = o.objection.trim().toLowerCase().replace(/[¿?¡!."“”']/g, "")
            seen.set(k, (seen.get(k) ?? 0) + 1)
        }
        const dupes = [...seen.values()].filter(n => n > 1).length
        if (dupes) warnings.push(`${dupes} objection(s) appear more than once with nearly the same text. Keep one and archive the rest with archive_items.`)

        // Same "ready" bar as the Command Center's Home checklist (D-175).
        const next: string[] = []
        // D-804: the person running setup is usually a rep on calls too.
        if (aboutMe.length < 40) next.push("Fill in the user's own profile (who they are, their role, what their calls are for) from what you already know about them, and save it with update_my_context after they agree.")
        if (!hasProfile) next.push("Write a company profile with set_company_profile.")
        if (on.length === 0) next.push("Turn on the sales stages the team uses with set_sales_stages.")
        if (pbs.length === 0) next.push("Create a playbook for each stage the team uses with create_playbook (saved as drafts).")
        if (drafts > 0) next.push("The admin checks the draft playbooks and turns them on in the Command Center (Playbook page). You cannot do this.")
        if (objections < 3) next.push("Add the most common objections with their approved answers using save_objections (at least 3).")
        if (docs.filter(d => !titles.includes(d.title)).length === 0) next.push("Add documents the coach can quote (pricing, product facts, case studies) with add_documents or add_knowledge.")
        // D-824: what reaches the CRM and the client after every call.
        if (templatesSet.length === 0) next.push("Set the team's wording for what TalkPilot sends after a call (CRM note, follow-up email, Slack recap, tasks) with save_templates. Ask the user to paste one real example of each that the team already sends, and turn it into a template; if they have none, write one in their style. Show the previews.")
        if (activeMembers <= 1 && (invites ?? 0) === 0) next.push("The admin invites the team in the Command Center (Team page). You cannot do this.")
        if (warnings.length) next.push("Fix or show the user the warnings.")
        await log(w, "get_setup_status", { org: m.org_id })
        return ok({
            workspace: org?.name ?? null,
            signed_in_as: w.email,
            my_role: m.role,
            can_edit_setup: isAdmin,
            team_type: settings.vertical ?? null,
            website: profile.website ?? null,
            sales_stages_on: on.map(s => ({ stage: s.stage, tone: s.tone })),
            all_sales_stages: SALES_STAGES,
            playbooks: pbs.map(p => ({
                id: p.id, name: p.name, sales_stage: p.sales_stage, status: p.status, methodology: p.methodology,
                steps: Array.isArray(p.stages) ? (p.stages as { key?: string; name?: string }[]).map((s, n) => ({ number: n + 1, key: s.key ?? null, name: s.name })) : [],
                updated_at: p.updated_at,
            })),
            active_objections: objections,
            objections: objs.map(o => ({ id: o.id, objection: o.objection, category: o.category, severity: o.severity, sales_stages: o.sales_stages ?? [], times_heard: o.hit_count ?? 0 })),
            knowledge_documents: docs.map(d => ({ id: d.id, title: d.title, kind: d.kind, status: d.status, updated_at: d.updated_at ?? d.created_at })),
            has_company_profile: hasProfile,
            team_templates_set: templatesSet,
            my_profile_filled: aboutMe.length >= 40,
            members: activeMembers,
            pending_invites: invites ?? 0,
            ready: active >= 1 && objections >= 3 && docs.length >= 1,
            warnings,
            next_steps: next,
            tools_for_setup: ["get_setup_status", "get_my_context", "update_my_context", "set_company_profile", "read_website", "add_documents", "add_knowledge", "set_sales_stages", "create_playbook", "update_playbook_stage", "save_objections", "archive_items", "get_templates", "save_templates"],
            command_center: "https://teams.talkpilot.co",
            note: isAdmin ? undefined : "Only workspace owners and admins can change the setup. This person can read it.",
        })
    }))

    server.registerTool("create_playbook", {
        title: "Create a playbook (Teams admins)",
        description: "TalkPilot Teams owners and admins: create a playbook, the script the live coach follows on calls at one sales stage. It is saved as a DRAFT: reps do not get it until an admin turns it on in the Command Center. Give it its sales stage and 3 to 8 steps in call order; each step has a short name, what the rep does, the things the rep must cover, and phrases the rep must never say. Write it in the language the team uses on calls and set `language` to match. A playbook whose name already exists is refused, unless it is a draft and you send replace_draft: true.",
        inputSchema: z.object({
            name: z.string().min(2).max(120),
            sales_stage: STAGE_ENUM.nullable().optional().describe("The sales stage this playbook is for"),
            methodology: z.string().max(40).optional().describe("e.g. SPIN, MEDDIC, BANT, Sandler, Challenger; default custom"),
            language: z.enum(["en", "es"]).optional().describe("Language the reps speak on calls; default en"),
            steps: z.array(z.object({
                name: z.string().min(1).max(120).describe("Short, like: Ask what they need"),
                description: z.string().max(1000).optional().describe("What the rep does in this step"),
                must_cover: z.array(z.string().min(1).max(300)).max(15).optional().describe("Things the rep must cover before moving on"),
                never_say: z.array(z.string().min(2).max(120)).max(10).optional().describe("Exact phrases the rep must never say in this step"),
            })).min(1).max(15),
            replace_draft: z.boolean().optional().describe("If a DRAFT with this name exists, archive it and save this one instead. Default false"),
        }),
        annotations: WRITE,
    }, guarded("create_playbook", async (w, a: { name: string; sales_stage?: string | null; methodology?: string; language?: "en" | "es"; replace_draft?: boolean; steps: { name: string; description?: string; must_cover?: string[]; never_say?: string[] }[] }) => {
        const m = await requireTeams(w, "admin")
        if (typeof m === "string") return fail(m)
        const name = a.name.trim()
        const { data: existing } = await w.sb.from("org_playbooks").select("id, status")
            .eq("org_id", m.org_id).ilike("name", name.replace(/[\\%_]/g, "\\$&")).neq("status", "archived").limit(1)
        let replaced: string | null = null
        if (existing?.length) {
            // D-803: a re-run of the setup prompt rewrites its own draft instead
            // of failing. A live playbook is never swapped out silently.
            if (a.replace_draft && existing[0].status === "draft") {
                const { error: arErr } = await w.sb.from("org_playbooks")
                    .update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", existing[0].id).eq("org_id", m.org_id)
                if (arErr) return fail(arErr.message)
                replaced = existing[0].id as string
            } else {
                return fail(`A playbook named "${name}" already exists (id ${existing[0].id}, ${existing[0].status}). ` +
                    (existing[0].status === "draft"
                        ? "Send replace_draft: true to rewrite it, edit one step with update_playbook_stage, or pick another name."
                        : "It is live for reps. Edit it with update_playbook_stage, archive it with archive_items if the user agreed, or pick another name."))
            }
        }
        // Same stored shape as the Command Center editor: `required` is what the
        // live coach reads, `required_items` keeps the editor's older key, the
        // per-step forbidden phrases roll up into the runtime `guardrails` (D-181).
        const used = new Set<string>()
        const stages = a.steps.map((s, i) => {
            let key = s.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `step_${i + 1}`
            if (used.has(key)) key = `${key}_${i + 1}`
            used.add(key)
            const required = (s.must_cover ?? []).map(x => x.trim()).filter(Boolean)
            return {
                key,
                name: s.name.trim(),
                description: (s.description ?? "").trim(),
                required,
                required_items: required,
                guardrail_rules: (s.never_say ?? []).map(x => x.trim()).filter(Boolean)
                    .map(keyword => ({ type: "forbidden_phrase", keyword, action: "warn" })),
            }
        })
        const { data, error } = await w.sb.from("org_playbooks").insert({
            org_id: m.org_id, name, methodology: a.methodology?.trim() || "custom",
            sales_stage: a.sales_stage ?? null, stages,
            guardrails: rollUpGuardrails(stages, a.language ?? "en"),
            status: "draft", version: 1,
        }).select("id, name, sales_stage, status").single()
        if (error) return fail(error.message)
        await log(w, "create_playbook", { org: m.org_id, target: data.id as string })
        await audit(w, m.org_id, "playbook.created", data.id as string, { name, sales_stage: a.sales_stage ?? null, status: "draft", replaced })
        let stageOff = false
        if (a.sales_stage) {
            const { data: st } = await w.sb.from("org_sales_stages").select("enabled")
                .eq("org_id", m.org_id).eq("stage", a.sales_stage).maybeSingle()
            stageOff = !st?.enabled
        }
        return ok({
            created: { ...data, steps: stages.map(s => ({ key: s.key, name: s.name })) },
            replaced_draft_id: replaced ?? undefined,
            warning: stageOff ? `The ${a.sales_stage} stage is turned off, so reps will not get this playbook. Turn it on with set_sales_stages.` : undefined,
            note: "Saved as a draft. Tell the user to open the Playbook page in the Command Center (https://teams.talkpilot.co/playbook), check it, and turn it on.",
        })
    }))

    server.registerTool("set_sales_stages", {
        title: "Turn sales stages on or off (Teams admins)",
        description: "TalkPilot Teams owners and admins: choose which of the nine fixed sales stages the team uses, and the tone the coach uses at each (e.g. \"warm and curious, ask more than you talk\"). Only the stages you send change. Stages: prospecting, discovery, demo, proposal, negotiation, close, onboarding, customer_success, renewal.",
        inputSchema: z.object({
            stages: z.array(z.object({
                stage: STAGE_ENUM,
                enabled: z.boolean().optional().describe("Default true"),
                tone: z.string().max(300).optional().describe("Tone for this stage; leave out to keep it"),
            })).min(1).max(9),
        }),
        annotations: WRITE,
    }, guarded("set_sales_stages", async (w, a: { stages: { stage: string; enabled?: boolean; tone?: string }[] }) => {
        const m = await requireTeams(w, "admin")
        if (typeof m === "string") return fail(m)
        const now = new Date().toISOString()
        for (const s of a.stages) {
            const row: Record<string, unknown> = { org_id: m.org_id, stage: s.stage, enabled: s.enabled ?? true, updated_at: now }
            if (s.tone !== undefined) row.tone = s.tone.trim() || null
            const { error } = await w.sb.from("org_sales_stages").upsert(row, { onConflict: "org_id,stage" })
            if (error) return fail(`${s.stage}: ${error.message}`)
        }
        await log(w, "set_sales_stages", { org: m.org_id })
        await audit(w, m.org_id, "sales_stages.updated", null, { stages: a.stages.map(s => `${s.stage}:${s.enabled ?? true ? "on" : "off"}`) })
        const { data } = await w.sb.from("org_sales_stages").select("stage, enabled, tone").eq("org_id", m.org_id)
        return ok({ sales_stages: data ?? [] })
    }))

    server.registerTool("set_company_profile", {
        title: "Write the company profile (Teams admins)",
        description: "TalkPilot Teams owners and admins: write the one-page company profile the live coach reads on every call: what the company sells, to whom, the problems it solves, how it differs from competitors, usual prices or deal size, and the words the team uses. Plain prose, in the language the team uses on calls. Running it again replaces the old profile instead of adding a copy.",
        inputSchema: z.object({
            content: z.string().min(100).max(30000),
            language: z.enum(["en", "es"]).optional().describe("Language of the text; sets the document's title. Default en"),
        }),
        annotations: WRITE,
    }, guarded("set_company_profile", async (w, a: { content: string; language?: "en" | "es" }) => {
        const m = await requireTeams(w, "admin")
        if (typeof m === "string") return fail(m)
        const { data: found } = await w.sb.from("org_knowledge").select("id")
            .eq("org_id", m.org_id).in("title", Object.values(COMPANY_PROFILE_TITLES)).neq("status", "archived")
            .order("updated_at", { ascending: false }).limit(1)
        const existing = (found?.[0]?.id as string | undefined) ?? null
        const r = existing
            ? await callFunction(w, "ingest-knowledge", { org_id: m.org_id, knowledge_id: existing, content: a.content, locale: a.language ?? "en" })
            : await callFunction(w, "ingest-knowledge", { org_id: m.org_id, title: COMPANY_PROFILE_TITLES[a.language ?? "en"], kind: "doc", content: a.content, locale: a.language ?? "en" })
        if (!r.ok || r.json.status === "failed") return fail(`Could not save it: ${errorText(r.json, String(r.status))}`)
        const id = existing ?? (r.json.knowledge_id as string | undefined) ?? null
        await log(w, "set_company_profile", { org: m.org_id, target: id })
        await audit(w, m.org_id, existing ? "company_profile.replaced" : "company_profile.created", id)
        return ok({ knowledge_id: id, replaced: !!existing, chunks_indexed: r.json.chunk_count ?? null })
    }))

    server.registerTool("read_website", {
        title: "Read the company website (Teams admins)",
        description: "TalkPilot Teams owners and admins: fetch one public page (usually the company's home page) and add its text to the knowledge base, so the coach knows the company. One page, text only.",
        inputSchema: z.object({
            url: z.string().min(4).max(500).describe("https://…"),
            language: z.enum(["en", "es"]).optional().describe("Language the summary is written in; default en"),
        }),
        annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    }, guarded("read_website", async (w, a: { url: string; language?: "en" | "es" }) => {
        const m = await requireTeams(w, "admin")
        if (typeof m === "string") return fail(m)
        const url = /^https?:\/\//i.test(a.url.trim()) ? a.url.trim() : `https://${a.url.trim()}`
        const r = await callFunction(w, "ingest-website", { org_id: m.org_id, url, locale: a.language ?? "en" })
        if (!r.ok) return fail(`Could not read it: ${errorText(r.json, String(r.status))}`)
        const id = (r.json.knowledge_id as string | undefined) ?? null
        await log(w, "read_website", { org: m.org_id, target: id })
        await audit(w, m.org_id, "knowledge.website_read", id, { url })
        return ok({ knowledge_id: id, chunks_indexed: r.json.chunk_count ?? null, characters: r.json.chars ?? null })
    }))
}
