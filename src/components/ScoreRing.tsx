"use client"

import { useT } from "@/i18n/LocaleProvider"

export function ScoreRing({ score, size = "md" }: { score: number | null; size?: "sm" | "md" | "lg" }) {
    const cls = score == null
        ? "bg-[var(--color-line-soft)] text-[var(--color-muted)]"
        : score >= 80 ? "bg-emerald-100 text-emerald-700"
        : score >= 60 ? "bg-teal-100 text-teal-700"
        : score >= 40 ? "bg-amber-100 text-amber-700"
        : "bg-red-100 text-red-700"

    const dim = size === "sm" ? "w-10 h-10 text-xs" : size === "lg" ? "w-16 h-16 text-lg" : "w-12 h-12 text-sm"

    return (
        <span className={`inline-flex items-center justify-center rounded-full font-semibold ${dim} ${cls}`}>
            {score ?? "—"}
        </span>
    )
}

export function ScoreBadge({ label, score }: { label: string; score: number | null }) {
    return (
        <div className="flex flex-col items-center gap-1">
            <ScoreRing score={score} />
            <span className="text-xs text-[var(--color-text-secondary)]">{label}</span>
        </div>
    )
}

export function GradePill({ grade }: { grade: "excellent" | "adequate" | "off_script" | "missed" }) {
    const t = useT()
    const styles = {
        excellent:  "bg-emerald-50 text-emerald-700 border-emerald-200",
        adequate:   "bg-teal-50 text-teal-700 border-teal-200",
        off_script: "bg-amber-50 text-amber-700 border-amber-200",
        missed:     "bg-red-50 text-red-700 border-red-200",
    }
    return (
        <span className={`text-xs px-2 py-0.5 rounded border ${styles[grade]}`}>
            {t.pills.grade[grade]}
        </span>
    )
}

export function VerdictPill({ verdict }: { verdict: "verified" | "unverifiable" | "contradicts" }) {
    const t = useT()
    const styles = {
        verified:     "bg-emerald-50 text-emerald-700 border-emerald-200",
        unverifiable: "bg-[var(--color-bg)] text-[var(--color-text-secondary)] border-[var(--color-border)]",
        contradicts:  "bg-red-50 text-red-700 border-red-200",
    }
    return (
        <span className={`text-xs px-2 py-0.5 rounded border ${styles[verdict]}`}>
            {t.pills.verdict[verdict]}
        </span>
    )
}
