# Namecheap reseller integration

## Status
Feature branch only; not merged or deployed. Domain availability and registrar-price queries are sandbox-only. Domain purchases and hosting provisioning are disabled.

Namecheap allows domains to be resold through its API without a formal domain reseller program. Its domain API supports search, registration, renewal and DNS, with an independently implemented retail checkout.

Reseller hosting is provided through an active Namecheap reseller hosting plan with WHM/cPanel access, separate from the registrar API. WHM API access and package provisioning have not been configured.

## Workspace features

- namecheapCheckDomain: signed-in organization owner; Namecheap sandbox domain check and premium indicator; does not guarantee live availability.
- namecheapGetDomainPrice: sandbox Namecheap users.getPricing; returns USD registrar cost, not a KES customer quotation.
- namecheapSubmitResellerRequest: tenant-scoped domain or hosting request awaiting quote, without provider purchases.
- namecheapListResellerRequests: tenant-scoped status list.
- Flutter Namecheap reseller storefront: search availability and request domain or hosting quotes, reached from Managed Cloud.

## Required secure configuration

Use Firebase Secret Manager to configure:
- NAMECHEAP_SANDBOX_API_USER
- NAMECHEAP_SANDBOX_API_KEY
- NAMECHEAP_SANDBOX_CLIENT_IP

Namecheap API requires whitelisting a STATIC outgoing IPv4. Firebase Functions do not guarantee static egress automatically; configure Cloud NAT or a controlled static egress gateway before real calls. Keep Namecheap API URL query arguments out of request logs; they contain API credentials.

## Production purchase prerequisites

1. Obtain approved production API access from Namecheap. Requirements typically include 20 domains or USD 50 balance/spend; ask support for alternatives.
2. Confirm fresh live domain availability and cost, including any premium prices, ICANN fees, TLD registration rules and USD/KES currency conversion.
3. Issue a locked customer KES quotation including taxes and margin.
4. Collect explicit customer consent, approved registrar contact data, terms and verified Paystack/M-Pesa settlement tied to the EXACT domain/hosting order. The current cloud subscription payments are separate and cannot authorise domain purchases.
5. Use an idempotent, reviewed provisioning worker to invoke Namecheap domains.create or domains.renew, reconcile the registrar order after uncertain API results and never automatically retry a purchase.
6. For hosting: validate dedicated WHM credentials, Namecheap reseller quota, mapped hosting packages and account credentials, then provision via authorised WHM APIs only after settlement.
7. Add DNS management, customer ownership, renewal notices, refunds, dispute handling, audit logs and monitored sandbox/end-to-end tests.

## Source references

https://www.namecheap.com/support/api/intro/
https://www.namecheap.com/support/api/methods/domains/check/
https://www.namecheap.com/support/api/methods/users/get-pricing/
https://www.namecheap.com/support/api/methods/domains/create/
https://www.namecheap.com/support/knowledgebase/article.aspx/9391/2229/reseller-hosting-getting-started/
