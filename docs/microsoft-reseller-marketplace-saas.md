# Microsoft Reseller Marketplace & SaaS — implementation and activation

This capability has two independent, tenant-scoped audiences.

## Customer checkout journey (Workspace)

Public marketing: `https://tekntandao.com/microsoft-products.html`.
Signed-in quote dashboard: `https://tekntandaoworkspace.web.app/?module=microsoft-marketplace&seller=tekntandao`.

Customers sign in with a verified email and use their **own** Workspace organization to choose product families, enter seat counts, receive deterministic or optional Gemini recommendations, submit an idempotent quote request, review a verified manual supplier quote, approve it and track the order. They never acquire Microsoft licenses merely by using this interface.

## Reseller SaaS

Approved reseller organizations open `?module=microsoft-reseller-saas`. Their workspace owner publishes an isolated store using `publishMicrosoftResellerMarketplace`. Only an organization with `resellerAccounts/{orgId}.enabled: true` can publish or administer a storefront. The platform owner's `tekntandao` slug additionally requires the bootstrap super-admin authorization claim.

Each seller's orders live under `organizations/{sellerOrgId}/microsoftSales`; each customer copy lives under `organizations/{buyerOrgId}/microsoftPurchases`. All reads and changes go through callable APIs; client direct Firestore writes remain denied. The server checks organization membership, seller-owner permission, store approval, quote expiry and idempotency before any state change. The seller can issue a quote only after attesting a real current SKU/offer, supplier quote reference and verified commercial terms.

## Workflow automation & AI

1. Need-to-product matching uses `draftMicrosoftResellerAdvice`; it is deterministic and explains the recommended families.
2. `microsoftMarketplaceAiAdvisor` optionally enriches discovery with a Gemini-generated advisory JSON brief, using existing `GEMINI_API_KEY` and `GEMINI_MODEL` configuration. The model receives only validated broad needs, seat count and family names—not customer names, emails, API tokens or payment data.
3. New orders are stored as `quote_requested`, then `quote_ready`, then `customer_accepted_pending_partner_order`.
4. After the provider processes the order, an authorized reseller owner may enter order reference, Microsoft Customer Agreement evidence and entitlement evidence and transition to `manually_provisioned`.

This is a **quote-first, self-service order request workflow**. It does not collect payments or place Microsoft orders automatically. Customer approval of a quote is not confirmation of Microsoft Customer Agreement acceptance.

## Important Microsoft commercial/API constraints

Microsoft's Partner Center API documentation says indirect resellers do not have direct Partner Center API access. If TeknTandao is an **indirect reseller**, the authorized indirect provider normally places the Microsoft purchase. Both reseller relationships and the applicable Microsoft Customer Agreement must be verified.

Before enabling payment or automatic licence provisioning, complete and test:

- Actual partner role and indirect-provider contract/authorization.
- Reseller and provider relationship with each customer, and verified Microsoft Customer Agreement status.
- The authorized provider's contract/API, identity model, permitted countries, offer/SKU eligibility, available quantities, billing terms and return policy.
- Secure OAuth/secret storage, MFA and secure application model (where applicable), integration sandbox and request idempotency.
- Provider-side price verification, checkout consent, payment reconciliation, taxes, invoices and refunds.
- Supplier order receipt verification, subscription reconciliation, license handover, renewal notifications and incident alerts.
- Subscription billing and tenant onboarding/approval for other reseller SaaS customers.

No partner credentials or live Microsoft SKU prices have been supplied; therefore no direct payment/provisioning integration has been enabled.

## Operations & setup

1. Deploy Firebase Cloud Functions from the Workspace `suite` codebase using the approved deployment pipeline.
2. As platform operator, enable the correct `resellerAccounts/{orgId}` entry via the existing privileged reseller-admin control.
3. Open `?module=microsoft-reseller-saas` in the TeknTandao organization and publish the reserved `tekntandao` alias.
4. Invite customers to sign up for Workspace and follow the site link. The customer's Workspace organization is distinct from the reseller organization.
5. Independently verify supplier SKUs and prices before issuing quotes.
6. To offer the product as SaaS, approve each reseller organization separately and have it publish its **own** slug. Reseller accounts cannot see each other's customer records.
7. To activate live checkout, integrate through a legally/technically authorized provider channel, build a verified payment and provisioning adapter, and add reconciliation and approval tests **before** enabling a production feature flag.

### Cloud Functions
`getMicrosoftResellerMarketplace`, `publishMicrosoftResellerMarketplace`, `recommendMicrosoftMarketplace`,
`microsoftMarketplaceAiAdvisor`, `submitMicrosoftSelfServiceRequest`,
`getMicrosoftBuyerOrders`, `getMicrosoftSellerDashboard`,
`issueMicrosoftVerifiedQuote`, `acceptMicrosoftVerifiedQuote`, and
`confirmMicrosoftManualProvisioning`.

### Source of truth
Reseller account approval and the provider's actual licensed/eligible SKU catalog are the source of truth, **never** marketing page examples or AI-generated suggestions.
