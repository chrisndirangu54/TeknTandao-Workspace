# Configuration and integration status

## Firebase

Use one Firebase project for the suite environment, with one Auth identity service and Firestore database. Each business is separated by `organizations/{orgId}`. Use separate projects for development and production.

Enable Email/Password authentication and Firestore. Select a region before production deployment; Functions currently uses `europe-west1`, so review latency and data-location requirements before choosing the database location.

Create a local, ignored `firebase-config.json` for a real web app:

```json
{
  "PREVIEW": "false",
  "USE_EMULATORS": "false",
  "FIREBASE_PROJECT_ID": "YOUR_PROJECT_ID",
  "FIREBASE_API_KEY": "YOUR_FIREBASE_WEB_API_KEY",
  "FIREBASE_APP_ID": "YOUR_WEB_APP_ID",
  "FIREBASE_MESSAGING_SENDER_ID": "YOUR_SENDER_ID"
}
```

Build from `apps/dashboard` with `flutter build web --release --dart-define-from-file=../../firebase-config.json`. Firebase web configuration is client configuration, not a service-account key. Provider secrets must never be included in these Dart defines.

Deployment commands, after project configuration and required integration validation:

```powershell
npx firebase deploy --project YOUR_PROJECT_ID --only firestore,functions,hosting
```

## Provider secrets

Use Firebase Secret Manager (`firebase functions:secrets:set NAME --project YOUR_PROJECT_ID`). The declared names are:

| Secret | Value |
|---|---|
| `PAYSTACK_SECRET_KEY` | Paystack test or live secret key |
| `MPESA_CONFIG` | JSON object described below |
| `GEMINI_API_KEY` | Google AI API key |

M-Pesa config:

```json
{
  "key": "DARAJA_CONSUMER_KEY",
  "secret": "DARAJA_CONSUMER_SECRET",
  "shortcode": "YOUR_PAYBILL_SHORTCODE",
  "passkey": "YOUR_STK_PASSKEY",
  "callbackUrl": "https://europe-west1-YOUR_PROJECT_ID.cloudfunctions.net/mpesaCallback",
  "live": false
}
```

The initial adapter uses `CustomerPayBillOnline`; it does not claim support for every Till/Buy Goods setup. Amounts passed to Daraja are whole KES. The callback acknowledges receipt but cannot activate a subscription. Check payment queries the server-stored STK request ID and activates once only after Daraja returns success. Automatic background reconciliation, refunds and operator dispute tools remain future work.

For emulator-only operation, `functions/.secret.local` can contain `PAYSTACK_SECRET_KEY=not-configured`, `MPESA_CONFIG={}` and `GEMINI_API_KEY=not-configured`. These deliberately cannot complete provider requests.

Set `GEMINI_MODEL` in an ignored `functions/.env.YOUR_PROJECT_ID` to an available model supporting `generateContent`. Without a model and key, AI requests fail clearly; factual reports still work. Reports currently cap sales/products at 500 records and are not full accounting statements. They exclude HR and patient notes.

Configure Paystack's webhook URL as `https://europe-west1-YOUR_PROJECT_ID.cloudfunctions.net/paystackWebhook`. Activation requires an authentic HMAC-SHA512 signature, independent provider verification, matching reference, amount and currency, and the server's own organization mapping. Validate success, failure, retry and duplicate notifications in the provider sandbox before live use.

These credentials collect **Tandao app subscription payments**. Merchant checkout payments for goods/services are not implemented; POS sales remain unpaid records.

## eTIMS

The code queues draft invoices with `blocked_configuration`. It intentionally has no guessed tax rates, fake KRA response or fabricated fiscal identifier. Remaining integration needs: taxpayer PIN and branch/device identity, approved OSCU/VSCU route, tax/item/unit mappings, invoice numbering, certified connector access, sandbox acceptance tests, retries/reconciliation and credit-note handling. An accepted KRA response must be persisted before an invoice is presented as fiscally issued.

## Official references

- [Firebase Flutter setup](https://firebase.google.com/docs/flutter/setup)
- [Firestore event delivery and idempotency](https://firebase.google.com/docs/functions/firestore-events)
- [Paystack payment initialization](https://paystack.com/docs/payments/accept-payments/)
- [Paystack webhook authentication](https://paystack.com/docs/payments/webhooks/)
- [Safaricom Daraja](https://developer.safaricom.co.ke/)
- [Safaricom SDK STK query implementation](https://github.com/safaricom/mpesa-php-sdk/blob/master/src/Mpesa.php)
- [KRA system-to-system integration](https://www.kra.go.ke/business/etims-electronic-tax-invoice-management-system/learn-about-etims/etims-system-to-system-integration)
- [Gemini API](https://ai.google.dev/api)
