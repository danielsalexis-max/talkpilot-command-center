"use client"

// The Review queue merged into Calls as its "Needs review" filter (D-615) —
// two pages over the same scorecards read as two products. This route stays
// only so old links and muscle memory keep working.

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import type { Route } from "next"

export default function CoachingRedirect() {
    const router = useRouter()
    useEffect(() => { router.replace("/calls?filter=review" as Route) }, [router])
    return null
}
