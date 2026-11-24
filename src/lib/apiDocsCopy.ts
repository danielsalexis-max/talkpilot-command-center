/// /developers: the public TalkPilot Teams API guide (D-1063), English and
/// es-419. The machine-readable reference is public/openapi/talkpilot-teams-v1.yaml
/// (canonical copy: talkpilot-app docs/api/openapi.yaml). Endpoint paths, field
/// names, scopes, event names and code are never translated.

import type { Locale } from "@/i18n"

export const OPENAPI_URL = "/openapi/talkpilot-teams-v1.yaml"
export const BASE = "https://hmmhrddmfbhdkaiesgrd.supabase.co/functions/v1/api-v1"

export interface Endpoint { method: string; path: string; scope: string; what: string }

const ENDPOINTS: Record<Locale, Endpoint[]> = {
    en: [
        { method: "GET", path: "/v1/sessions", scope: "read:sessions", what: "Every session, any status, with filters and a cursor" },
        { method: "GET", path: "/v1/sessions/{id}", scope: "read:sessions", what: "One session with its full score and meeting" },
        { method: "GET", path: "/v1/sessions/{id}/transcript", scope: "read:transcripts", what: "Transcript in segments with seconds" },
        { method: "POST", path: "/v1/transcripts:batch", scope: "read:transcripts", what: "Up to 50 transcripts at once" },
        { method: "GET", path: "/v1/sessions/{id}/score-history", scope: "read:sessions", what: "Earlier scores of a re-scored session" },
        { method: "POST", path: "/v1/sessions/{id}/score", scope: "write:scoring", what: "Score or re-score, optionally against a playbook (202 + job)" },
        { method: "POST", path: "/v1/sessions/{id}/exclude · /include", scope: "write:sessions", what: "Leave out of the averages, or count again" },
        { method: "GET", path: "/v1/members", scope: "read:config", what: "Members, playbook policy, default and assigned playbook" },
        { method: "PUT", path: "/v1/members/{id}/default-playbook", scope: "write:playbooks", what: "The playbook a member's calls start on" },
        { method: "GET", path: "/v1/playbooks · /{id} · /{id}/assignments", scope: "read:config", what: "Playbooks and who they apply to" },
        { method: "PUT", path: "/v1/playbooks/{id}/assignments", scope: "write:playbooks", what: "Assign to the workspace, a team or a person" },
        { method: "POST", path: "/v1/playbooks/{id}/activate · /deactivate", scope: "write:playbooks", what: "Turn a playbook on or off" },
        { method: "GET · PUT", path: "/v1/vocabulary", scope: "read:config · write:playbooks", what: "Words transcription should hear right" },
        { method: "GET", path: "/v1/audit-log", scope: "read:config", what: "Configuration changes and who made them" },
        { method: "POST · GET", path: "/v1/exports · /v1/exports/{id}", scope: "read:sessions", what: "Full workspace export with a signed download link" },
        { method: "GET", path: "/v1/jobs/{id}", scope: "read:sessions", what: "A score or export job" },
        { method: "GET · POST", path: "/v1/webhooks", scope: "admin:webhooks", what: "List or add webhooks" },
        { method: "GET · PATCH · DELETE", path: "/v1/webhooks/{id}", scope: "admin:webhooks", what: "Read, change, pause or delete one" },
        { method: "POST", path: "/v1/webhooks/{id}/rotate-secret · /test", scope: "admin:webhooks", what: "New signing secret, or a test event" },
        { method: "GET", path: "/v1/webhooks/{id}/deliveries", scope: "admin:webhooks", what: "Delivery log with response codes" },
        { method: "POST", path: "/v1/webhooks/{id}/deliveries/{d}/resend", scope: "admin:webhooks", what: "Send a delivery again" },
    ],
    es: [
        { method: "GET", path: "/v1/sessions", scope: "read:sessions", what: "Todas las sesiones, en cualquier estado, con filtros y cursor" },
        { method: "GET", path: "/v1/sessions/{id}", scope: "read:sessions", what: "Una sesión con su puntaje completo y la reunión" },
        { method: "GET", path: "/v1/sessions/{id}/transcript", scope: "read:transcripts", what: "Transcripción en segmentos con segundos" },
        { method: "POST", path: "/v1/transcripts:batch", scope: "read:transcripts", what: "Hasta 50 transcripciones a la vez" },
        { method: "GET", path: "/v1/sessions/{id}/score-history", scope: "read:sessions", what: "Puntajes anteriores de una sesión recalificada" },
        { method: "POST", path: "/v1/sessions/{id}/score", scope: "write:scoring", what: "Calificar o recalificar, con un playbook si quieres (202 + job)" },
        { method: "POST", path: "/v1/sessions/{id}/exclude · /include", scope: "write:sessions", what: "Dejar fuera de los promedios o volver a contar" },
        { method: "GET", path: "/v1/members", scope: "read:config", what: "Miembros, política de playbook, predeterminado y asignado" },
        { method: "PUT", path: "/v1/members/{id}/default-playbook", scope: "write:playbooks", what: "El playbook con el que empiezan las llamadas de un miembro" },
        { method: "GET", path: "/v1/playbooks · /{id} · /{id}/assignments", scope: "read:config", what: "Playbooks y a quién aplican" },
        { method: "PUT", path: "/v1/playbooks/{id}/assignments", scope: "write:playbooks", what: "Asignar al espacio, a un equipo o a una persona" },
        { method: "POST", path: "/v1/playbooks/{id}/activate · /deactivate", scope: "write:playbooks", what: "Activar o apagar un playbook" },
        { method: "GET · PUT", path: "/v1/vocabulary", scope: "read:config · write:playbooks", what: "Palabras que la transcripción debe reconocer" },
        { method: "GET", path: "/v1/audit-log", scope: "read:config", what: "Cambios de configuración y quién los hizo" },
        { method: "POST · GET", path: "/v1/exports · /v1/exports/{id}", scope: "read:sessions", what: "Exportación completa con enlace de descarga firmado" },
        { method: "GET", path: "/v1/jobs/{id}", scope: "read:sessions", what: "Un trabajo de calificación o exportación" },
        { method: "GET · POST", path: "/v1/webhooks", scope: "admin:webhooks", what: "Listar o agregar webhooks" },
        { method: "GET · PATCH · DELETE", path: "/v1/webhooks/{id}", scope: "admin:webhooks", what: "Ver, cambiar, pausar o eliminar uno" },
        { method: "POST", path: "/v1/webhooks/{id}/rotate-secret · /test", scope: "admin:webhooks", what: "Nuevo secreto de firma o evento de prueba" },
        { method: "GET", path: "/v1/webhooks/{id}/deliveries", scope: "admin:webhooks", what: "Registro de entregas con códigos de respuesta" },
        { method: "POST", path: "/v1/webhooks/{id}/deliveries/{d}/resend", scope: "admin:webhooks", what: "Reenviar una entrega" },
    ],
}

