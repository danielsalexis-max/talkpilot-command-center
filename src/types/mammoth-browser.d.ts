// mammoth ships types only for its main (Node) entry; the browser build has
// the same surface.
declare module "mammoth/mammoth.browser" {
    import * as mammoth from "mammoth"
    export = mammoth
}
