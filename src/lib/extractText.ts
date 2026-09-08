/// Client-side text extraction for uploaded documents.
///
/// Every import path used to run `file.text()` on whatever the picker allowed.
/// For a PDF that decodes the binary container as UTF-8 — the only readable
/// tokens are PDF syntax keywords, which is how a real objection upload came
/// back as a single extracted objection reading "stream". A .docx is a ZIP and
/// failed the same way. This module is the one place that turns a File into
/// text, so no import path can regress independently again:
///
///   .txt/.md/.csv/.json → read as text
///   .pdf                → pdf.js text layer, page by page
///   .docx               → mammoth raw text
///   .pptx               → slide text + speaker notes, straight out of the ZIP
///   .srt/.vtt           → captions, stripped of timecodes and cue numbers
///   video               → refused, but by name, pointing at the captions path
///   .doc/.pages/.key/…  → UnsupportedFileError (legacy or closed formats with
///                         no browser-side parser worth shipping — the error
///                         names the fix: re-save as PDF or .docx)
///
/// **Every rejection says why** (D-308). "Could not read that file" was the
/// only feedback an admin got whether the file was 200 MB, a Keynote, a scanned
/// contract or a screen recording, and each of those has a different fix. The
/// error classes below each carry the fix, and the UI renders it.
///
/// Parsers load lazily (dynamic import) — pdf.js is ~400 KB and JSZip is not
/// free either, and most sessions upload neither.

// ── Errors ───────────────────────────────────────────────────────────────────
//
// Each one answers "why not?" with something the person can act on. `reason` is
// the stable key the UI switches on; `ext`/`bytes` carry what it needs to say.

export class UnsupportedFileError extends Error {
    readonly reason = "format" as const
    constructor(public readonly ext: string) {
        super(`Unsupported file type: .${ext}`)
        this.name = "UnsupportedFileError"
    }
}

/// Video and audio are refused deliberately, not for lack of a parser: we do
/// not transcribe media (D-309). Split from UnsupportedFileError because the
/// fix is completely different — "export the captions", not "re-save as PDF".
export class MediaFileError extends Error {
    readonly reason = "media" as const
    constructor(public readonly ext: string) {
        super(`Media files are not read: .${ext}`)
        this.name = "MediaFileError"
    }
}

export class FileTooLargeError extends Error {
    readonly reason = "size" as const
    constructor(public readonly bytes: number, public readonly limit: number) {
        super(`File is ${fmtMB(bytes)} — the limit is ${fmtMB(limit)}`)
        this.name = "FileTooLargeError"
    }
}

/// The parser ran fine and found nothing. Overwhelmingly a scanned or
/// photographed PDF: an image with no text layer, and we do not OCR.
export class EmptyDocumentError extends Error {
    readonly reason = "empty" as const
    constructor(public readonly ext: string = "") {
        super("No extractable text in document")
        this.name = "EmptyDocumentError"
    }
}

/// The parser threw. A corrupt ZIP, a password-protected PDF, a file whose
/// extension lies about its contents.
export class UnreadableFileError extends Error {
    readonly reason = "unreadable" as const
    constructor(public readonly ext: string, public readonly detail: string) {
        super(`Could not read .${ext}: ${detail}`)
        this.name = "UnreadableFileError"
    }
}

export type ExtractErrorReason = "format" | "media" | "size" | "empty" | "unreadable"

/** True for any error this module raises on purpose, all of which carry a fix. */
export function isExtractError(e: unknown): e is { reason: ExtractErrorReason } {
    return !!e && typeof e === "object" && "reason" in e
}

// ── Limits ───────────────────────────────────────────────────────────────────

/// Read client-side, then shipped inline to `ingest-knowledge`, which chunks
/// and embeds every chunk. The ceiling protects that function, not the browser.
export const MAX_FILE_BYTES = 25 * 1024 * 1024
/// ~100k tokens. Past this the ingest is hundreds of embedding calls and will
/// time out; splitting the document is the honest fix, so we say so.
export const MAX_TEXT_CHARS = 400_000

/** The accept list matching what extractTextFromFile can actually deliver. */
export const EXTRACT_ACCEPT = ".txt,.md,.csv,.pdf,.docx,.pptx,.srt,.vtt"

const REFUSED_EXTENSIONS = ["doc", "pages", "odt", "rtf", "key", "ppt", "xls", "xlsx", "numbers"]
const MEDIA_EXTENSIONS = [
    "mp4", "mov", "m4v", "avi", "mkv", "webm", "wmv", "flv", "mpg", "mpeg",
    "mp3", "wav", "m4a", "aac", "flac", "ogg", "opus", "wma",
]

export async function extractTextFromFile(file: File): Promise<string> {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? ""

    // Size and format are checked before any parser runs: reading 200 MB into
    // an ArrayBuffer to then reject it is the slow way to say no.
    if (file.size > MAX_FILE_BYTES) throw new FileTooLargeError(file.size, MAX_FILE_BYTES)
    if (MEDIA_EXTENSIONS.includes(ext)) throw new MediaFileError(ext)
    if (REFUSED_EXTENSIONS.includes(ext)) throw new UnsupportedFileError(ext)

    let text: string
    try {
        if (ext === "pdf")                     text = await extractPdf(file)
        else if (ext === "docx")               text = await extractDocx(file)
        else if (ext === "pptx")               text = await extractPptx(file)
        else if (ext === "srt" || ext === "vtt") text = stripCaptions(await file.text())
        else                                   text = await file.text()
    } catch (e) {
        if (isExtractError(e)) throw e
        throw new UnreadableFileError(ext, e instanceof Error ? e.message : String(e))
    }

    return capped(nonEmpty(text, ext), ext)
}