export const CURL_LIST = `curl "${BASE}/v1/sessions?since=2026-11-10T00:00:00Z&status=not_scored&limit=50" \\
  -H "Authorization: Bearer $TALKPILOT_API_KEY"`

export const CURL_SCORE = `curl -X POST "${BASE}/v1/sessions/8f1c2e7a-0b3d-4c55-9a61-2f0e7d9b1c44/score" \\
  -H "Authorization: Bearer $TALKPILOT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: rescore-8f1c2e7a-1" \\
  -d '{"playbook_id": "3a9d6b10-7e2f-4f7a-b8c1-5d0e4a2f9b63"}'`

export const SESSION_SAMPLE = `{
  "session_id": "8f1c2e7a-0b3d-4c55-9a61-2f0e7d9b1c44",
  "member_id": "3a9d6b10-7e2f-4f7a-b8c1-5d0e4a2f9b63",
  "title": "Demo Acme",
  "started_at": "2026-11-18T23:00:12Z",
  "ended_at": "2026-11-19T00:15:40Z",
  "duration_seconds": 4528,
  "status": "scored",
  "status_reason": null,
  "call_type": "sales",
  "detected_stage": "demo",
  "playbook_id": "5d0e4a2f-9b63-4f7a-b8c1-3a9d6b107e2f",
  "capture_source": "desktop_manual",
  "platform": "macos",
  "audio_channels": { "mic": true, "system": true },
  "audio_channels_source": "inferred",
  "talk_ratio": { "member": 0.53, "others": 0.47 },
  "score": {
    "overall": 72, "adherence": 60, "objection_handling": 80, "accuracy": null,
    "scored_at": "2026-11-19T00:17:02Z",
    "steps": [{ "key": "close_with_date", "completed": false, "missed": ["Exact time agreed"],
                "evidence_refs": [{ "start_seconds": 4412.3, "end_seconds": 4431.0, "lines": "611" }] }],
    "missed_rules": [{ "rule": "Don't demo every module", "start_seconds": 1830.2, "end_seconds": 1838.9, "lines": "271" }],
    "highlights": [{ "kind": "best", "label": "Quantified the cost of waiting", "start_seconds": 512.0, "end_seconds": 689.4, "lines": "76-104" }]
  },
  "meeting": { "url": "https://meet.google.com/abc-defg-hij", "calendar_event_id": "7kq…",
               "platform": "google_meet", "participants": [{ "email": "ana@acme.com", "name": "Ana" }] },
  "excluded_at": null, "excluded_reason": null, "excluded_by": null,
  "updated_at": "2026-11-19T00:17:02Z"
}`

