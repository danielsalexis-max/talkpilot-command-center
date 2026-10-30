/// Template groups, slots and tokens (D-770), with no browser imports so the
/// MCP server (D-824) can use them too. teamTemplates.ts re-exports them.

export type TemplateGroup = "crm" | "tasks" | "email" | "slack"
export type TemplateSlot = "recap" | "call_log" | "task_name" | "task" | "email_subject" | "email_body"

export const GROUP_SLOTS: Record<TemplateGroup, TemplateSlot[]> = {
    crm:   ["call_log", "task_name", "task"],
    tasks: ["task_name", "task"],
    email: ["email_subject", "email_body"],
    slack: ["recap", "task"],
}

export const GROUP_ORDER: TemplateGroup[] = ["crm", "tasks", "email", "slack"]

export const TEMPLATE_TOKENS = [
    "contact_name", "company", "takeaway", "action_items", "deal_name",
    "deal_stage", "call_date", "call_title", "call_duration", "user_name",
] as const

export const MAX_TEMPLATE_CHARS = 8000

export function isSingleLine(slot: TemplateSlot): boolean {
    return slot === "task_name" || slot === "email_subject"
}
