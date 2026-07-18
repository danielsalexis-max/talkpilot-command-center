export function ScoreRing({ score, size = "md" }: { score: number | null; size?: "sm" | "md" | "lg" }) {
    const cls = score == null
        ? "bg-gray-100 text-gray-400"
        : score >= 80 ? "bg-emerald-100 text-emerald-700"
        : score >= 60 ? "bg-indigo-100 text-indigo-700"
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
            <span className="text-xs text-gray-500">{label}</span>
        </div>
    )
}

export function GradePill({ grade }: { grade: "excellent" | "adequate" | "off_script" | "missed" }) {
    const styles = {
        excellent:  "bg-emerald-50 text-emerald-700 border-emerald-200",
        adequate:   "bg-indigo-50 text-indigo-700 border-indigo-200",
        off_script: "bg-amber-50 text-amber-700 border-amber-200",
        missed:     "bg-red-50 text-red-700 border-red-200",
    }
    const labels = { excellent: "Excellent", adequate: "Adequate", off_script: "Off-script", missed: "Missed" }
    return (
        <span className={`text-xs px-2 py-0.5 rounded border ${styles[grade]}`}>
            {labels[grade]}
        </span>
    )
}

export function VerdictPill({ verdict }: { verdict: "verified" | "unverifiable" | "contradicts" }) {
    const styles = {
        verified:     "bg-emerald-50 text-emerald-700 border-emerald-200",
        unverifiable: "bg-gray-50 text-gray-500 border-gray-200",
        contradicts:  "bg-red-50 text-red-700 border-red-200",
    }
    const labels = { verified: "Verified", unverifiable: "Unverifiable", contradicts: "Contradicts" }
    return (
        <span className={`text-xs px-2 py-0.5 rounded border ${styles[verdict]}`}>
            {labels[verdict]}
        </span>
    )
}