export const VERIFY_NODE = `import crypto from "node:crypto"

// rawBody: the exact bytes received (do not re-serialize the JSON)
function verify(rawBody, header, secret) {
  const items = header.split(",").map(p => p.trim().split("="))
  const t = Number(items.find(([k]) => k === "t")?.[1])
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false   // 5-minute window
  const expected = Buffer.from(
    crypto.createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex"), "hex")
  return items.some(([k, v]) => k === "v1" && v?.length === 64 &&
    crypto.timingSafeEqual(Buffer.from(v, "hex"), expected))
}`

export const EVENT_SAMPLE = `POST https://your-system.com/talkpilot
Content-Type: application/json
TalkPilot-Event-Id: evt_9b2e1f0c4d8a4e7f9a1b2c3d4e5f6a7b
TalkPilot-Event-Type: session.not_scored
TalkPilot-Signature: t=1763510140,v1=5f2b…c9a1

{
  "id": "evt_9b2e1f0c4d8a4e7f9a1b2c3d4e5f6a7b",
  "type": "session.not_scored",
  "created_at": "2026-11-19T00:16:02Z",
  "workspace_id": "26f08e2d-…",
  "test": false,
  "data": { "session": { "session_id": "…", "status": "not_scored", "status_reason": "rep_barely_spoke", … } }
}`