function nonEmpty(text: string, ext: string): string {
    const trimmed = text.trim()
    if (!trimmed) throw new EmptyDocumentError(ext)
    return trimmed
}

function capped(text: string, ext: string): string {
    if (text.length > MAX_TEXT_CHARS) {
        throw new FileTooLargeError(text.length, MAX_TEXT_CHARS)
    }
    void ext
    return text
}

function fmtMB(bytes: number): string {
    return bytes >= 1024 * 1024
        ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.round(bytes / 1024)} KB`
}

// ── Parsers ──────────────────────────────────────────────────────────────────

async function extractPdf(file: File): Promise<string> {
    const pdfjs = await import("pdfjs-dist")
    // Bundler-resolved worker URL; without it pdf.js falls back to a warning
    // and a main-thread "fake worker", which still works but janks the tab.
    pdfjs.GlobalWorkerOptions.workerSrc =
        new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString()
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
    try {
        const pages: string[] = []
        for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i)
            const content = await page.getTextContent()
            pages.push(content.items
                .map(item => ("str" in item ? item.str : ""))
                .join(" "))
        }
        return pages.join("\n\n")
    } finally {
        await doc.cleanup()
    }
}

async function extractDocx(file: File): Promise<string> {
    const mammoth = await import("mammoth/mammoth.browser")
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
    return value
}

/// A .pptx is a ZIP of XML. Slide body text lives in `<a:t>` runs inside
/// `ppt/slides/slideN.xml`; the speaker notes — usually the only prose in a
/// sales deck — live in `ppt/notesSlides/notesSlideN.xml`. Both are read and
/// the notes are labelled, because "Confidential / 3 / Our proposal" with no
/// notes is a slide's worth of noise and the notes are the actual argument.
///
/// Slides are ordered numerically, not lexically: `slide10.xml` sorts before
/// `slide2.xml` as a string, which would silently scramble the deck.
async function extractPptx(file: File): Promise<string> {
    const JSZip = (await import("jszip")).default
    const zip = await JSZip.loadAsync(await file.arrayBuffer())

    const numbered = (prefix: string) =>
        Object.keys(zip.files)
            .filter(p => p.startsWith(prefix) && p.endsWith(".xml"))
            .map(p => ({ path: p, n: parseInt(p.match(/(\d+)\.xml$/)?.[1] ?? "0", 10) }))
            .sort((a, b) => a.n - b.n)

    const slides = numbered("ppt/slides/slide")
    const notes = new Map(numbered("ppt/notesSlides/notesSlide").map(s => [s.n, s.path]))

    const out: string[] = []
    for (const slide of slides) {
        const body = runsOf(await zip.file(slide.path)!.async("string"))
        const notePath = notes.get(slide.n)
        const note = notePath ? runsOf(await zip.file(notePath)!.async("string")) : ""
        const block = [
            `— Slide ${slide.n} —`,
            body,
            note ? `Speaker notes: ${note}` : "",
        ].filter(s => s.trim().length > 0)
        // A slide with a number and nothing else adds noise, not content.
        if (block.length > 1) out.push(block.join("\n"))
    }
    return out.join("\n\n")
}

/// Text runs out of DrawingML. Entity decoding matters: `&amp;` and `&#8217;`
/// are common in decks and would otherwise reach the embeddings raw.
function runsOf(xml: string): string {
    const runs = xml.match(/<a:t>([\s\S]*?)<\/a:t>/g) ?? []
    return runs
        .map(r => r.replace(/<a:t>|<\/a:t>/g, ""))
        .map(decodeEntities)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
}

function decodeEntities(s: string): string {
    return s
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&amp;/g, "&")   // last, so "&amp;lt;" does not become "<"
}

/// SRT and WebVTT reduced to the words. Cue numbers, timecodes, WEBVTT/NOTE
/// headers and inline tags all go; consecutive duplicate lines go too, because
/// rolling captions repeat each line as it scrolls and the duplicates would be
/// embedded as if the speaker said everything twice.
function stripCaptions(raw: string): string {
    const lines = raw.replace(/\r/g, "").split("\n")
    const out: string[] = []
    for (const line of lines) {
        const t = line.trim()
        if (!t) continue
        if (/^WEBVTT/i.test(t) || /^(NOTE|STYLE|REGION)\b/.test(t)) continue
        if (/^\d+$/.test(t)) continue                                   // SRT cue number
        if (/-->/.test(t)) continue                                     // timecode line
        const clean = decodeEntities(t.replace(/<[^>]+>/g, "")).trim()  // <v Speaker>, <i>…
        if (!clean) continue
        if (out.length > 0 && out[out.length - 1] === clean) continue   // rolling repeat
        out.push(clean)
    }
    return out.join(" ")
}
