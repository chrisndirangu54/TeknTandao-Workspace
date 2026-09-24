"""Write Flutter/Firebase donor templates. Upstream checkouts stay in verified ZIPs."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import stat

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = (ROOT / 'source-archive').resolve()
RECOVERY = (ROOT / 'source-recovery').resolve()

def pubspec(package, description):
 return f"""name: {package}
description: {description}
publish_to: none
version: 0.1.0
environment:
  sdk: '>=3.3.0 <4.0.0'
dependencies:
  flutter:
    sdk: flutter
  cloud_firestore: ^5.6.0
  cloud_functions: ^5.6.0
  donor_firebase:
    path: ../../packages/donor_firebase
dev_dependencies:
  flutter_test:
    sdk: flutter
"""

TEMPLATES = {
 'sales-reports': {
  'package': 'sales_reports',
  'upstream': 'ClientFlow', 'zip': 'ClientFlow-full.zip', 'originalFileCount': 274,
  'sha256': 'cd21646141c2d7ba0e523809e9bf6bcd6e2a02617727645a2f2331e482cf24ea',
  'replaces': 'FlareLine-CRM',
  'summary': 'Flutter widget that reads organization sales from Cloud Firestore and ranks customers by recorded totals. The upstream Dart screens are not included: that checkout has no license file. The behavior already used by firebase-pos was written for the suite.',
  'files': {
   'lib/sales_reports.dart': '''import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:donor_firebase/donor_firebase.dart';
import 'package:flutter/material.dart';

class SalesReportsTemplate extends StatelessWidget {
  const SalesReportsTemplate({super.key});
  static const orgId = String.fromEnvironment('TANDAO_ORG_ID');

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<void>(
      future: initializeDonorFirebase(),
      builder: (context, setup) {
        if (setup.hasError) return Text('Firebase setup required: ${setup.error}');
        if (setup.connectionState != ConnectionState.done) return const LinearProgressIndicator();
        if (orgId.isEmpty) return const Text('Set TANDAO_ORG_ID.');
        return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
          stream: FirebaseFirestore.instance.collection('organizations/$orgId/sales').limit(100).snapshots(),
          builder: (context, snapshot) {
            if (snapshot.hasError) return Text('Could not load sales: ${snapshot.error}');
            if (!snapshot.hasData) return const LinearProgressIndicator();
            final totals = <String, int>{};
            for (final doc in snapshot.data!.docs) {
              final amount = doc.data()['total'];
              final customer = '${doc.data()['contactId'] ?? 'unknown'}';
              totals[customer] = (totals[customer] ?? 0) + (amount is num ? amount.round() : 0);
            }
            final ranked = totals.entries.toList()..sort((a, b) => b.value.compareTo(a.value));
            return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Sales by customer (${snapshot.data!.docs.length} records)'),
              for (final row in ranked) Text('${row.key}: ${row.value} minor units'),
              if (ranked.isEmpty) const Text('No sales yet.'),
            ]);
          },
        );
      },
    );
  }
}
''',
  },
 },
 'invoice-and-customer-store': {
  'package': 'invoice_and_customer_store',
  'upstream': 'The-POS-Flutter', 'zip': 'The-POS-Flutter-full.zip', 'originalFileCount': 302,
  'sha256': 'd648650f23df5fbcf36fcd60492bcdade6a174116c67f3c4c419296127ba18d1',
  'replaces': 'firebase-pos',
  'summary': 'Firestore invoice and customer records, plus the store round-trip tests. This is not the upstream GetX app. The upstream checkout has no license file, so its Dart was not copied.',
  'files': {
   'lib/invoice.dart': '''class InvoiceRecord {
  const InvoiceRecord({required this.id, required this.contactId, required this.totalMinor, required this.currency, required this.paymentState});
  final String id;
  final String contactId;
  final int totalMinor;
  final String currency;
  final String paymentState;

  factory InvoiceRecord.fromFirestore(String id, Map<String, dynamic> data) {
    final total = data['total'];
    final contactId = data['contactId'];
    if (total is! int || total < 0) throw FormatException('Invalid amount in minor units');
    if (contactId is! String || contactId.isEmpty) throw FormatException('Missing contact');
    return InvoiceRecord(
      id: id, contactId: contactId, totalMinor: total,
      currency: data['currency'] is String ? data['currency'] as String : 'KES',
      paymentState: data['paymentState'] is String ? data['paymentState'] as String : 'unpaid',
    );
  }

  Map<String, dynamic> toFirestore() => {'contactId': contactId, 'total': totalMinor, 'currency': currency, 'paymentState': paymentState};
}
''',
   'lib/customer.dart': '''class CustomerRecord {
  const CustomerRecord({required this.id, required this.name, required this.email});
  final String id;
  final String name;
  final String email;

  factory CustomerRecord.fromFirestore(String id, Map<String, dynamic> data) {
    final name = data['name'];
    if (name is! String || name.trim().isEmpty) throw FormatException('Missing name');
    final email = data['email'];
    return CustomerRecord(id: id, name: name.trim(), email: email is String ? email.trim() : '');
  }

  Map<String, dynamic> toFirestore() => {'name': name, 'email': email};
}
''',
   'lib/store_panels.dart': '''import 'package:donor_firebase/donor_firebase.dart';
import 'package:flutter/material.dart';

class CustomerStoreTemplate extends StatelessWidget {
  const CustomerStoreTemplate({super.key});
  @override
  Widget build(BuildContext context) => const FirebaseDonorPanel(
    title: 'Customers', appId: 'crm', collection: 'contacts',
    fields: {'name': 'Name', 'email': 'Email'},
  );
}

class InvoiceStoreTemplate extends StatelessWidget {
  const InvoiceStoreTemplate({super.key});
  @override
  Widget build(BuildContext context) => const FirebaseDonorPanel(
    title: 'Invoices', appId: 'accounting', collection: 'invoices', readOnly: true,
    fields: {'name': 'Invoice', 'contactId': 'Customer', 'total': 'Total in minor units', 'paymentState': 'Payment state'},
  );
}
''',
   'test/store_round_trip_test.dart': '''import 'package:flutter_test/flutter_test.dart';
import 'package:invoice_and_customer_store/customer.dart';
import 'package:invoice_and_customer_store/invoice.dart';

void main() {
  test('invoice and customer records round-trip through Firestore maps', () {
    const invoice = InvoiceRecord(id: 'inv_1', contactId: 'c1', totalMinor: 250000, currency: 'KES', paymentState: 'unpaid');
    expect(InvoiceRecord.fromFirestore('inv_1', invoice.toFirestore()).totalMinor, 250000);
    const customer = CustomerRecord(id: 'c1', name: 'Amina', email: 'amina@example.com');
    expect(CustomerRecord.fromFirestore('c1', customer.toFirestore()).name, 'Amina');
    expect(() => InvoiceRecord.fromFirestore('inv_1', {'contactId': 'c1', 'total': -1}), throwsFormatException);
  });
}
''',
  },
 },
 'document-reversal-and-netting': {
  'package': 'document_reversal_and_netting',
  'upstream': 'account-financial-tools', 'zip': 'account-financial-tools-full.zip', 'originalFileCount': 1113,
  'sha256': '9e895183c78a10db09c153118cc9c0acbfe13214178678d1eb6df803b9378610',
  'replaces': 'TallyAssist',
  'summary': 'Flutter calls for unpaid-invoice reversal, credit notes, and same-party netting. The suite functions own the rules. The upstream AGPL Python was not translated into this template.',
  'files': {
   'lib/ledger.dart': '''import 'package:cloud_functions/cloud_functions.dart';
import 'package:donor_firebase/donor_firebase.dart';
import 'package:flutter/material.dart';

String ledgerRequestId(String prefix, int micros) {
  final id = '${prefix}_$micros';
  if (!RegExp(r'^[A-Za-z0-9_-]{1,100}$').hasMatch(id)) throw ArgumentError('Invalid request id');
  return id;
}

class LedgerTemplate {
  const LedgerTemplate();
  static const orgId = String.fromEnvironment('TANDAO_ORG_ID');
  FirebaseFunctions get _functions => FirebaseFunctions.instanceFor(region: 'europe-west1');

  Future<String> reverseInvoice(String invoiceId) async {
    final requestId = ledgerRequestId('rev', DateTime.now().microsecondsSinceEpoch);
    await _functions.httpsCallable('reverseInvoice').call({'orgId': orgId, 'invoiceId': invoiceId, 'requestId': requestId});
    return requestId;
  }

  Future<String> issueCredit({required String name, required String partyType, required String partyId, required int totalMinor}) async {
    if (partyType != 'contact' && partyType != 'patient') throw ArgumentError('Party type must be contact or patient');
    final requestId = ledgerRequestId('credit', DateTime.now().microsecondsSinceEpoch);
    final partyField = partyType == 'contact' ? 'contactId' : 'patientId';
    await _functions.httpsCallable('issueCreditNote').call({
      'orgId': orgId, 'requestId': requestId, 'name': name, 'total': totalMinor, partyField: partyId,
    });
    return requestId;
  }

  Future<String> netInvoices(String leftId, String rightId) async {
    final requestId = ledgerRequestId('net', DateTime.now().microsecondsSinceEpoch);
    await _functions.httpsCallable('netInvoices').call({'orgId': orgId, 'requestId': requestId, 'leftId': leftId, 'rightId': rightId});
    return requestId;
  }
}

class LedgerTemplatePanel extends StatelessWidget {
  const LedgerTemplatePanel({super.key, this.ledger = const LedgerTemplate()});
  final LedgerTemplate ledger;
  @override
  Widget build(BuildContext context) => FutureBuilder<void>(
    future: initializeDonorFirebase(),
    builder: (context, setup) {
      if (setup.hasError) return Text('Firebase setup required: ${setup.error}');
      if (setup.connectionState != ConnectionState.done) return const LinearProgressIndicator();
      return const Text('Call LedgerTemplate.reverseInvoice, issueCredit, or netInvoices. Books enforces the unpaid, same-party, and currency rules.');
    },
  );
}
''',
   'test/ledger_request_test.dart': '''import 'package:document_reversal_and_netting/ledger.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('ledger request ids stay within the suite identifier alphabet', () {
    expect(ledgerRequestId('rev', 42), 'rev_42');
    expect(() => ledgerRequestId('bad id', 1), throwsArgumentError);
  });
}
''',
  },
 },
 'order-payment-and-product': {
  'package': 'order_payment_and_product',
  'upstream': 'agora-invoicing-community', 'zip': 'agora-invoicing-community-full.zip', 'originalFileCount': 16450,
  'sha256': 'df7450481110d12a78c6c672e769daaa6c2a1e35458c71bb98a8b75fa06a05eb',
  'replaces': 'TallyAssist',
  'summary': 'Flutter Firestore shapes for an order (invoice), a payment, and a product. The upstream PHP models were not copied. Writes still go through suite callables, not a PHP host.',
  'files': {
   'lib/billing_records.dart': '''class OrderRecord {
  const OrderRecord({required this.id, required this.name, required this.totalMinor, required this.paymentState});
  final String id;
  final String name;
  final int totalMinor;
  final String paymentState;
  factory OrderRecord.fromFirestore(String id, Map<String, dynamic> data) {
    final total = data['total'];
    final name = data['name'];
    if (total is! int || total < 0) throw FormatException('Invalid amount in minor units');
    if (name is! String || name.trim().isEmpty) throw FormatException('Missing name');
    final state = data['paymentState'];
    return OrderRecord(id: id, name: name.trim(), totalMinor: total, paymentState: state is String ? state : 'unpaid');
  }
}

class PaymentRecord {
  const PaymentRecord({required this.id, required this.provider, required this.totalMinor, required this.state});
  final String id;
  final String provider;
  final int totalMinor;
  final String state;
  factory PaymentRecord.fromFirestore(String id, Map<String, dynamic> data) {
    final total = data['total'];
    final provider = data['provider'];
    if (total is! int || total < 0) throw FormatException('Invalid amount in minor units');
    if (provider is! String || provider.isEmpty) throw FormatException('Missing provider');
    final state = data['state'];
    return PaymentRecord(id: id, provider: provider, totalMinor: total, state: state is String ? state : 'pending');
  }
}

class ProductRecord {
  const ProductRecord({required this.id, required this.name, required this.priceMinor, required this.stock});
  final String id;
  final String name;
  final int priceMinor;
  final int stock;
  factory ProductRecord.fromFirestore(String id, Map<String, dynamic> data) {
    final price = data['price'];
    final stock = data['stock'];
    final name = data['name'];
    if (price is! int || price < 0 || stock is! int || stock < 0) throw FormatException('Invalid price or stock');
    if (name is! String || name.trim().isEmpty) throw FormatException('Missing name');
    return ProductRecord(id: id, name: name.trim(), priceMinor: price, stock: stock);
  }
  Map<String, dynamic> toFirestore() => {'name': name, 'price': priceMinor, 'stock': stock};
}
''',
   'lib/product_panel.dart': '''import 'package:donor_firebase/donor_firebase.dart';
import 'package:flutter/material.dart';

class ProductTemplatePanel extends StatelessWidget {
  const ProductTemplatePanel({super.key});
  @override
  Widget build(BuildContext context) => const FirebaseDonorPanel(
    title: 'Products', appId: 'inventory', collection: 'products',
    fields: {'name': 'Name', 'price': 'Price in minor units', 'stock': 'Stock'},
  );
}
''',
   'test/billing_records_test.dart': '''import 'package:flutter_test/flutter_test.dart';
import 'package:order_payment_and_product/billing_records.dart';

void main() {
  test('order, payment, and product maps use minor units', () {
    final order = OrderRecord.fromFirestore('o1', {'name': 'Consultation', 'total': 250000, 'paymentState': 'unpaid'});
    final payment = PaymentRecord.fromFirestore('p1', {'provider': 'paystack', 'total': 250000, 'state': 'paid'});
    const product = ProductRecord(id: 'sku', name: 'Consult', priceMinor: 250000, stock: 4);
    expect(order.totalMinor, payment.totalMinor);
    expect(ProductRecord.fromFirestore('sku', product.toFirestore()).stock, 4);
  });
}
''',
  },
 },
 'property-and-favorite': {
  'package': 'property_and_favorite',
  'upstream': 'sfdx-dreamhouse', 'zip': 'sfdx-dreamhouse-full.zip', 'originalFileCount': 431,
  'sha256': '3d44d8904a2f142490f93541763d10afefc6f086887036b66c699d4933f2598a',
  'replaces': 'FlareLine-CRM',
  'summary': 'Flutter panels for organization properties and saved favorites. Favorites are module records that must reference a property in the same organization. The Salesforce object XML was not copied.',
  'files': {
   'lib/property_panels.dart': '''import 'package:donor_firebase/donor_firebase.dart';
import 'package:flutter/material.dart';

class PropertyTemplatePanel extends StatelessWidget {
  const PropertyTemplatePanel({super.key});
  @override
  Widget build(BuildContext context) => const FirebaseDonorPanel(
    title: 'Properties', appId: 'property', collection: 'properties',
    fields: {'name': 'Name', 'address': 'Address', 'price': 'Price in minor units', 'status': 'Status'},
  );
}

class FavoriteTemplatePanel extends StatelessWidget {
  const FavoriteTemplatePanel({super.key});
  @override
  Widget build(BuildContext context) => const FirebaseDonorPanel(
    title: 'Favorites', appId: 'property', collection: 'modules/property/records', recordKind: 'favorite',
    fields: {'name': 'Name', 'propertyId': 'Property ID', 'notes': 'Notes'},
  );
}
''',
  },
 },
}

def remove_tree(path):
 if not path.exists(): return
 def onexc(func, target, exc):
  os.chmod(target, stat.S_IWRITE)
  func(target)
 shutil.rmtree(path, onexc=onexc)

def donor_text(name, spec):
 lines = [
  f'# {name}', '',
  'Flutter/Firebase donor template. This directory is a parts shelf, not an application: there is no app entrypoint or platform host.', '',
  spec['summary'], '',
  f"Active donor: `{spec['replaces']}`. Upstream checkout name: `{spec['upstream']}`.", '',
  '## Parts', '',
 ]
 for path in sorted(spec['files']):
  lines.append(f'- `{path}`')
 lines += ['', f"Full upstream checkout: `source-recovery/{spec['zip']}`. Do not unpack it beside this template.", '']
 return '\n'.join(lines)

def write_template(name, spec):
 backup = (RECOVERY / spec['zip']).resolve()
 if backup.parent != RECOVERY or not backup.is_file(): raise RuntimeError(f'Missing recovery ZIP for {name}')
 digest = hashlib.sha256(backup.read_bytes()).hexdigest()
 if digest != spec['sha256']: raise RuntimeError(f'Recovery ZIP digest changed for {spec["upstream"]}')
 repo = (ARCHIVE / name).resolve()
 if repo.parent != ARCHIVE: raise RuntimeError('Unexpected template path')
 remove_tree(repo)
 repo.mkdir()
 (repo / 'pubspec.yaml').write_text(pubspec(spec['package'], f"Flutter Firebase donor template for {name}. Not an application."), encoding='utf-8')
 for relative, content in spec['files'].items():
  target = repo / relative
  if not target.resolve().is_relative_to(repo): raise RuntimeError('File escapes template')
  target.parent.mkdir(parents=True, exist_ok=True)
  target.write_text(content, encoding='utf-8')
 (repo / 'DONOR.md').write_text(donor_text(name, spec), encoding='utf-8')
 report = {'directory': name, 'kind': 'flutter-firebase-template', 'language': 'Flutter/Firebase',
  'purpose': 'Parts to donate. Not a runnable project.', 'upstream': spec['upstream'], 'replacement': spec['replaces'],
  'recoveryZip': f'source-recovery/{spec["zip"]}', 'sha256': digest, 'originalFileCount': spec['originalFileCount'],
  'parts': sorted(spec['files'])}
 (repo / 'REFERENCE_MANIFEST.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
 print(f'{name}: Flutter/Firebase template', flush=True)
 return report

def main():
 RECOVERY.mkdir(exist_ok=True)
 for upstream in {spec['upstream'] for spec in TEMPLATES.values()}:
  if upstream not in TEMPLATES: remove_tree((ARCHIVE / upstream).resolve())
 inventory = [write_template(name, spec) for name, spec in TEMPLATES.items()]
 (ROOT / 'inventory/archived-reference-manifest.json').write_text(json.dumps(inventory, indent=2) + '\n', encoding='utf-8')
 (ARCHIVE / 'README.md').write_text(
  '# Flutter Firebase donor templates\n\n'
  'Each directory is named for the template it contains. The parts are Flutter widgets, Firestore records, and Cloud Functions calls. '
  'There is no PHP host, Odoo addon, or Salesforce project here.\n\n'
  'The upstream checkout for each template remains a verified ZIP in `source-recovery/`. Do not unpack that ZIP into this folder.\n',
  encoding='utf-8')

if __name__ == '__main__': main()