const COPY = {
    en: {
        title: "TalkPilot Teams API",
        sub: "Read every call, transcript and score from your own systems, change playbooks and scoring, and get a webhook the moment a call ends. Part of TalkPilot Teams Enterprise.",
        openapi: "OpenAPI spec (YAML)",
        toc: ["Getting started", "Conventions", "Endpoints", "The Session object", "Statuses", "Webhooks", "Errors", "Changelog"],
        start: [
            "An owner or admin creates a key in the Command Center: Settings › API & webhooks. Pick only the permissions (scopes) the system needs. The key is shown once.",
            "Send it on every request as Authorization: Bearer tpk_live_…. A key belongs to the workspace, not to a person: reads made with it are never shown to reps as someone opening their call. Changes made with it appear in the audit log under the key's name.",
            "Two keys can be active at once, so you can switch to a new key without downtime, then revoke the old one.",
        ],
        baseUrl: "Base URL",
        conv: [
            ["Format", "JSON in UTF-8. Date-times are ISO 8601 in UTC. Ids are UUIDs."],
            ["Pagination", "limit (default 50, max 200) and cursor. Pass next_cursor exactly as returned; it is null on the last page."],
            ["Incremental sync", "GET /v1/sessions?updated_since=… returns changes oldest first. Keep the last updated_at you saw."],
            ["Rate limit", "120 requests per minute per key. Every response has RateLimit-Limit, RateLimit-Remaining and RateLimit-Reset; a 429 adds Retry-After."],
            ["Idempotency", "Every write accepts an Idempotency-Key header, kept 24 hours. Repeating it with the same request returns the first answer; with a different request it is a 409."],
            ["Transcripts", "Need the read:transcripts scope and the workspace's transcript visibility set to Full transcripts. Otherwise the API answers 403 transcripts_not_visible, the same promise the Command Center makes to reps."],
            ["Versioning", "Breaking changes only in a new version (/v2), announced at least 90 days ahead, and listed in the changelog below."],
        ] as [string, string][],
        epMethod: "Method", epPath: "Path", epScope: "Scope", epWhat: "What it does",
        sessionIntro: "Returned by GET /v1/sessions and inside every webhook. Steps, missed rules and highlights carry start_seconds and end_seconds from the start of the transcript.",
        sessionNotes: [
            "processing: the call is saved and scoring has not answered yet, usually under 2 minutes.",
            "audio_channels is inferred from who was transcribed (audio_channels_source: inferred) until the apps report each channel.",
            "capture_source reads desktop_manual or mobile_manual today; desktop_notification and calendar appear once the apps send them.",
            "meeting is filled when the call matched a calendar event.",
        ],
        statusTitle: "Statuses and reasons",
        statuses: [
            ["scored", "Graded. score is filled."],
            ["not_scored", "Not graded. status_reason: not_sales (service, onboarding or other non-sales call), internal (a meeting with colleagues), no_audio (the rep's voice was not captured, the call was on hold most of the time, or the transcript was unusable), rep_barely_spoke (the rep said under 10% of the words)."],
            ["too_short", "Under 5 minutes of talk. status_reason: below_min_duration."],
            ["failed", "Scoring failed. status_reason: processing_error. POST /score retries it."],
            ["processing", "Saved, waiting for scoring."],
        ] as [string, string][],
        rescoreNote: "POST /v1/sessions/{id}/score grades any session again, scored ones too, optionally against a playbook_id. It answers 202 with a job_id; the result arrives as session.scored. The earlier score is kept: GET /v1/sessions/{id}/score-history.",
        hooksIntro: "Add a webhook in Settings › API & webhooks, or with POST /v1/webhooks. We POST each event to your URL.",
        events: [
            ["session.started", "A call starts (sent by the apps while the call runs)."],
            ["session.completed", "The call was saved. Usually status processing."],
            ["session.scored", "Scored or re-scored. Full score with seconds, and transcript_url."],
            ["session.not_scored", "Not scored or too short, with status_reason."],
            ["session.failed", "No audio, or scoring failed."],
            ["session.audio_warning", "A microphone or the call's audio went silent during the call: channel and started_at_seconds."],
        ] as [string, string][],
        delivery: [
            ["Signature", "TalkPilot-Signature: t=<unix>,v1=<hex>. v1 is HMAC-SHA256 of t + \".\" + the raw body with your webhook's secret. Reject t more than 5 minutes from your clock."],
            ["Rotation", "\"New secret\" keeps the old one signing for 24 hours: both v1 values arrive, so either secret verifies."],
            ["Answer", "Any 2xx within 10 seconds confirms the delivery."],
            ["Retries", "1 min, 5 min, 30 min, 2 h, 6 h, 12 h, and 12 h once more (about 33 hours in all)."],
            ["Duplicates and order", "The same event can arrive twice and out of order. Dedupe on the event id; the session's updated_at decides which version is current."],
            ["Timing", "session.completed is raised when the call is saved; scoring usually finishes within 2 minutes."],
            ["Log", "Every delivery, its response code and a Resend button: in the Command Center and at GET /v1/webhooks/{id}/deliveries."],
        ] as [string, string][],
        verifyTitle: "Verify a delivery (Node.js)",
        errorsIntro: "Standard HTTP status codes with the same body. Quote request_id when you write to us.",
        errors: [
            ["400", "invalid_request"], ["401", "unauthorized"], ["403", "insufficient_scope, api_not_enabled, transcripts_not_visible"],
            ["404", "not_found"], ["409", "score_in_progress, export_in_progress, too_many_keys, idempotency_key_reused"],
            ["422", "validation_failed, playbook_not_active"], ["429", "rate_limited"], ["5xx", "internal_error, unavailable"],
        ] as [string, string][],
        changelog: [["2026-11-24", "v1: sessions, transcripts, scoring, playbooks, vocabulary, audit log, exports and webhooks."]] as [string, string][],
        help: "Questions? Write to hello@talkpilot.co.",
        example: "Example",
    },
    es: {
        title: "API de TalkPilot Teams",
        sub: "Lee cada llamada, transcripción y puntaje desde tus propios sistemas, cambia playbooks y calificaciones, y recibe un webhook en cuanto termina una llamada. Parte de TalkPilot Teams Enterprise.",
        openapi: "Especificación OpenAPI (YAML)",
        toc: ["Primeros pasos", "Convenciones", "Endpoints", "El objeto Session", "Estados", "Webhooks", "Errores", "Registro de cambios"],
        start: [
            "Un owner o admin crea una llave en el Command Center: Ajustes › API y webhooks. Elige solo los permisos (scopes) que tu sistema necesita. La llave se muestra una sola vez.",
            "Envíala en cada solicitud como Authorization: Bearer tpk_live_…. La llave es del espacio, no de una persona: lo que se lee con ella nunca aparece ante los reps como si alguien abriera su llamada. Los cambios que hace aparecen en la bitácora con el nombre de la llave.",
            "Puede haber dos llaves activas a la vez, para que cambies a una nueva sin cortes y luego revoques la anterior.",
        ],
        baseUrl: "URL base",
        conv: [
            ["Formato", "JSON en UTF-8. Fechas y horas en ISO 8601, en UTC. Los identificadores son UUID."],
            ["Paginación", "limit (50 por defecto, máximo 200) y cursor. Pasa next_cursor tal como llega; es null en la última página."],
            ["Sincronización incremental", "GET /v1/sessions?updated_since=… devuelve los cambios del más antiguo al más reciente. Guarda el último updated_at que viste."],
            ["Límite de uso", "120 solicitudes por minuto por llave. Cada respuesta trae RateLimit-Limit, RateLimit-Remaining y RateLimit-Reset; un 429 agrega Retry-After."],
            ["Idempotencia", "Toda escritura acepta el encabezado Idempotency-Key, válido 24 horas. Repetirlo con la misma solicitud devuelve la primera respuesta; con otra solicitud es un 409."],
            ["Transcripciones", "Necesitan el scope read:transcripts y que la visibilidad del espacio esté en Transcripciones completas. Si no, la API responde 403 transcripts_not_visible: es la misma promesa que el Command Center les hace a los reps."],
            ["Versiones", "Los cambios incompatibles solo llegan en una versión nueva (/v2), con al menos 90 días de aviso, y aparecen en el registro de cambios de abajo."],
        ] as [string, string][],
        epMethod: "Método", epPath: "Ruta", epScope: "Scope", epWhat: "Qué hace",
        sessionIntro: "Lo devuelve GET /v1/sessions y viene dentro de cada webhook. Los pasos, las reglas incumplidas y los destacados traen start_seconds y end_seconds desde el inicio de la transcripción.",
        sessionNotes: [
            "processing: la llamada ya se guardó y la calificación todavía no responde; suele tardar menos de 2 minutos.",
            "audio_channels se deduce de quién quedó transcrito (audio_channels_source: inferred) hasta que las apps reporten cada canal.",
            "capture_source hoy dice desktop_manual o mobile_manual; desktop_notification y calendar aparecen cuando las apps los envíen.",
            "meeting se llena cuando la llamada coincidió con un evento del calendario.",
        ],
        statusTitle: "Estados y motivos",
        statuses: [
            ["scored", "Calificada. score viene lleno."],
            ["not_scored", "No calificada. status_reason: not_sales (llamada de servicio, onboarding u otra que no es de venta), internal (reunión con colegas), no_audio (no se captó la voz del rep, la llamada estuvo en pausa casi todo el tiempo o la transcripción no servía), rep_barely_spoke (el rep dijo menos del 10% de las palabras)."],
            ["too_short", "Menos de 5 minutos de conversación. status_reason: below_min_duration."],
            ["failed", "La calificación falló. status_reason: processing_error. POST /score la reintenta."],
            ["processing", "Guardada, esperando la calificación."],
        ] as [string, string][],
        rescoreNote: "POST /v1/sessions/{id}/score vuelve a calificar cualquier sesión, también las ya calificadas, y acepta un playbook_id. Responde 202 con un job_id; el resultado llega como session.scored. El puntaje anterior se conserva: GET /v1/sessions/{id}/score-history.",
        hooksIntro: "Agrega un webhook en Ajustes › API y webhooks, o con POST /v1/webhooks. Enviamos cada evento con un POST a tu URL.",
        events: [
            ["session.started", "Empieza una llamada (lo envían las apps mientras la llamada sigue)."],
            ["session.completed", "La llamada se guardó. Normalmente con status processing."],
            ["session.scored", "Calificada o recalificada. Puntaje completo con segundos y transcript_url."],
            ["session.not_scored", "No calificada o muy corta, con status_reason."],
            ["session.failed", "No hubo audio o la calificación falló."],
            ["session.audio_warning", "Un micrófono o el audio de la llamada se quedó en silencio durante la llamada: channel y started_at_seconds."],
        ] as [string, string][],
        delivery: [
            ["Firma", "TalkPilot-Signature: t=<unix>,v1=<hex>. v1 es HMAC-SHA256 de t + \".\" + el cuerpo tal cual, con el secreto de tu webhook. Rechaza un t a más de 5 minutos de tu reloj."],
            ["Rotación", "«Nuevo secreto» deja que el anterior siga firmando 24 horas: llegan los dos v1, así que cualquiera de los dos secretos valida."],
            ["Respuesta", "Cualquier 2xx en menos de 10 segundos confirma la entrega."],
            ["Reintentos", "1 min, 5 min, 30 min, 2 h, 6 h, 12 h y 12 h una vez más (unas 33 horas en total)."],
            ["Duplicados y orden", "El mismo evento puede llegar dos veces y en otro orden. Elimina duplicados con el id del evento; el updated_at de la sesión decide cuál versión vale."],
            ["Tiempos", "session.completed sale cuando la llamada se guarda; la calificación suele terminar en menos de 2 minutos."],
            ["Registro", "Cada entrega, su código de respuesta y un botón para reenviar: en el Command Center y en GET /v1/webhooks/{id}/deliveries."],
        ] as [string, string][],
        verifyTitle: "Validar una entrega (Node.js)",
        errorsIntro: "Códigos HTTP estándar, siempre con el mismo cuerpo. Incluye el request_id cuando nos escribas.",
        errors: [
            ["400", "invalid_request"], ["401", "unauthorized"], ["403", "insufficient_scope, api_not_enabled, transcripts_not_visible"],
            ["404", "not_found"], ["409", "score_in_progress, export_in_progress, too_many_keys, idempotency_key_reused"],
            ["422", "validation_failed, playbook_not_active"], ["429", "rate_limited"], ["5xx", "internal_error, unavailable"],
        ] as [string, string][],
        changelog: [["2026-11-24", "v1: sesiones, transcripciones, calificación, playbooks, vocabulario, bitácora, exportaciones y webhooks."]] as [string, string][],
        help: "¿Preguntas? Escríbenos a hello@talkpilot.co.",
        example: "Ejemplo",
    },
}

export function apiDocsCopy(locale: Locale) {
    return { ...COPY[locale], endpoints: ENDPOINTS[locale] }
}
