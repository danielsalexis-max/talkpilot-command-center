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
///   .doc/.pages/.odt/…  → UnsupportedFileError (legacy binary formats with no
///                         browser-side parser worth shipping — the error names
///                         the fix: re-save as PDF or .docx)
///
/// Parsers load lazily (dynamic import) — pdf.js is ~400KB and most sessions
/// never upload a PDF, so neither belongs in the main bundle.

export class UnsupportedFileError extends Error {
    constructor(public readonly ext: string) {
        super(`Unsupported file type: .${ext}`)
        this.name = "UnsupportedFileError"
    }
}

/** Thrown when a parser ran fine but found no text — a scanned/image-only PDF. */
export class EmptyDocumentError extends Error {
    constructor() {
        super("No extractable text in document")
        this.name = "EmptyDocumentError"
    }
}

/** The accept list matching what extractTextFromFile can actually deliver. */
export const EXTRACT_ACCEPT = ".txt,.md,.csv,.pdf,.docx"

const REFUSED_EXTENSIONS = ["doc", "pages", "odt", "rtf", "key", "ppt", "pptx", "xls", "xlsx"]

export async function extractTextFromFile(file: File): Promise<string> {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
    if (ext === "pdf") return nonEmpty(await extractPdf(file))
    if (ext === "docx") return nonEmpty(await extractDocx(file))
    if (REFUSED_EXTENSIONS.includes(ext)) throw new UnsupportedFileError(ext)
    return nonEmpty(await file.text())
}

function nonEmpty(text: string): string {
    const trimmed = text.trim()
    if (!trimmed) throw new EmptyDocumentError()
    return trimmed
}

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
