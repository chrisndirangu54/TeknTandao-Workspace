# Hotspot pilot commissioning and security checklist

## Deployed source versus operational capability
Committed source: Firebase hotspot administration, voucher inventory, validation, RADIUS policy mapping, HMAC-authenticated accounting intake and tests. None of this certifies working router control or a payment-verified captive portal.

## Commissioning sequence
1. Configure a dedicated guest VLAN/subnet and deny lateral movement to production LANs, POS terminals, cameras and administration ports.
2. Install FreeRADIUS and an SQL-backed accounting database on private infrastructure. Provision a distinct shared secret for each authorized NAS, with encrypted transport across untrusted links.
3. Connect a laboratory MikroTik gateway configured to use the RADIUS server for hotspot authentication and accounting. Capture actual attribute and interim-accounting behavior.
4. Register the NAS identity in the platform as a reviewed site setting. Current site records are planned by default, and the accounting collector intentionally refuses unregistered/inactive sites. This registration workflow still needs implementation.
5. Deploy Firebase Functions, set the HOTSPOT_COLLECTOR_HMAC_KEY server-side secret, and configure a private collector to POST exact UTF-8 JSON bytes with an HMAC-SHA256 signature in x-hotspot-signature. Never expose signing keys in Flutter or the public website.
6. Confirm duplicate event IDs are idempotent and bad signatures, foreign NAS IDs, stale timestamps and malformed counters are rejected.
7. For voucher redemption, do not use the current unissued record alone to grant Wi-Fi. Implement RADIUS credential lifecycle, server-side redemption state and concurrent session limits.
8. For M-Pesa, use authenticated Safaricom STK initiation and provider-side status/receipt validation. Match amount, checkout ID, receipt, merchant account, plan and voucher; enforce idempotency. An STK callback or customer screenshot must never independently mark a payment as settled.
9. Run tests on a laboratory network, including revocation, disconnection/CoA, expiry, reconnection, lost accounting packets, a gateway outage and clock skew.
10. Publish live product and pricing only after ISP licensing/carrier arrangement, privacy notices, support obligations and site installation are confirmed.

## Security boundaries
- Firestore client writes to privileged collections are denied by existing deny-all rules.
- Keep management links on VPN/private segments, restrict firewall source IPs, use per-site credentials and rotate secrets.
- Minimize or pseudonymize client identifiers and retain usage logs for only a documented period.
- No live router commands, payment collection, or session activation are implemented by this phase.

## Developer tests
`cd functions && npm test` (requires dependency installation). Tests are committed but not executed in this session.
