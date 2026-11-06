# Single-site MikroTik + FreeRADIUS laboratory guide

## Scope
This Docker Compose file starts a **local laboratory FreeRADIUS image**. It does not register a production NAS, create any users, configure a SQL backend, run a payment service, or activate an internet hotspot. The default image configuration must be reviewed before use. Do not expose UDP/1812 or UDP/1813 publicly.

## Lab prerequisites
- Dedicated, physically or logically isolated guest VLAN; deny any route into staff, point-of-sale, CCTV or router management VLANs.
- MikroTik RouterOS with a working hotspot server in an isolated lab, and an operator-accessible FreeRADIUS host.
- An IPsec/WireGuard/private network route from NAS to RADIUS server; a public browser is not a RADIUS peer.
- Per-NAS generated strong shared secret kept outside Git; unique test accounts in an isolated FreeRADIUS authentication database.
- Verified logs for RADIUS Access-Accept/Reject, Start/Interim/Stop accounting, timeouts, duplicate packets and disconnections.

## Startup (localhost-only)
Run `docker compose -f infrastructure/hotspot-radius/compose.lab.yml up -d`.
Provide a reviewed FreeRADIUS configuration and explicit NAS definitions before doing authentication tests. This is **not** plug-and-play production service.

## RouterOS lab integration (illustrative commands only — tailor to your interface, routing and device)
```routeros
# Replace parameters; never paste secrets into ticket logs.
/radius add service=hotspot address=<PRIVATE_RADIUS_IP> secret="<PER_NAS_SECRET>" authentication-port=1812 accounting-port=1813
/ip hotspot profile set [find name="<YOUR_HOTSPOT_PROFILE>"] use-radius=yes radius-accounting=yes radius-interim-update=received
```
The hotspot must use VLAN isolation and an explicitly reviewed firewall policy. Confirm any local HotSpot users cannot bypass the intended policy.

## RADIUS policy
Return `Session-Timeout` based on plan duration (seconds), `Mikrotik-Rate-Limit` in upload/download orientation, and, after validating the accounting backend, `Acct-Interim-Interval` appropriate to the installation. Enforce concurrent sessions centrally; a UI maxDevices integer is not equivalent to NAS-enforced simultaneous-use.

## Secure authorization lifecycle
1. Identify the site from a registered NAS profile, not from request-supplied site IDs.
2. Issue vouchers only after authorized operator actions; for paid plans, require provider-verified receipt and amount reconciliation.
3. Persist a redeemed/issued state with a single atomic transition and session binding. This endpoint is **not implemented**.
4. Provision FreeRADIUS credentials only on a private service with independently authenticated instructions. Do not export raw admin-created voucher codes to SQL from the public site.
5. On expiry or revoke, invalidate RADIUS authorization and terminate existing sessions through separately tested NAS-specific disconnect/CoA where supported.
6. Maintain an append-only audit record of activation and termination attempts, including error and replay states.

## Pilot exit criteria
- Test one real MikroTik device and one isolated FreeRADIUS instance.
- Run 100 authorization/denial cycles with zero unauthorized Access-Accept responses.
- Validate configured speed limits from a client device, including uplink/downlink direction.
- Confirm timeout, expired/revoked voucher rejection, simultaneous-use handling and disconnect.
- Reconcile counters against gateway records after packet loss/retry; sample totals are non-billable.
- Verify charge, cancellation and retry behavior with M-Pesa sandbox first.
- Only then consider controlled production rollout with regulatory and carrier agreements.

MikroTik RADIUS: https://help.mikrotik.com/docs/spaces/ROS/pages/328097/RADIUS
MikroTik HotSpot: https://help.mikrotik.com/docs/spaces/ROS/pages/56459266/HotSpot+-+Captive+portal
FreeRADIUS documentation: https://doc.freeradius.org/
