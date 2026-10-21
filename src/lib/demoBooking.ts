import type { Locale } from "@/i18n"

/// Every "Book a demo" goes straight to Alexis's Cal.com event, one per language (D-652),
/// same as talkpilot.co. After booking, Cal.com redirects to talkpilot.co/demo/booked, which
/// fires the ad conversions. utm_content names the button so each booking says where it came from.
const DEMO_BOOKING_URLS: Record<Locale, string> = {
    en: "https://cal.com/alexis-talkpilot/introduction-to-talkpilot",
    es: "https://cal.com/alexis-talkpilot/introduccion-a-talkpilot",
}

export function demoBookingUrl(locale: Locale, source: string): string {
    const params = new URLSearchParams({
        utm_source: "teams.talkpilot.co",
        utm_medium: "command_center",
        utm_campaign: "book_demo",
        utm_content: source,
    })
    return `${DEMO_BOOKING_URLS[locale]}?${params.toString()}`
}
