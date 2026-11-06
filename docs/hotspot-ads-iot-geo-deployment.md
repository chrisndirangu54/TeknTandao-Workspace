# TeknTandao Hotspot SaaS: paid, sponsored, IoT and geospatial pilot

**Status:** Integrated source code on GitHub. **NOT** confirmed deployed, certified, production-ready, or connected to a physical MikroTik, FreeRADIUS server, Paystack merchant account, Firebase project, sponsor ad network, IoT gateway, or NASA POWER live fetch in this session.

## Platform model and tenants
Every operator is represented by a Workspace organization. Sites, plans, vouchers, sponsored campaigns, rewards, IoT devices, environmental snapshots, RADIUS sessions, access records and audits are isolated beneath `organizations/{orgId}/hotspotV2/control`. Super-admin legacy hotspot records are not migrated automatically. The backend checks organization membership and enforces owner/admin roles; public sponsored endpoints additionally require Firebase Auth and Firebase App Check.

### Access choice
| Path | Customer action | Technical authorization | Commercial readiness |
|---|---|---|---|
| M-Pesa test | Operator initiates Paystack **test** M-Pesa charge; Paystack server verification and signed webhook check reference, amount, KES, channel and test status | Atomic voucher issuance; second administrator lab approval; RADIUS validates payment | Sandbox only, no production merchant payouts |
| Sponsored | Customer opts in, chooses approved campaign, views creative and waits server-determined dwell; reward claim enforces daily and campaign caps | Generates one-time zero-price short-life lab voucher; signed RADIUS gateway checks code, state, time and site | Reward issuance measured, **not independently verified ad impressions**; **no sponsor invoicing/settlement** |
| Free lab | Two-person approved short-lived free test plan | Authenticated RADIUS validation | Lab only |

A customer never pays by merely viewing an advertisement. Paystack and advertisements are alternative access paths. The site operator must provide a free plan and approved campaign for sponsored access. Sponsor campaigns require **independent second-admin approval** and can be paused immediately for **new** rewards.

### Sponsored access anti-abuse and privacy
- Public sponsor calls require Firebase App Check, authenticated Firebase user (anonymous sign-in is supported), explicit consent, an active approved campaign and verified lab site.
- Campaign reward counts are atomically capped. Each auth UID can claim at most 3 sponsored rewards per UTC day.
- A server-side 8–90-second time gate restricts reward claims. It **does not prove real ad attention**. A user may create new anonymous accounts; App Check does not eliminate fraud. Use sponsorship contracts based on reconciled issued/used passes, not unverified impressions.
- A sponsor's external ad creative is loaded **after** explicit opt-in; third-party creative hosts may receive requests and links may have separate privacy policies.
- No browser history, device MAC or location tracking is collected by this sponsor path. The backend records authenticated UID to enforce limits and maintains audit records; publish appropriate notices and retention rules.

## Configure website guest experience
In `chrisndirangu54/HTML/assets/js/site-config.js` set:
- `hotspotWorkspaceFirebase`: public Firebase Web app configuration for the **Workspace functions project**, not the TeknTandao brochure Firebase project.
- `hotspotAppCheckSiteKey`: registered reCAPTCHA v3 site key for the website domain and Firebase App Check.
- Configure Firebase Authentication Anonymous provider in the Workspace Firebase project and authorize the public website domain.
- Deploy `hotspot-sponsored.html` and link it from `hotspot-portal.html`; the guest page expects `?org=<workspace-id>&site=<site-id>` or manual IDs.
Do **not** put Paystack keys, NAS secrets, service-account keys, or IoT secrets in public configuration.

## Commission a real lab gateway
1. Deploy Firestore rules and Firebase functions to a **test** Workspace Firebase project and review IAM/app secrets.
2. Register a site, configure isolated guest VLAN and private MikroTik/FreeRADIUS NAS, and complete `hotspotV2CommissionSite` using *actual measured tests*.
3. Submit evidence with `hotspotV2RequestLabGateway`; a different organization admin uses `hotspotV2ApproveLabGateway`. These are **human attestations**, not remote hardware verification.
4. Admin calls `hotspotV2RotateBridgeKey`. Save the returned **one-time per-site HMAC secret** in the private FreeRADIUS bridge environment variable `HOTSPOT_RADIUS_BRIDGE_HMAC_KEY` and nowhere else. Rotation invalidates prior signatures for **that site**.
5. Configure `infrastructure/hotspot-radius/bridge.env.example` privately, including the HTTPS functions URLs `hotspotV2RadiusAuthorize` and `hotspotV2RadiusAccounting`, organization/site/NAS IDs. Review `hotspot_rest.example`, configure FreeRADIUS NAS shared secret and actual virtual server authorization/accounting policy.
6. Start `compose.bridge.yml` on an isolated host. Do not expose its REST port or RADIUS shared secret to the public internet.
7. Generate an authenticated *test-only* or sponsored voucher; the voucher ID is the RADIUS user name, the one-time code is the password. Verify Access-Accept and Access-Reject, RouterOS upload/download rate limits, session timeout, accounting Start/Interim/Stop and gateway sessions.
8. Never bypass the approval workflow by setting Firestore fields manually.

