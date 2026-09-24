# Hospital Firebase migration

The patient app in `sources/Hospital-Management-System-Mobile-App` no longer calls the legacy PHP API or Stripe. The original checkout, including `NetworkHelper`, `PaymentService`, and the MySQL dump, is preserved only in `source-recovery/Hospital-before-firebase.zip`.

## What replaced PHP

| Legacy client behavior | Suite replacement |
|---|---|
| `NetworkHelper` posts to `http://…:8000/api/*.php` | Patient-scoped callable functions in `functions/src/hospital_portal.js` |
| Signup and login against the PHP user table | Firebase Authentication, then `hospitalRegisterPatient` links the signed-in user to one organization patient |
| Appointment, lab, prescription, and history lists | `hospitalListRecords`, filtered by the caller's patient id. Private clinical notes and unfinished PDFs are omitted |
| `cancelAppointment.php` and rescheduling | `hospitalUpdateBooking`. A paid booking, or one with a payment in progress, cannot be changed by the patient |
| Stripe `charge.php` with a client-side secret and a fixed amount | `hospitalStartPayment` / `hospitalCheckPayment`. The amount is the catalogue price on the hospital invoice. Paystack and M-Pesa are verified server-side |
| PHP file server on port 8001 for `lab-reports` | Staff upload through a short-lived signed PUT URL (`hospitalPrepareReport`). `hospitalFinalizeReport` checks the PDF header and a 20 MB limit. Patients receive a short-lived read URL from `hospitalReportDownload` |
| Staff web PHP screens | Dashboard Hospital operations: service catalogue, booking confirmation, and lab-report upload |

Service prices are read from `hospitalServices`. The patient cannot submit a price. Booking creation is idempotent on `requestId` and writes the clinical record plus the hospital invoice together.

## Configuration

Run the patient app with the same Firebase project as the deployed suite functions:

`FIREBASE_API_KEY`, `FIREBASE_APP_ID`, `FIREBASE_PROJECT_ID`, `FIREBASE_MESSAGING_SENDER_ID`, and `TANDAO_ORG_ID`.

The organization must have an active Hospital subscription. Patient registration does not grant staff access. Staff actions require a hospital member. Payment initiation requires `PAYSTACK_SECRET_KEY` or `MPESA_CONFIG` on the functions runtime. A provider timeout leaves the invoice reserved for reconciliation instead of starting a second charge.

Deploy the functions, Firestore rules, and Storage rules before pointing the app at a live project. Storage rules deny direct client reads and writes; only signed URLs from the functions above move report bytes. No production data migration was run. The old MySQL dump is not imported.

## Boundaries

This does not certify the app as a full electronic medical record. Staff clinical notes default to hidden from the patient until `patientVisible` is set. Reversing or netting a hospital invoice is an accounting action and blocks a new patient payment on that invoice. M-Pesa merchant POS checkout elsewhere in the suite is still a separate, unfinished production integration.
