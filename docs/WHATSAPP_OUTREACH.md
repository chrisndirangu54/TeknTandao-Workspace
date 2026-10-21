# WhatsApp business outreach — consent-aware starter

This module prepares click-to-chat links; it **does not send any WhatsApp messages** or send email, and no existing lead is assumed opted in.

- `functions/src/whatsapp_outreach.js`: strict E.164 number normalization, source and opt-in status validation, localized contact messages (English / Swahili / French), optional manual `wa.me` link generation.
- `functions/test/whatsapp_outreach.test.js`: basic tests.

## Recommended workflow
1. Record organization, sector, town, current official source URL, publicly listed **business WhatsApp number**, source verification timestamp, consent status (`unverified` initially), and email bounce/suppression status.
2. Verify that a listed phone is actually designated for WhatsApp. A voice telephone number must not be treated as a confirmed WhatsApp account.
3. Use a manual chat link for an appropriate, low-volume, individually reviewed introduction. Do not treat opening the link as sending the message; the operator must press Send.
4. Track responses, opt-outs, bounce events and last-contact timestamp. Suppress opted-out or disputed recipients and do not repeatedly solicit those who do not respond.
5. Only add Meta Cloud API sending once the organization has a valid business portfolio, WhatsApp Business Account, registered number, credentials held in Secret Manager, inbound webhook verification, Meta-approved templates where required, and demonstrable recipient opt-in. Obtain counsel's review of applicable privacy/direct-marketing requirements. Keep the default auto-send state disabled.

## Manual example
```js
import {makeClickToChat, outreachMessage} from '../functions/src/whatsapp_outreach.js';
const message = outreachMessage({organization:'Example Clinic',category:'clinic',locale:'en'});
const link = makeClickToChat('+254711161164',message);
// Open the link to review text; message is not sent automatically.
```

Never store Meta API secrets in GitHub. Avoid bypassing platform messaging limits or anti-spam rules.

## Intended business sender
The TeknTandao WhatsApp Business number supplied by the owner is **+254 180 590803** (E.164: `+254180590803`). This identifies the intended sending line only, **not** a verified Cloud API registration. Do not place access tokens in this repository. The Meta business portfolio/WABA ID, Phone Number ID, display name approval and API permission status must be verified in WhatsApp Manager before sending. Provision access token and webhook verification material through Firebase Secret Manager. No production sending is enabled by this PR.
