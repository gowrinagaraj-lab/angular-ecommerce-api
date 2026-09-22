# Category CSV/Excel Import — Implementation Notes (Phases 1–10)

This document started as a pre-build architecture doc (Phase 1) and is now updated to reflect what was
actually built through Phase 10. Phase 1's design sections are kept as-is where the implementation matched
the plan; where reality diverged (a library swap, a field rename, an operator that wasn't actually needed),
that's called out explicitly rather than silently edited away, since the "why" is often more useful than
the current state alone.

**Status: Phases 1–10 implemented and manually verified. Phase 11 (formal test checklist) and Phase 12
(production hardening review) are not started.**

Reference code:

- Model: [backend/src/models/ImportJob.js](../src/models/ImportJob.js)
- Upload middleware: [backend/src/middleware/categoryImportUpload.middleware.js](../src/middleware/categoryImportUpload.middleware.js)
- File validation: [backend/services/categoryImportFile.service.js](../services/categoryImportFile.service.js)
- Row reader: [backend/services/categoryImportRowReader.service.js](../services/categoryImportRowReader.service.js)
- Worker: [backend/services/categoryImportWorker.service.js](../services/categoryImportWorker.service.js)
- Controller: [backend/controllers/categoryImport.controller.js](../controllers/categoryImport.controller.js)
- Routes: [backend/routes/category.routes.js](../routes/category.routes.js)
- Frontend model: `frontend/src/app/models/import-job.model.ts`
- Frontend service: `frontend/src/app/services/category-import.service.ts`
- Frontend component: `frontend/src/app/components/admin-category/admin-category.component.ts` / `.html`

The `Category` schema already had a `unique` index on `name` before this feature existed — relevant to
Phase 4's duplicate handling below.

---

## Phase 1 — Architecture (design)

### 1. File upload flow

```
Angular (admin-category page)
   │  user picks categories.xlsx / .csv
   │  clicks "Import"
   ▼
POST /api/categories/import   (multipart/form-data, field name: "file")
   │
   ▼
Express route
   │  multer middleware (disk storage, same pattern as upload.middleware.js)
   │    - rejects wrong extension (.csv/.xlsx only - see Phase 2 note on .xls)
   │    - rejects >  size limit
   │    - writes file to backend/uploads/imports/<generated-name>.csv
   ▼
Controller (categoryImport.controller.js)
   │  validates the file's header + row count (categoryImportFile.service.js)
   │  creates ImportJob document: status="queued"
   │  fires off background processing (does NOT await it)
   │  responds 202 immediately: { jobId, status: "queued" }
   ▼
Angular receives jobId → starts polling
```

The critical property: the HTTP request's lifetime is "save file + validate header/row-count + insert one
Mongo doc." Row-by-row processing happens after the response is sent.

### 2. Import job lifecycle

```
queued ──► processing ──► completed
              │       └──► failed
              └──► cancelled
```

- **queued** — job row inserted, worker not yet picked it up.
- **processing** — worker is iterating rows, updating `processedRecords`/`progress` as it goes.
- **completed** — every row was attempted; job succeeds even if individual rows failed (Phase 4).
- **failed** — the job itself broke (unreadable file, worker exception) — not an individual bad row.
- **cancelled** — user requested cancellation and the worker observed it and stopped.

`completed | failed | cancelled` are terminal. Enforced today only by the frontend never polling past a
terminal status and the worker never writing over one (see Phase 9's race-guard) — there's no separate
application-level assertion "you cannot leave a terminal state."

### 3–4. Background processing & MongoDB job state

No Redis/BullMQ — a plain async function (`processImportJob`) invoked and left to run on Node's event
loop, fire-and-forget from the controller. The `ImportJob` document is the only shared state between the
request that created the job, the worker, and every polling request — nothing about job status lives in
process memory, which is what makes it survive a server restart or (in a multi-instance deployment) being
polled from a different instance than the one running the worker.

### 5–6. Polling flow & how it terminates

```
Angular                          Backend                     MongoDB
   │  POST /import                  │                            │
   │ ───────────────────────────►   │  validate + create job     │
   │ ◄─────────────────────────     │  (queued) ─────────────────►│
   │  { jobId, status: queued }     │                            │
   │                                │  processImportJob() starts │
   │  timer(0, 2000ms)              │                            │
   │   ├─► GET /import/:id/status ─►│  findById(jobId) ──────────►│
   │   │◄──────────────────────────  { status, progress, ... }   │
   │  wait 2s, repeat ...                                         │
   │   ├─► GET /import/:id/status ─►  status: "completed" ───────►│
   │  STOP polling                                                │
```

Termination is purely a function of `status`, never progress percentage — `queued`/`processing` keep
polling, `completed`/`failed`/`cancelled` stop. This is why a "0%, 0%, 0%, 40%, 70%, 100%" progress
sequence is fine.

### 7–8. Duplicate/overlapping requests & error handling — see Phase 6/7/8 and Phase 9 below, where the
actual implementation is documented (the design intent here didn't change, but the concrete operators and
guards did get filled in during the build).

### 9. Browser refresh — see Phase 10 below.

---

## Phase 2 — Backend model + APIs (implemented)

Built: `ImportJob` model, `POST /import`, `GET /import/:jobId/status`, `POST /import/:jobId/cancel`, all
admin-protected, registered before `/:id` in the routes file so a literal `import` segment is never
swallowed by the `:id` param route.

**Decisions made that changed the original plan:**

- **`errors` field renamed to `rowErrors` internally.** Mongoose reserves `errors` as the property it uses
  internally for document validation failures and warned on schema load ("reserved schema pathname"). The
  HTTP response still exposes the field as `errors` (the controller maps `rowErrors` → `errors` in
  `formatJobResponse`), so nothing about the API contract changed.
- **Excel library: `exceljs`, not `xlsx`/SheetJS.** npm's `xlsx@0.18.5` (the latest registry release) has
  two unpatched CVEs — prototype pollution and a ReDoS in its parser — that SheetJS never fixed on the npm
  registry (only via their own CDN tarball). Given this endpoint parses untrusted user-uploaded files,
  `exceljs` was used instead.
- **`.xls` dropped from the allowed extensions**, leaving only `.csv` and `.xlsx`. `exceljs` only reads the
  modern Open XML `.xlsx` format, not the legacy binary `.xls` format — accepting `.xls` at upload would
  have passed validation and then failed confusingly when a worker tried to parse it.
- **Row-count validation happens at upload time, not just at processing time.** `categoryImportFile.service.js`
  reads the header row and counts data rows before the `ImportJob` is even created — this is what lets the
  status endpoint report a real `totalRecords` from the very first poll (`queued` with `totalRecords: 4`),
  rather than `0` until the worker gets around to counting.

**Manually tested** (curl against the running dev server): valid CSV (`totalRecords: 4` correctly counted),
valid xlsx (`totalRecords: 3`), empty file (400, cleaned up from disk), missing required `name` column (400),
wrong extension (400), missing file field (400), missing auth token (401), unknown job id (404), malformed
job id (400), cancel-after-terminal (400). Existing `category.controller.test.js` suite (17 tests)
unaffected.

---

## Phase 3 — Background worker (implemented)

`categoryImportWorker.service.js`'s `processImportJob(jobId)`:

1. Guards: does nothing if the job isn't found or isn't still `queued` (e.g. already cancelled before the
   worker got a turn to run).
2. Flips `status: "processing"`, sets `startedAt`.
3. `for await`s rows from `categoryImportRowReader.service.js` — CSV is streamed row-by-row via Node's
   async-iterable stream support (`fs.createReadStream(...).pipe(csv())` is itself an async iterable);
   `.xlsx` is loaded fully into memory by `exceljs` (there's no true streaming random-access read for a
   worksheet), which is a known POC limitation flagged again in the Phase 12 checklist.
4. Every 5 rows (`PROGRESS_UPDATE_BATCH_SIZE`), persists `processedRecords`/`successfulRecords`/
   `failedRecords`/`rowErrors`/`progress` to Mongo, and checks whether the job's status has been flipped to
   `cancelled` in the meantime. This batching is *why* progress updates arrive in chunks (e.g. 0 → 45 → 65)
   rather than climbing one row at a time — checking Mongo on every single row would be needless overhead
   for a small POC file, but does mean cancellation can take up to ~5 rows to actually stop.
5. On natural completion, writes `status: "completed"` — but conditioned on `status: { $ne: "cancelled" }`
   so a cancellation landing in the narrow window between the worker's last cancellation check and this
   final write can't be silently overwritten back to "completed". Same conditional guard on the `failed`
   write in the `catch` block.

**Manually verified:** uploaded a 3000-row generated CSV, polled immediately (`processing`, `progress: 1`,
`processedRecords: 45`), issued cancel (server responded `cancelled` at `processedRecords: 65`), then
polled twice more 2s apart — `processedRecords` stayed at 70 both times, confirming the worker actually
stopped rather than continuing in the background.

---

## Phase 4 — Category business rules (implemented)

`upsertCategoryFromRow` in `categoryImportWorker.service.js`:

- Case-insensitive existing-category lookup (`^name$` regex, case-insensitive) → update its `description`
  in place. A missing-or-different-case match is treated as the same category, matching how the manual
  create/update UI already behaves (`category.controller.js` does the same case-insensitive check).
- No match → `Category.create(...)`. If that throws a Mongo `E11000` duplicate-key error (the unique index
  on `name` caught a race — e.g. a manual "Create Category" request landing at the same instant as an
  import row for the same new name), the row falls back to an update instead of being recorded as failed.
  **Why the unique index still matters even though the app already checks for an existing category first:**
  the index is the actual source of truth preventing two documents with the same name from ever existing;
  the `findOne`-then-branch logic is just the normal-path decision, and is inherently racy across concurrent
  requests without it.
- Missing/empty `name` after trimming → throws `"name is required"`, caught by the per-row try/catch in the
  worker loop, recorded into `rowErrors` as `{ row, message }`, `failedRecords` incremented — the loop
  continues, the job does not fail as a whole.

**Manually verified** with a 12-row file containing one row with no `name` and one in-file duplicate
(`Sports` appearing twice): job completed with `successfulRecords: 11, failedRecords: 1`,
`rowErrors: [{ row: 4, message: "name is required" }]`; only one `sports` category existed afterward, with
the description from its *second* occurrence in the file (confirming sequential same-file duplicates
resolve via the update path, not a second insert); a pre-existing `electronics` category had its
description updated rather than a duplicate being created.

---

## Phase 5 — Angular UI (implemented)

Added an "Import Categories" section to `admin-category.component.html`, between the existing
create/edit form and the "Existing Categories" table: file picker (`accept=".csv,.xlsx"`), selected
filename, Import button, an upload-progress bar (from the multipart upload itself), an import-progress bar
with `processedRecords / totalRecords (progress%)`, a completion summary (`successfulRecords`/
`failedRecords`, per-row errors listed as "Row N: message"), and Cancel/Dismiss buttons depending on job
status.

---

## Phase 6 & 7 — Polling and overlap prevention (implemented)

`CategoryImportService.pollImportStatus(jobId)` in `category-import.service.ts`:

```
timer(0, 2000ms)
  → switchMap(() => GET /status)
      → tap: remember last good job, reset failure counter
      → catchError: transient HTTP failure? re-emit last known job with networkError:true
                    (up to 3 in a row); permanent (400/404) or budget exhausted → rethrow
  → takeWhile(job => !terminal(job.status), inclusive: true)
  → catchError: budget exhausted → emit one synthetic terminal "failed" ImportJob
                (carrying forward last known counts) instead of an RxJS error
```

**Why each operator:**

- `timer(0, 2000)` — fires immediately on subscribe, then every 2s.
- `switchMap` — this is what prevents overlapping requests. `switchMap` only has one inner subscription
  (the HTTP call) alive at a time; since each inner call already runs to completion (an HTTP request
  completes on response), and the outer timer only produces one tick to switch to at a time, there is never
  a second status request in flight before the first one has resolved.
- `takeWhile(..., true)` — keeps the stream alive while non-terminal; the `true` (inclusive) argument
  ensures the terminal value itself still reaches the subscriber before the stream completes, rather than
  being swallowed on the tick that finally observes it.
- The two `catchError`s together implement Phase 8's retry behavior (below) while guaranteeing subscribers
  never need an `error:` callback — every failure path, including "gave up retrying," is delivered as a
  normal terminal `ImportJob` value via `next`.

**One deviation from the original design sketch:** the Phase 1 diagram listed `finalize(cleanup)` as part
of this pipe. In the actual implementation, `finalize` isn't used here — cleanup (removing the
`localStorage` job-id breadcrumb, refreshing the category list) happens directly in the component's
`.subscribe((job) => ...)` callback when a terminal status is observed, since that logic needs to
distinguish *which* terminal status occurred (only `completed` triggers a list refresh), which `finalize`
alone can't express. `finalize` **is** used elsewhere — in the component's `uploadImportFile(...)` call, to
reset `isUploading` regardless of upload success/failure.

Duplicate *job submissions* (as opposed to duplicate polling requests) are prevented client-side: `startImport()`
no-ops if `isUploading` or `isImportInProgress()` is already true. There's no server-side "one active job"
lock — flagged for Phase 12.

---

## Phase 8 — Error handling (implemented)

- Upload-time failures (bad extension, empty file, missing column, no auth) surface as an HTTP error on the
  `uploadImportFile` call itself, shown via `importFileError` — separate from any polling state.
- Polling failures are split into permanent vs. transient in `pollImportStatus`'s inner `catchError`:
  `error.status === 400 || error.status === 404` (invalid/unknown job id) skips the retry budget entirely
  and fails immediately, since retrying a request that will never succeed just delays the user seeing an
  error. Anything else is treated as transient and retried up to `MAX_CONSECUTIVE_POLL_FAILURES = 3` times,
  re-emitting the last known job state with `networkError: true` in between (rendered in the template as a
  small "(reconnecting...)" note) so a blip never gets mistaken for the import itself failing.
- Per-row failures (Phase 4) never fail the job; job-level failures (unreadable file, uncaught worker
  exception) always transition the job to `failed` with a `message` — the worker's `catch` block ensures a
  job can never be left stuck in `processing` after an unexpected exception.

---

## Phase 9 — Cancel (implemented)

- `POST /import/:jobId/cancel` (`categoryImport.controller.js`): 404 if not found, 400 if already terminal,
  otherwise sets `status: "cancelled"`, `message: "Cancelled by user"`, `completedAt`.
- The worker detects this by re-checking the job's `status` field every 5 rows (see Phase 3) — there is no
  separate "cancellation signal" mechanism (no event emitter, no AbortController) because the worker and
  the cancel endpoint already communicate through the one thing they both read/write: the `ImportJob`
  document in Mongo.
- Frontend `cancelCurrentImport()` calls the cancel endpoint and does **not** optimistically update local
  state — the next poll tick (within ~2s) observes `status: "cancelled"` from the server and the polling
  stream stops itself via `takeWhile`. This keeps the server's job document as the single source of truth
  instead of the UI guessing at what "cancelled" should look like before the worker has actually stopped.

**Manually verified** end-to-end (see Phase 3's verification note above) — cancellation on a 3000-row
import was observed to actually halt the worker, not just flip a flag while processing continued
unobserved in the background.

---

## Phase 10 — Browser refresh (implemented)

- `AdminCategoryComponent` writes the active `jobId` to `localStorage` (`categoryImport.activeJobId`) the
  moment tracking starts (`beginTrackingImport`), whether that's from a fresh upload or from resuming.
- `ngOnInit` calls `resumeImportIfAny()`, which reads that key and, if present, calls `beginTrackingImport`
  again — starting a fresh `pollImportStatus` stream that immediately fetches the current status (the
  `timer(0, ...)` fires right away) and either resumes polling or, if the job had already reached a
  terminal state while the tab was closed, reports that immediately.
- The key is removed as soon as any terminal status is observed, so a later refresh doesn't try to resume a
  finished job.
- Scope: per-browser-tab via `localStorage` (shared across tabs on the same origin, not per-user or
  per-device) — sufficient for a single-admin POC, called out as a Phase 12 concern if multiple admins need
  isolated job tracking.

---

## Testing performed so far (ad hoc — not Phase 11's formal checklist)

Backend, via curl against the running dev server: valid CSV upload, valid xlsx upload, status polling,
cancel + re-cancel-rejected, unknown/malformed job ids, empty file, missing required column, wrong
extension, missing file field, missing auth token, a 12-row file with one bad row + one in-file duplicate,
a 3000-row file cancelled mid-flight. Frontend: `ng build` succeeds with no new errors/warnings; one
Playwright smoke pass (temporary, not committed to the project) confirmed file-select → upload → "Import
completed" renders correctly end-to-end in a real browser.

Test data created during this process (throwaway bulk/UI-test categories) was deleted from the dev database
afterward; the small sample-data categories matching the original spec's example file were left in place.

---

## Remaining

- **Phase 11** — the formal test checklist from the original spec (0→0→0→100 progression, large files,
  network error simulation during polling, etc.) has not been run as a discrete pass.
- **Phase 12** — production hardening review (Mongo indexes, file storage/retention, filename sanitization
  edge cases, rate limiting, per-user job ownership, graceful shutdown, the Redis/BullMQ evolution path) has
  not been done. Several concerns it will need to address are already flagged inline above (no server-side
  duplicate-job lock, `.xlsx` fully loaded into memory, `localStorage` scope, no upload retention policy).
