# RADIUS gateway deployment blueprint (NOT an active router configuration)
# Architecture: RouterOS/UniFi NAS -> FreeRADIUS (private network/VPN) -> SQL session ledger -> signed collector -> Firebase
# Install FreeRADIUS 3.x/4.x according to your distro, with SQL module and RadSec/VPN transport where supported.
# Configure NAS secrets ONLY in FreeRADIUS server-side secret storage.
# Never expose UDP/1812 or UDP/1813 to the public Internet.
# Core RADIUS reply attributes for MikroTik RouterOS hotspot:
# Session-Timeout = plan duration in seconds
# Mikrotik-Rate-Limit = upstream/downstream (e.g., 2M/10M)
# Acct-Interim-Interval = 300
# Simultaneous-Use control requires the SQL accounting backend and validated concurrency enforcement.
# Accounting events are forwarded to hotspotAccountingIngest as JSON with:
# x-hotspot-signature: hex(HMAC-SHA256(HOTSPOT_COLLECTOR_HMAC_KEY, rawRequestBody))
# Collector must supply eventId unique across retries; duplicate events return duplicate:true.
# The hotspot site must be marked active and collectorNasId must match the registered NAS.
# Current admin UI creates sites as planned; no operator promotion endpoint or RADIUS writer is deployed.
# Never permit activation based on a customer-originated transaction screenshot or client callback.
