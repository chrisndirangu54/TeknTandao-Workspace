import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hospital_management_system/screens/LoginPage.dart';
import 'package:hospital_management_system/screens/PatientRecords.dart';
import 'package:hospital_management_system/services/HospitalService.dart';

class FakeHospitalService extends HospitalService {
  final List<Map<String, dynamic>> records;
  final List<String> calls = [];
  FakeHospitalService(this.records);
  @override
  Future<List<Map<String, dynamic>>> list(bool bills) async => records;
  @override
  Future<Map<String, dynamic>> call(String name, [Map<String, dynamic> data = const {}]) async {
    calls.add(name);
    if (name == 'hospitalReceivePrescription') {
      expect(data.keys, ['id']);
      records.single['received'] = true;
    }
    return {'ok': true};
  }
}
void main() {
  testWidgets('patient login offers email authentication and recovery', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: LoginPage()));
    expect(find.text('Email'), findsOneWidget);
    expect(find.text('Create patient account'), findsOneWidget);
    expect(find.text('Reset password'), findsOneWidget);
  });
  testWidgets('receipt confirmation sends only the record ID and refreshes its state', (tester) async {
    final api = FakeHospitalService([{'id': 'rx1', 'kind': 'prescription', 'name': 'Prescription', 'instructions': 'As directed'}]);
    await tester.pumpWidget(MaterialApp(home: PatientRecords(kind: 'prescription', title: 'Prescriptions', service: api)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Mark received'));
    await tester.pumpAndSettle();
    expect(api.calls, ['hospitalReceivePrescription']);
    expect(find.text('Received'), findsOneWidget);
  });
  testWidgets('paid bills cannot start another payment', (tester) async {
    final api = FakeHospitalService([{'id': 'invoice1', 'name': 'Consultation', 'total': 10000, 'currency': 'KES', 'paymentState': 'paid'}]);
    await tester.pumpWidget(MaterialApp(home: PatientRecords(kind: 'bills', title: 'Bills', service: api)));
    await tester.pumpAndSettle();
    expect(find.text('Pay with Paystack'), findsNothing);
    expect(find.text('Pay with M-Pesa'), findsNothing);
  });
}
