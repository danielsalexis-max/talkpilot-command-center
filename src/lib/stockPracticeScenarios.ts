// Mirrors Sources/TalkPilotCore/Models/PracticeScenario.swift's `stockLibrary`.
// The Command Center can't import Swift, so this is a small, deliberately
// duplicated slice (id/title/category/difficulty/objective) — just enough to
// let a manager pick a scenario to assign. The `id` is the only field that
// matters functionally: it's what the iOS app resolves back to the full
// scenario at run time. Keep ids in sync if the Swift library changes.

export interface StockScenario {
    id: string
    title: string
    category: string
    difficulty: "easy" | "medium" | "hard"
    durationMinutes: number
    objective: string
}

export const STOCK_PRACTICE_SCENARIOS: StockScenario[] = [
    { id: "skeptical-prospect", title: "Handle a skeptical prospect", category: "Sales & customer", difficulty: "medium", durationMinutes: 5,
        objective: "Earn enough trust in the next 5 minutes to get a follow-up demo on the calendar." },
    { id: "fire-underperformer", title: "Let go of an underperformer", category: "Difficult conversations", difficulty: "hard", durationMinutes: 5,
        objective: "Deliver the news clearly, kindly, and without rambling. Don't let it become a debate." },
    { id: "behavioral-interview", title: "Behavioral interview · STAR drill", category: "Interviews", difficulty: "medium", durationMinutes: 5,
        objective: "Land one strong STAR-format answer to each question. Avoid résumé summary; be specific and quantified." },
    { id: "salary-negotiation", title: "Negotiate a job offer", category: "Negotiation", difficulty: "medium", durationMinutes: 5,
        objective: "Anchor on a higher number than what's on the table without making it adversarial. Get to a yes — or at least a clear next step." },
    { id: "churn-save", title: "Save a customer who's cancelling", category: "Sales & customer", difficulty: "hard", durationMinutes: 5,
        objective: "Don't jump to discounts. Get to the real reason, own the failure, and earn a concrete next step short of cancellation." },
    { id: "hard-feedback-peer", title: "Give hard feedback to a peer", category: "Difficult conversations", difficulty: "medium", durationMinutes: 5,
        objective: "Name the behavior specifically without softening it into nothing — and without letting it turn into a debate about intentions." },
    { id: "ask-for-raise", title: "Ask your manager for a raise", category: "Negotiation", difficulty: "medium", durationMinutes: 5,
        objective: "Make a direct, numbered ask backed by evidence — and don't accept a vague 'let me see what I can do' as the outcome." },
    { id: "repair-after-fight", title: "Repair after a fight", category: "Personal & relationships", difficulty: "medium", durationMinutes: 5,
        objective: "Reconnect without re-litigating who was right. Validate first; explain second — and only if asked." },
    { id: "investor-pitch-qa", title: "Investor pitch · Q&A grilling", category: "Public speaking & pitch", difficulty: "hard", durationMinutes: 5,
        objective: "Answer hard questions directly — number first, story second. Never bluff; 'I don't know, here's how I'd find out' beats a hand-wave." },
]
