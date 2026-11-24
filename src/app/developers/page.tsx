"use client"

/// /developers: public guide to the TalkPilot Teams API (D-1063). No sign-in
/// needed (AppShell lists it as public). The full machine-readable reference is
/// the OpenAPI file next to it.

import { useLocale } from "@/i18n/LocaleProvider"
import { apiDocsCopy, OPENAPI_URL, BASE, CURL_LIST, CURL_SCORE, SESSION_SAMPLE, VERIFY_NODE, EVENT_SAMPLE } from "@/lib/apiDocsCopy"

const H2 = "text-lg font-semibold text-[var(--color-text)] mt-10 mb-3 scroll-mt-6"
const P = "text-sm text-[var(--color-text-secondary)] leading-relaxed"
const PRE = "text-[11.5px] leading-relaxed font-mono bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 overflow-x-auto whitespace-pre"

function Rows({ rows }: { rows: [string, string][] }) {
    return (
        <dl className="divide-y divide-[var(--color-line-soft)] border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)]">
            {rows.map(([k, v]) => (
                <div key={k} className="grid sm:grid-cols-[180px_1fr] gap-1 sm:gap-4 px-4 py-2.5">
                    <dt className="text-xs font-semibold text-[var(--color-text)] font-mono sm:font-sans">{k}</dt>
                    <dd className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{v}</dd>
                </div>
            ))}
        </dl>
    )
}

export default function DevelopersPage() {
    const { locale } = useLocale()
    const c = apiDocsCopy(locale)
    const ids = ["start", "conventions", "endpoints", "session", "statuses", "webhooks", "errors", "changelog"]

    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
            <p className="text-xs font-semibold tracking-wide uppercase text-[var(--color-accent-deep)]">TalkPilot Teams · v1</p>
            <h1 className="text-3xl font-bold text-[var(--color-text)] mt-1">{c.title}</h1>
            <p className={P + " mt-2 max-w-2xl"}>{c.sub}</p>
            <div className="flex flex-wrap gap-3 mt-4">
                <a href={OPENAPI_URL} className="px-4 py-2 bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)] text-[var(--btn-ink)] text-sm font-medium rounded-lg">{c.openapi}</a>
            </div>

            <nav className="mt-8 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {c.toc.map((label, i) => (
                    <a key={ids[i]} href={`#${ids[i]}`} className="text-[var(--color-accent-deep)] hover:underline">{label}</a>
                ))}
            </nav>

            <h2 id="start" className={H2}>{c.toc[0]}</h2>
            <div className="space-y-2">{c.start.map((s, i) => <p key={i} className={P}>{s}</p>)}</div>
            <p className={P + " mt-3"}>{c.baseUrl}: <code className="font-mono text-xs break-all">{BASE}</code></p>
            <p className="text-xs font-semibold text-[var(--color-text)] mt-4 mb-1">{c.example}</p>
            <pre className={PRE}>{CURL_LIST}</pre>

            <h2 id="conventions" className={H2}>{c.toc[1]}</h2>
            <Rows rows={c.conv} />

            <h2 id="endpoints" className={H2}>{c.toc[2]}</h2>
            <div className="overflow-x-auto border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)]">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="text-left text-[var(--color-muted)] border-b border-[var(--color-border)]">
                            <th className="px-3 py-2 font-medium">{c.epMethod}</th>
                            <th className="px-3 py-2 font-medium">{c.epPath}</th>
                            <th className="px-3 py-2 font-medium">{c.epScope}</th>
                            <th className="px-3 py-2 font-medium">{c.epWhat}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-line-soft)]">
                        {c.endpoints.map(e => (
                            <tr key={e.method + e.path}>
                                <td className="px-3 py-2 font-mono whitespace-nowrap text-[var(--color-text)]">{e.method}</td>
                                <td className="px-3 py-2 font-mono text-[var(--color-text)]">{e.path}</td>
                                <td className="px-3 py-2 font-mono whitespace-nowrap text-[var(--color-text-secondary)]">{e.scope}</td>
                                <td className="px-3 py-2 text-[var(--color-text-secondary)]">{e.what}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="text-xs font-semibold text-[var(--color-text)] mt-4 mb-1">{c.example}</p>
            <pre className={PRE}>{CURL_SCORE}</pre>

            <h2 id="session" className={H2}>{c.toc[3]}</h2>
            <p className={P}>{c.sessionIntro}</p>
            <pre className={PRE + " mt-3"}>{SESSION_SAMPLE}</pre>
            <ul className="list-disc pl-5 mt-3 space-y-1">{c.sessionNotes.map((n, i) => <li key={i} className={P}>{n}</li>)}</ul>

            <h2 id="statuses" className={H2}>{c.statusTitle}</h2>
            <Rows rows={c.statuses} />
            <p className={P + " mt-3"}>{c.rescoreNote}</p>

            <h2 id="webhooks" className={H2}>{c.toc[5]}</h2>
            <p className={P}>{c.hooksIntro}</p>
            <div className="mt-3"><Rows rows={c.events} /></div>
            <div className="mt-3"><Rows rows={c.delivery} /></div>
            <p className="text-xs font-semibold text-[var(--color-text)] mt-4 mb-1">{c.example}</p>
            <pre className={PRE}>{EVENT_SAMPLE}</pre>
            <p className="text-xs font-semibold text-[var(--color-text)] mt-4 mb-1">{c.verifyTitle}</p>
            <pre className={PRE}>{VERIFY_NODE}</pre>

            <h2 id="errors" className={H2}>{c.toc[6]}</h2>
            <p className={P + " mb-3"}>{c.errorsIntro}</p>
            <pre className={PRE + " mb-3"}>{`{ "error": { "code": "insufficient_scope", "message": "This key needs the \\"read:transcripts\\" scope.", "request_id": "req_8b0c5f0e2a9d4f0c9c1d7e21" } }`}</pre>
            <Rows rows={c.errors} />

            <h2 id="changelog" className={H2}>{c.toc[7]}</h2>
            <Rows rows={c.changelog} />

            <p className={P + " mt-10"}>{c.help}</p>
        </div>
    )
}
