# Hospital clinical AI — controlled integration

This implementation is isolated within the TeknTandao Workspace hospital tenant. It does **not** connect to Regen Insight or enable autonomous diagnosis or prescribing.

## Available in this branch
- Hospital Clinical AI dashboard tab for authorized staff
- Server-side active hospital subscription/membership checks
- Separate verified clinician role registry at `organizations/{orgId}/hospitalClinicalStaff/{uid}`
- Scoped consent at `organizations/{orgId}/hospitalClinicalConsents/{patientId}_{uid}`, with `granted=true`, `scopes=['clinical.ai.assist']`, expiry and revocation controls
- MedGemma model cards and clinician review queue; no inference or clinical claims generated
- Tenant-scoped evidence registration and approved-reference retrieval
- Clinician evaluation log, explicitly marked not clinically approved
- Tenant-scoped audit records; no raw clinical notes sent to a model

## Research models and citations
- Google MedGemma 1.5 4B: https://developers.google.com/health-ai-developer-foundations/medgemma/model-card
- Google MedGemma 27B: https://developers.google.com/health-ai-developer-foundations/medgemma/model-card-v1
- Google MedSigLIP: https://developers.google.com/health-ai-developer-foundations/medsiglip (not integrated)
These are **research foundations, not clinically accredited products**.

## Further engineering and authorization required
1. Secure hospital-owned or appropriately contracted GPU-serving infrastructure, pin exact model revisions and licensing, implement PHI handling and clinician review.
2. Implement signed PubMed metadata retrieval and independently reviewed WHO/MoH/CDC evidence packs. PubMed metadata is not clinical endorsement.
3. Add scoped SMART-on-FHIR/OAuth2 integrations with institutional agreements, tenant mapping, patient matching and consent. Hospital patient IDs alone must never authorize retrieval.
4. Medical image/microbiology modules require licensed, geographically representative datasets, independent external-site evaluation, subgroup analyses, clinician ground truth, calibration and prospective assessments.
5. Security tests: cross-tenant denial, expired consent, clinician revocation, rate limiting, audit verification, data retention, secrets management and penetration testing.
6. Do not merge or deploy as a validated medical device without institutional clinical governance and applicable regulatory review.

The separate Hulka research tools may be reused through a future **contractually authorized** adapter, but no patient record exchange or model hosting has been enabled in this branch.
