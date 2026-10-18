// Tool logos for the /start tools screen (D-615). HubSpot, Google Calendar
// and Zoom are the official simple-icons paths (CC0 pictograms, copied as
// constants so the 3 MB package stays out of the bundle). Salesforce, Outlook
// and Slack were removed from simple-icons for trademark policy, so those are
// our own neutral glyphs in the brand's color -- a cloud, an envelope, a hash.

export function ToolIcon({ tool }: { tool: string }) {
    const size = 20
    switch (tool) {
        case "hubspot": return (
            <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden><path fill="#FF7A59" d="M18.164 7.93V5.084a2.198 2.198 0 001.267-1.978v-.067A2.2 2.2 0 0017.238.845h-.067a2.2 2.2 0 00-2.193 2.193v.067a2.196 2.196 0 001.252 1.973l.013.006v2.852a6.22 6.22 0 00-2.969 1.31l.012-.01-7.828-6.095A2.497 2.497 0 104.3 4.656l-.012.006 7.697 5.991a6.176 6.176 0 00-1.038 3.446c0 1.343.425 2.588 1.147 3.607l-.013-.02-2.342 2.343a1.968 1.968 0 00-.58-.095h-.002a2.033 2.033 0 102.033 2.033 1.978 1.978 0 00-.1-.595l.005.014 2.317-2.317a6.247 6.247 0 104.782-11.134l-.036-.005zm-.964 9.378a3.206 3.206 0 113.215-3.207v.002a3.206 3.206 0 01-3.207 3.207z" /></svg>
        )
        case "gcal": return (
            <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden><path fill="#4285F4" d="M18.316 5.684H24v12.632h-5.684V5.684zM5.684 24h12.632v-5.684H5.684V24zM18.316 5.684V0H1.895A1.894 1.894 0 0 0 0 1.895v16.421h5.684V5.684h12.632zm-7.207 6.25v-.065c.272-.144.5-.349.687-.617s.279-.595.279-.982c0-.379-.099-.72-.3-1.025a2.05 2.05 0 0 0-.832-.714 2.703 2.703 0 0 0-1.197-.257c-.6 0-1.094.156-1.481.467-.386.311-.65.671-.793 1.078l1.085.452c.086-.249.224-.461.413-.633.189-.172.445-.257.767-.257.33 0 .602.088.816.264a.86.86 0 0 1 .322.703c0 .33-.12.589-.36.778-.24.19-.535.284-.886.284h-.567v1.085h.633c.407 0 .748.109 1.02.327.272.218.407.499.407.843 0 .336-.129.614-.387.832s-.565.327-.924.327c-.351 0-.651-.103-.897-.311-.248-.208-.422-.502-.521-.881l-1.096.452c.178.616.505 1.082.977 1.401.472.319.984.478 1.538.477a2.84 2.84 0 0 0 1.293-.291c.382-.193.684-.458.902-.794.218-.336.327-.72.327-1.149 0-.429-.115-.797-.344-1.105a2.067 2.067 0 0 0-.881-.689zm2.093-1.931l.602.913L15 10.045v5.744h1.187V8.446h-.827l-2.158 1.557zM22.105 0h-3.289v5.184H24V1.895A1.894 1.894 0 0 0 22.105 0zm-3.289 23.5l4.684-4.684h-4.684V23.5zM0 22.105C0 23.152.848 24 1.895 24h3.289v-5.184H0v3.289z" /></svg>
        )
        case "meetings": return (
            <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden><path fill="#0B5CFF" d="M5.033 14.649H.743a.74.74 0 0 1-.686-.458.74.74 0 0 1 .16-.808L3.19 10.41H1.06A1.06 1.06 0 0 1 0 9.35h3.957c.301 0 .57.18.686.458a.74.74 0 0 1-.161.808L1.51 13.59h2.464c.585 0 1.06.475 1.06 1.06zM24 11.338c0-1.14-.927-2.066-2.066-2.066-.61 0-1.158.265-1.537.686a2.061 2.061 0 0 0-1.536-.686c-1.14 0-2.066.926-2.066 2.066v3.311a1.06 1.06 0 0 0 1.06-1.06v-2.251a1.004 1.004 0 0 1 2.013 0v2.251c0 .586.474 1.06 1.06 1.06v-3.311a1.004 1.004 0 0 1 2.012 0v2.251c0 .586.475 1.06 1.06 1.06zM16.265 12a2.728 2.728 0 1 1-5.457 0 2.728 2.728 0 0 1 5.457 0zm-1.06 0a1.669 1.669 0 1 0-3.338 0 1.669 1.669 0 0 0 3.338 0zm-4.82 0a2.728 2.728 0 1 1-5.458 0 2.728 2.728 0 0 1 5.457 0zm-1.06 0a1.669 1.669 0 1 0-3.338 0 1.669 1.669 0 0 0 3.338 0z" /></svg>
        )
        case "salesforce": return (
            <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
                <path fill="#00A1E0" d="M17.5 9.1a4.6 4.6 0 0 0-8.7-1.9A3.8 3.8 0 0 0 3 10.6a3.9 3.9 0 0 0 1 7.7h13a4.6 4.6 0 0 0 .5-9.2z" />
            </svg>
        )
        case "outlook": return (
            <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
                <rect x="2" y="4.5" width="20" height="15" rx="2.5" fill="#0F6CBD" />
                <path d="M4.5 7.5 12 13l7.5-5.5" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        )
        case "slack": return (
            <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
                <rect x="9.5" y="3" width="3.4" height="18" rx="1.7" fill="#36C5F0" transform="rotate(90 12 12)" opacity=".9" />
                <rect x="9.5" y="3" width="3.4" height="18" rx="1.7" fill="#E01E5A" opacity=".9" />
                <rect x="14.8" y="3" width="3.4" height="18" rx="1.7" fill="#2EB67D" opacity=".9" />
                <rect x="9.5" y="8.3" width="3.4" height="18" rx="1.7" fill="#ECB22E" transform="rotate(90 12 12)" opacity=".9" />
            </svg>
        )
        default: return null
    }
}