### Production-quality disconnection (optional, disabled by default)
- The privileged `infrastructure/hotspot-radius/disconnect-worker.mjs` watches second-administrator-approved `gatewayRequests` for revoked vouchers, matches signed recorded open sessions by tenant/site/NAS, and uses `radclient` with a local secret file and a **private RFC1918 NAS IPv4** address to request Disconnect-ACK.
- `compose.disconnect.lab.yml` includes separate worker build and file mounts, with `HOTSPOT_DISCONNECT_ENABLED=false` by default.
- Provide restricted Firebase service-account credentials and an NAS secret file with **0600 permissions** readable by the service identity. If no valid matching session or ACK exists, the worker records manual review rather than a false successful disconnect.
- Rotate NAS secrets and check dynamic authorization/CoA support on the real RouterOS firmware before enabling execution. A RADIUS Disconnect-ACK is not proof that every end-user packet stopped; verify against client behavior and logs.

## Payment verification and operator settlement
- `HOTSPOT_PAYSTACK_TEST_SECRET` must use a **test** secret key. Current code rejects live Paystack keys.
- Signed Paystack `charge.success` webhook triggers a *fresh* server-to-provider Verify Transaction request. The backend verifies reference, KES amount, mobile-money channel, test domain, customer email, and unique transaction claim atomically before issuing the voucher.
- A second admin must approve a paid **lab** pass before it can be admitted by RADIUS.
- Direct Safaricom STK callbacks remain **untrusted evidence**; a query result alone does not verify merchant and settlement. Do not change that safety invariant.
- Multi-operator production payouts still require verified merchant onboarding, per-tenant settlement ledger or approved subaccounts/transfers, platform fee configuration, refund/chargeback reconciliation, customer receipts, and regulatory review. No live Paystack or Daraja settlement is claimed here.

## AI, data science and operational monitoring
- `hotspotV2RegisterIoTDevice` issues an HMAC signing secret once, and `hotspotV2IoTIngest` accepts signed site-scoped readings for WAN state, wireless signal, packet loss, battery, client count, and environmental measurements.
- See `send_hotspot_telemetry.py`: send **actual** sensor/gateway metrics as JSON via HTTPS; no fabricated readings are generated.
- `hotspotV2OperationsIntelligence` computes occupancy median/MAD anomaly flags, 95th-percentile observed latency, outage sample counts, a bounded uncalibrated one-hour planning estimate, sponsor reward counts and backlog, with 100-record sample caveats.
- Suggestions are deterministic rule-based recommendations, not a trained ML model. Missing security counters are reported as unknown, never made up as zero. Later introduce an independently validated model registry and calibration datasets before AI controls any network.
- Signed IoT messages verify possession of a stored device secret, **not sensor calibration, physical provenance, or independent NAS attestation**. Revoke compromised devices using `hotspotV2DisableIoTDevice`.
- `hotspotV2SetSiteCoordinates` records site coordinates with provenance; `hotspotV2RefreshNasaPower` fetches cached NASA POWER daily **historical gridded** 2m temperature, rainfall, 10m wind and solar radiation for approximate site energy planning and environmental context. This is not a real-time satellite feed or local measurement.

## Acceptance criteria before commercial pilot
1. **Security:** unauthorized tenant, unsigned RADIUS, expired/forged voucher, replayed nonce, unpaid voucher and revoked voucher => zero unauthorized Access-Accepts over 1,000 controlled tests.
2. **Payments:** duplicate webhooks and reconciliation retries never double-issue, charge wrong merchant/amount never issues, refunds/chargebacks revoke according to approved commercial policy.
3. **Ads:** no free rewards without explicit consent, App Check and active campaign; operator-funded reward pool and actual internet delivery measured; spoofed views not billed.
4. **Network:** upload/download shaping, session expiry, concurrent device limits, WAN failover, NAT and VLAN isolation, accounting rollover, real NAS disconnection and recovery verified on physical hardware.
5. **Operations:** device telemetry accuracy, data freshness, alarms, backups, key rotation and disaster recovery exercised; independent access audit.
6. **Compliance:** carrier/upstream provider contract, privacy/retention notices, payment merchant agreements and relevant Kenyan telecom/licensing review.
7. **Software:** passing Node syntax/tests, Firestore emulator rules, Flutter analyzer/tests, end-to-end Firebase Functions integration tests and deployed staging acceptance checks.

## What remains unverified
All provider credentials, App Check settings, physical sensors, MikroTik devices, FreeRADIUS NAS and production merchant settlement must be configured by an authorized operator. No full test/deployment has run in this conversation. **Do not market the current GitHub code as a fully operational commercial hotspot platform until the gates above pass.**

### Technical references
- Paystack mobile money M-Pesa: https://paystack.com/docs/payments/payment-channels/
- Paystack server-side verification: https://paystack.com/docs/payments/verify-payments/
- FreeRADIUS radclient: https://www.freeradius.org/radiusd/man/radclient.html
- NASA POWER API: https://power.larc.nasa.gov/docs/tutorials/service-data-request/api/
