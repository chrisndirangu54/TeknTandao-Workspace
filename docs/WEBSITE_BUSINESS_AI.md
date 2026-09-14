# Website Business AI

TeknTandao Website Studio is connected to the shared Business Graph, Inventory, sales performance, website analytics and Agent Control Center through a governed `website_operator` agent.

## Product principle

The website is not treated as an isolated design artifact. It is a runtime surface over the organization's operating data:

`Business Graph + Inventory + Sales + Website Analytics → Website Business Operator → Website JSON / Product proposals → Agent Control Center → audited execution → Graph + Event Bus + live website CMS`

This allows the website to build and merchandise itself from real business state while preserving human control over database and public-production changes.

## Privacy-safe business context

`getWebsiteBusinessContext` assembles the context used by the operator from:

- aggregate Business Graph node/edge counts grouped by type, source app and relation,
- the inventory product catalogue,
- per-product sales units and revenue,
- aggregate sales and e-commerce revenue,
- low-stock and visibility counts,
- aggregate website views and conversions,
- the current website JSON and publication revision.

Raw customer, employee and other person-level Business Graph records are not sent to the model. The AI receives graph aggregates rather than customer PII.

## AI planning

`generateWebsiteBusinessPlan` uses the configured Gemini model and requires a complete schema-valid result containing:

- a full proposed website JSON document,
- rationale and optimization goal,
- zero or more product create/update mutations,
- a publish recommendation.

The response passes through the same closed website schema as the visual editor. Scripts, HTML, CSS, Dart, unsafe URLs and unknown product fields cannot enter the runtime through the AI path.

Product prices use KES minor units. For example, KES 1,250 is stored as `125000`.

## Live Inventory → Website projection

Inventory is projected to a system-managed CMS collection:

`websiteCmsCollections/business_products`

Each Inventory product becomes a CMS entry. A product is publicly returned only when both `active` and `websiteVisible` are not false. Public website fields include product ID, name, SKU, description, category, unit, image, price, stock, featured state and SEO copy. Internal merchandising controls such as reorder level and `websiteVisible` are not returned as public CMS fields.

The Firestore `syncInventoryProductToWebsite` trigger keeps this projection updated after Inventory changes. `refreshWebsiteBusinessCatalog` provides an explicit backfill/reconciliation operation.

Website components can bind to live products using `dataCollection: "business_products"` with normal runtime bindings such as `{{name}}`, `{{description}}`, `{{price}}`, `{{stock}}` and `{{imageUrl}}`. Product edits therefore update bound website surfaces without rebuilding the Flutter application.

## Agent Control Center governance

The default `website_operator` policy allows:

- `website.document.apply`,
- `website.publish`,
- `record.create`,
- `record.update`,

scoped to Website Builder and Inventory.

By default, website draft application is allowed without manual approval, while public publishing and product creates/updates require human approval. Owners can further restrict or disable the policy through the shared Agent Control Center.

`requestWebsiteBusinessAction` writes to the same `agentAudit`, `agentApprovals` and `agentPermits` collections used by the rest of the platform. There is no second approval system.

## Approval binding and stale-write protection

Website AI approval requests are bound to a SHA-256 digest of the exact **validated execution payload**. The shared `executeAgentAction` runtime recomputes that digest before executing. A permit approved for one product edit cannot be reused for a different edit.

AI website changes also carry `expectedRevision`; if another editor has changed the website since the AI plan was generated, the operation fails rather than overwriting newer work. Applying a full AI document advances the CRDT collaboration epoch so stale collaborative operations cannot later replay over the new base.

AI product updates carry a digest of the product state used during planning. Before writing, the executor hashes the current product. If it has changed since planning—for example because a sale changed stock—the AI mutation fails and must be regenerated. Product creates also fail if the chosen record ID already exists.

## Execution and observability

Successful governed actions write the same execution/audit records as other agents and emit Business Event Bus events. Inventory records continue through the existing Business Graph projection, so AI-created or AI-edited products become part of the shared graph and downstream automation substrate.

The Website Studio exposes a dedicated **AI Business Operator** view with:

- Business Graph/product/site metrics,
- natural-language goals,
- presets for business-driven redesign, conversion optimization, product creation and product editing,
- generated plan rationale,
- per-product change requests,
- Agent Control Center approvals,
- approve-and-execute controls,
- recent plan history.

## Configuration

AI planning requires:

- `GEMINI_API_KEY`
- `GEMINI_MODEL`

All database execution, product projection and Agent Control Center governance work independently of the model provider once a validated plan exists.

## Deliberate safety boundary

The Website Business Operator does not gain generic payment, tax-filing or arbitrary-code permissions. The shared safe executor continues to reject actions such as `payment.send` and `tax.file`; regulated financial or fiscal operations must use their dedicated workflows and approval/certification controls.
