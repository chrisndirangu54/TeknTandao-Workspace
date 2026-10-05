# Smart Intake — Multimodal Business Ingestion

Smart Intake converts business evidence into structured, reviewable TeknTandao records.

## Supported inputs

- photos: JPEG, PNG and WebP
- documents: PDF
- structured/text files: CSV, JSON and TXT
- natural-language instructions from authenticated workspace users
- authenticated IoT/API payloads through the Business Ingestion webhook

Files are limited to 12 MB. Browser/mobile clients upload through short-lived signed Cloud Storage PUT URLs; generic Storage client write access remains disabled.

## Supported record targets

The first production-safe target set is:

- assets
- inventory / stock
- expenses
- sales
- support tickets
- generic installed app records

The extractor returns a proposal containing confidence, evidence, warnings and provenance. Nothing is committed automatically.

### Sensitive transaction behavior

Sales and expenses are intentionally different from ordinary master data.

- **Expenses** are committed to the Expenses app as `DRAFT / draft_review` records. They are not posted to the accounting ledger.
- **Sales** are committed to `saleDrafts`, not `sales`. A Smart Intake import therefore cannot decrement stock, create invoices, mark payments as settled or inflate revenue reporting. A user must complete the dedicated POS workflow to execute the sale.

## AI extraction

Smart Intake uses the configured `GEMINI_API_KEY` and `GEMINI_MODEL`.

The prompt:

- forbids invented values;
- converts clearly stated major monetary units into minor units;
- lowers confidence for ambiguous/blurred/handwritten evidence;
- treats source text as untrusted data and ignores instructions embedded inside uploaded content;
- never posts accounting entries or marks payment as verified;
- returns a closed JSON extraction schema.

Low-confidence records receive explicit warnings and remain user-selectable during review.

## Duplicate handling and provenance

Every proposal is content-digested. Re-processing the same normalized source returns the existing proposal instead of creating another.

Committed records contain:

- source proposal id;
- source type;
- proposal record index;
- extraction confidence;
- extraction evidence;
- committing user;
- timestamps.

Uploaded private evidence is retained for 30 days and then purged by `purgeExpiredBusinessIntakeSources`. The extracted proposal remains after source purge.

## IoT / API ingestion

Workspace owners can create ingestion keys from Smart Intake. A key is returned **once** and only its SHA-256 hash is stored.

Example:

```http
POST /businessIngestionWebhook
Authorization: Bearer ti_ing_<id>.<secret>
Content-Type: application/json
```

Natural-language or arbitrary IoT payload:

```json
{
  "text": "Cold room sensor CR-02 reports 7.8 C at Warehouse A"
}
```

Structured proposal payloads can also send `records` matching the same closed extraction schema.

The webhook:

- limits requests to 256 KB;
- caps each ingestion key at 5,000 requests/day;
- creates review proposals only;
- never commits records by itself;
- supports key revocation by workspace owners.

## Security model

Smart Intake uses existing workspace membership and installed-app authorization at commit time.

Important boundaries:

- LLM output cannot bypass app permissions.
- IoT/API keys cannot directly write operational collections.
- payment, accounting and sale execution are not exposed through the generic ingestion commit path.
- source uploads remain private; Storage rules still deny generic client reads/writes.
- ingestion bearer tokens are not stored in plaintext.
- committed IDs are deterministic by proposal/index, making retries idempotent.

## User workflow

1. Open **Smart Intake** from the workspace header.
2. Add a photo/document or describe the record in natural language.
3. Review extracted records, confidence and warnings.
4. Deselect anything incorrect.
5. Commit approved records.
6. For financial/transaction drafts, continue through the relevant dedicated application workflow.

