import 'package:flutter_test/flutter_test.dart';
import 'package:tekntandao_workspace/modules/agentic_matching.dart';

void main() {
  test('finds stock, equipment and unassigned service gaps', () {
    final gaps = detectOperationalGaps(
      products: [
        {'name': 'Thermal Paper Rolls', 'category': 'Packaging', 'stock': 2, 'reorderLevel': 10, 'warehouse': 'Nairobi'},
        {'name': 'Coffee', 'stock': 20, 'reorderLevel': 5},
      ],
      assets: [
        {'name': 'Cold Room Compressor', 'category': 'Refrigeration', 'status': 'MAINTENANCE DUE', 'location': 'Nairobi'},
      ],
      serviceRequests: [
        {'service': 'Electrical repair', 'skill': 'Electrician', 'status': 'UNASSIGNED', 'location': 'Nairobi'},
        {'service': 'Closed task', 'status': 'CLOSED'},
      ],
    );

    expect(gaps, hasLength(3));
    expect(gaps.first.kind, 'Stock');
    expect(gaps.first.quantity, 8);
    expect(gaps[1].kind, 'Equipment / Asset');
    expect(gaps[2].kind, 'Service');
  });

  test('ranks suppliers with transparent item, category and location reasons', () {
    final gap = detectOperationalGaps(
      products: [
        {'name': 'Thermal Paper Rolls', 'category': 'Packaging', 'stock': 0, 'reorderLevel': 8, 'warehouse': 'Nairobi'},
      ],
      assets: const [],
      serviceRequests: const [],
    ).single;
    final matches = rankSuppliers(gap, [
      {
        'published': true,
        'organizationName': 'Nairobi Packaging Co',
        'location': 'Nairobi',
        'categories': ['Stock'],
        'products': ['Thermal Paper Rolls'],
        'capacity': 20,
      },
      {
        'published': true,
        'organizationName': 'Unrelated Vendor',
        'location': 'Mombasa',
        'categories': ['Services'],
        'services': ['Electrical repair'],
      },
    ]);

    expect(matches, hasLength(1));
    expect(matches.single.supplier['organizationName'], 'Nairobi Packaging Co');
    expect(matches.single.score, greaterThanOrEqualTo(70));
    expect(matches.single.reasons, contains('Located in Nairobi'));
  });

  test('ranks candidates against open-role skills and exposes workforce gaps', () {
    final role = {
      'title': 'Network Support Technician',
      'location': 'Nairobi',
      'requiredSkills': ['Networking', 'Linux', 'Customer support'],
      'experienceYears': 2,
      'status': 'OPEN',
    };
    final candidates = rankCandidates(role, [
      {
        'name': 'Amina',
        'targetRole': 'Network Technician',
        'location': 'Nairobi',
        'skills': ['Networking', 'Linux'],
        'experienceYears': 3,
        'status': 'AVAILABLE',
      },
      {
        'name': 'Kip',
        'targetRole': 'Chef',
        'location': 'Kisumu',
        'skills': ['Cooking'],
        'experienceYears': 1,
        'status': 'AVAILABLE',
      },
    ]);

    expect(candidates.first.candidate['name'], 'Amina');
    expect(candidates.first.score, greaterThan(candidates.last.score));
    expect(candidates.first.matchedSkills, containsAll(['linux', 'networking']));
    expect(candidates.first.missingSkills, contains('customer'));
    expect(
      workforceSkillGaps([role], [
        {'skills': ['Networking']},
      ]),
      containsAll(['customer', 'linux', 'support']),
    );
  });
}
