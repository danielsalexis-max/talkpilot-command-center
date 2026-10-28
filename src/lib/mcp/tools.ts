import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { supabaseAs, SUPABASE_URL } from "./auth"
import { decodeBytea, formatTranscript, minutesBetween, parseJsonOrBase64, safeSearch } from "./data"

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

type Who = { sb: SupabaseClient; token: string; userId: string; clientId: string }

type Membership = { org_id: string; role: "owner" | "admin" | "manager" | "member"; team_id: string | null }

const PRO_URL = "https://talkpilot.co/pricing"

function who(ctx: Ctx): Who | null {
    const a = ctx.http?.authInfo
    const userId = a?.extra?.userId
    if (!a?.token || typeof userId !== "string") return null
    return { sb: supabaseAs(a.token), token: a.token, userId, clientId: a.clientId }
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
        description: "Gather everything TalkPilot knows before a call with a person or company: past conversations that mention them (with summaries), open action items from those calls, and, for TalkPilot Teams members, the team's active playbooks and most common objections. Use it to write a prep brief.",
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
        description: "Rewrite what the live coach knows about the user. Each field replaces the old text, so read get_my_context first and send the full new text. about_me: who they are and what their calls are for. company: what their company does. coach_notes: facts the coach should always have (prices, product details, names). Leave out a field to keep it.",
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
        if (!m) return "This account is not part of a TalkPilot Teams workspace."
        const ok = need === "admin" ? ["owner", "admin"].includes(m.role) : ["owner", "admin", "manager"].includes(m.role)
        if (!ok) return need === "admin"
            ? "Only workspace owners and admins can change this. Ask an admin."
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
        if (!m) return fail("This account is not part of a TalkPilot Teams workspace.")
        const { data, error } = await w.sb.from("org_playbooks")
            .select("id, name, sales_stage, call_type, methodology, status, version, stages, guardrails, updated_at")
            .eq("org_id", m.org_id).order("updated_at", { ascending: false })
        if (error) return fail(error.message)
        await log(w, "get_playbooks", { org: m.org_id })
        return ok({ playbooks: data ?? [] })
    }))

    server.registerTool("update_playbook_stage", {
        title: "Edit a playbook stage (Teams admins)",
        description: "TalkPilot Teams owners and admins: change one stage of a playbook. Each list you send replaces that list; leave a field out to keep it. Get stage keys from get_playbooks. Live playbooks change for reps on their next call.",
        inputSchema: z.object({
            playbook_id: z.string().uuid(),
            stage_key: z.string().min(1),
            name: z.string().min(1).max(120).optional(),
            talking_points: z.array(z.string().min(1).max(500)).max(30).optional(),
            required: z.array(z.string().min(1).max(300)).max(30).optional(),
            exit_criteria: z.string().max(500).optional(),
        }),
        annotations: WRITE,
    }, guarded("update_playbook_stage", async (w, a: { playbook_id: string; stage_key: string; name?: string; talking_points?: string[]; required?: string[]; exit_criteria?: string }) => {
        const m = await requireTeams(w, "admin")
        if (typeof m === "string") return fail(m)
        const { data: pb, error } = await w.sb.from("org_playbooks").select("id, version, stages")
            .eq("id", a.playbook_id).eq("org_id", m.org_id).maybeSingle()
        if (error) return fail(error.message)
        if (!pb) return fail("No playbook with that id in this workspace.")
        const stages = Array.isArray(pb.stages) ? [...pb.stages] as Record<string, unknown>[] : []
        const i = stages.findIndex(s => s.key === a.stage_key)
        if (i < 0) return fail(`No stage "${a.stage_key}". Stages: ${stages.map(s => s.key).join(", ")}`)
        // Only the named fields change; guardrail_rules and anything else on the
        // stage are kept as they are, so the guardrails rollup stays valid.
        const next = { ...stages[i] }
        if (a.name !== undefined) next.name = a.name
        if (a.talking_points !== undefined) next.talking_points = a.talking_points
        if (a.required !== undefined) next.required = a.required
        if (a.exit_criteria !== undefined) next.exit_criteria = a.exit_criteria
        stages[i] = next
        const { error: upErr } = await w.sb.from("org_playbooks")
            .update({ stages, version: (pb.version ?? 0) + 1, updated_at: new Date().toISOString() }).eq("id", pb.id)
        if (upErr) return fail(upErr.message)
        await log(w, "update_playbook_stage", { org: m.org_id, target: a.playbook_id })
        return ok({ updated_stage: next, version: (pb.version ?? 0) + 1 })
    }))

    server.registerTool("list_objections", {
        title: "List the team's objections (Teams)",
        description: "TalkPilot Teams: the objection library the live coach answers from, with approved responses and how often each came up.",
        inputSchema: z.object({ include_inactive: z.boolean().optional() }),
        annotations: READ,
    }, guarded("list_objections", async (w, a: { include_inactive?: boolean }) => {
        const m = await membership(w)
        if (!m) return fail("This account is not part of a TalkPilot Teams workspace.")
        let q = w.sb.from("org_objections")
            .select("id, objection, category, severity, variants, response_guidance, approved_responses, active, hit_count")
            .eq("org_id", m.org_id).order("hit_count", { ascending: false }).limit(300)
        if (!a.include_inactive) q = q.eq("active", true)
        const { data, error } = await q
        if (error) return fail(error.message)
        await log(w, "list_objections", { org: m.org_id })
        return ok({ objections: data ?? [] })
    }))

    server.registerTool("save_objection", {
        title: "Add or edit an objection (Teams admins)",
        description: "TalkPilot Teams owners and admins: add an objection with the approved answer, or edit one (pass its id). The live coach starts using it on reps' next calls.",
        inputSchema: z.object({
            id: z.string().uuid().optional().describe("Leave out to add a new one"),
            objection: z.string().min(3).max(500),
            response: z.string().max(3000).optional().describe("The approved answer"),
            variants: z.array(z.string().min(2).max(300)).max(20).optional().describe("Other ways people say it"),
            severity: z.enum(["normal", "critical"]).optional(),
            active: z.boolean().optional(),
        }),
        annotations: WRITE,
    }, guarded("save_objection", async (w, a: { id?: string; objection: string; response?: string; variants?: string[]; severity?: "normal" | "critical"; active?: boolean }) => {
        const m = await requireTeams(w, "admin")
        if (typeof m === "string") return fail(m)
        const row: Record<string, unknown> = { objection: a.objection.trim(), updated_at: new Date().toISOString() }
        if (a.response !== undefined) {
            const t = a.response.trim()
            row.response_guidance = t || null
            row.approved_responses = t ? [{ text: t }] : []
        }
        if (a.variants !== undefined) row.variants = a.variants
        if (a.severity !== undefined) row.severity = a.severity
        if (a.active !== undefined) row.active = a.active
        let id = a.id
        if (id) {
            // The text changed, so the old embedding no longer matches it.
            row.embedding = null
            const { data, error } = await w.sb.from("org_objections").update(row)
                .eq("id", id).eq("org_id", m.org_id).select("id").maybeSingle()
            if (error) return fail(error.message)
            if (!data) return fail("No objection with that id in this workspace.")
        } else {
            const { data, error } = await w.sb.from("org_objections").insert({
                org_id: m.org_id, severity: "normal", active: true, source: "mcp", variants: [], ...row,
            }).select("id").single()
            if (error) return fail(error.message)
            id = data.id as string
        }
        // Embed so it can be matched mid-call (same path the Command Center uses).
                const res = await fetch(`${SUPABASE_URL}/functions/v1/ingest-knowledge`, {
            method: "POST",
            headers: { Authorization: `Bearer ${w.token}`, "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
            body: JSON.stringify({ org_id: m.org_id, objection_ids: [id] }),
        }).catch(() => null)
        await log(w, "save_objection", { org: m.org_id, target: id })
        return ok({ saved_id: id, searchable_mid_call: !!res?.ok })
    }))

    server.registerTool("list_knowledge", {
        title: "List the team knowledge base (Teams)",
        description: "TalkPilot Teams: documents in the workspace knowledge base that the live coach can quote (title, kind, summary, status).",
        inputSchema: z.object({}),
        annotations: READ,
    }, guarded("list_knowledge", async (w) => {
        const m = await membership(w)
        if (!m) return fail("This account is not part of a TalkPilot Teams workspace.")
        const { data, error } = await w.sb.from("org_knowledge")
            .select("id, title, kind, summary, status, updated_at").eq("org_id", m.org_id)
            .order("updated_at", { ascending: false }).limit(200)
        if (error) return fail(error.message)
        await log(w, "list_knowledge", { org: m.org_id })
        return ok({ documents: data ?? [] })
    }))

    server.registerTool("add_knowledge", {
        title: "Add to the team knowledge base (Teams admins)",
        description: "TalkPilot Teams owners and admins: add a text document (pricing, product facts, case studies, policies) to the workspace knowledge base. It is split, indexed and summarized, and the live coach can quote it on reps' next calls.",
        inputSchema: z.object({
            title: z.string().min(2).max(200),
            content: z.string().min(20).max(200000),
            kind: z.enum(["doc", "pricing", "battlecard", "faq", "objection", "compliance", "case_study"]).optional().describe("Default doc"),
        }),
        annotations: WRITE,
    }, guarded("add_knowledge", async (w, a: { title: string; content: string; kind?: string }) => {
        const m = await requireTeams(w, "admin")
        if (typeof m === "string") return fail(m)
                const res = await fetch(`${SUPABASE_URL}/functions/v1/ingest-knowledge`, {
            method: "POST",
            headers: { Authorization: `Bearer ${w.token}`, "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
            body: JSON.stringify({ org_id: m.org_id, title: a.title, kind: a.kind ?? "doc", content: a.content }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok || json?.status === "failed") {
            return fail(`Could not add it: ${json?.error?.message ?? json?.error ?? res.statusText}`)
        }
        await log(w, "add_knowledge", { org: m.org_id, target: json.knowledge_id ?? null })
        return ok({ knowledge_id: json.knowledge_id ?? null, chunks_indexed: json.chunk_count ?? null })
    }))
}
