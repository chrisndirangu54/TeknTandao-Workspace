class OperationalGap {
  final String kind;
  final String title;
  final String category;
  final String location;
  final String detail;
  final int quantity;

  const OperationalGap({
    required this.kind,
    required this.title,
    required this.category,
    required this.location,
    required this.detail,
    required this.quantity,
  });

  List<String> get searchTerms => [kind, title, category, detail]
      .expand(_tokens)
      .toSet()
      .toList(growable: false);
}

class SupplierMatch {
  final Map<String, dynamic> supplier;
  final int score;
  final List<String> reasons;

  const SupplierMatch({
    required this.supplier,
    required this.score,
    required this.reasons,
  });
}

class HiringMatch {
  final Map<String, dynamic> candidate;
  final int score;
  final List<String> matchedSkills;
  final List<String> missingSkills;

  const HiringMatch({
    required this.candidate,
    required this.score,
    required this.matchedSkills,
    required this.missingSkills,
  });
}

List<OperationalGap> detectOperationalGaps({
  required List<Map<String, dynamic>> products,
  required List<Map<String, dynamic>> assets,
  required List<Map<String, dynamic>> serviceRequests,
  int defaultReorderLevel = 5,
}) {
  final gaps = <OperationalGap>[];

  for (final product in products) {
    final stock = _integer(product['stock']);
    final reorderLevel = _integer(product['reorderLevel']) ?? defaultReorderLevel;
    if (stock == null || reorderLevel < 0 || stock > reorderLevel) continue;
    gaps.add(
      OperationalGap(
        kind: 'Stock',
        title: _text(product['name'], 'Unnamed item'),
        category: _text(product['category'], 'Inventory'),
        location: _text(product['warehouse'], ''),
        detail: '$stock on hand; reorder point is $reorderLevel',
        quantity: (reorderLevel - stock).clamp(1, 1000000),
      ),
    );
  }

  for (final asset in assets) {
    final status = _text(asset['status'] ?? asset['condition'], '').toLowerCase();
    final needsService = asset['serviceDue'] == true ||
        ['repair', 'maintenance', 'out of service', 'unavailable', 'broken']
            .any(status.contains);
    if (!needsService) continue;
    gaps.add(
      OperationalGap(
        kind: 'Equipment / Asset',
        title: _text(asset['name'] ?? asset['asset'], 'Unlabelled asset'),
        category: _text(asset['category'] ?? asset['type'], 'Equipment'),
        location: _text(asset['location'] ?? asset['branch'], ''),
        detail: 'Asset status: ${status.isEmpty ? 'service due' : status}',
        quantity: 1,
      ),
    );
  }

  for (final request in serviceRequests) {
    final status = _text(request['status'], '').toUpperCase();
    if (!['OPEN', 'NEW', 'REQUESTED', 'UNASSIGNED'].contains(status)) continue;
    gaps.add(
      OperationalGap(
        kind: 'Service',
        title: _text(
          request['service'] ?? request['task'] ?? request['name'],
          'Open service request',
        ),
        category: _text(request['category'] ?? request['skill'], 'Service'),
        location: _text(request['location'] ?? request['site'], ''),
        detail: 'Unfilled service request ($status)',
        quantity: 1,
      ),
    );
  }

  return gaps;
}

List<SupplierMatch> rankSuppliers(
  OperationalGap gap,
  List<Map<String, dynamic>> suppliers,
) {
  final gapTerms = gap.searchTerms.toSet();
  final ranked = <SupplierMatch>[];
  for (final supplier in suppliers) {
    if (supplier['published'] != true) continue;
    final categoryTerms = _values(supplier['categories']).expand(_tokens).toSet();
    final offerTerms = [
      ..._values(supplier['products']),
      ..._values(supplier['equipment']),
      ..._values(supplier['services']),
      _text(supplier['organizationName'], ''),
    ].expand(_tokens).toSet();
    final overlaps = gapTerms.intersection(offerTerms).toList()..sort();
    final categoryMatch = categoryTerms.contains(gap.kind.toLowerCase()) ||
        categoryTerms.any(gapTerms.contains);
    final sameLocation = gap.location.isNotEmpty &&
        _text(supplier['location'], '').toLowerCase() == gap.location.toLowerCase();
    final capacity = _integer(supplier['capacity']);
    final capacityMatch = capacity != null && capacity >= gap.quantity;
    if (overlaps.isEmpty && !categoryMatch) continue;

    final score = (overlaps.isEmpty
            ? 0
            : (45 * overlaps.length / gapTerms.length.clamp(1, 100)).round()) +
        (categoryMatch ? 30 : 0) +
        (sameLocation ? 15 : 0) +
        (capacityMatch ? 10 : 0);
    final reasons = <String>[];
    if (overlaps.isNotEmpty) reasons.add('Offers ${overlaps.take(4).join(', ')}');
    if (categoryMatch) reasons.add('Category matches ${gap.kind.toLowerCase()}');
    if (sameLocation) reasons.add('Located in ${gap.location}');
    if (capacityMatch) reasons.add('Capacity covers ${gap.quantity}');
    ranked.add(
      SupplierMatch(
        supplier: supplier,
        score: score.clamp(0, 100),
        reasons: reasons,
      ),
    );
  }
  ranked.sort((left, right) {
    final scoreOrder = right.score.compareTo(left.score);
    if (scoreOrder != 0) return scoreOrder;
    return _text(left.supplier['organizationName'], '').compareTo(
      _text(right.supplier['organizationName'], ''),
    );
  });
  return ranked;
}

List<HiringMatch> rankCandidates(
  Map<String, dynamic> role,
  List<Map<String, dynamic>> candidates,
) {
  final requiredSkills = _values(role['requiredSkills']).expand(_tokens).toSet();
  final titleTerms = _tokens(_text(role['title'], ''));
  final roleLocation = _text(role['location'], '').toLowerCase();
  final matches = <HiringMatch>[];

  for (final candidate in candidates) {
    if (candidate['status'] != null &&
        !['NEW', 'AVAILABLE', 'ACTIVE'].contains(
          _text(candidate['status'], '').toUpperCase(),
        )) {
      continue;
    }
    final candidateSkills = _values(candidate['skills']).expand(_tokens).toSet();
    final matched = requiredSkills.intersection(candidateSkills).toList()..sort();
    final missing = requiredSkills.difference(candidateSkills).toList()..sort();
    final skillScore = requiredSkills.isEmpty
        ? 0
        : (65 * matched.length / requiredSkills.length).round();
    final candidateTitle = _values(
      candidate['targetRoles'] ?? candidate['targetRole'] ?? candidate['role'],
    ).expand(_tokens).toSet();
    final titleMatch = titleTerms.any(candidateTitle.contains);
    final candidateLocation = _text(candidate['location'], '').toLowerCase();
    final locationMatch = roleLocation.isNotEmpty && candidateLocation == roleLocation;
    final experienceRequired = _integer(role['experienceYears']) ?? 0;
    final experience = _integer(candidate['experienceYears']) ?? 0;
    final experienceMatch = experience >= experienceRequired;
    final score = (skillScore +
            (titleMatch ? 20 : 0) +
            (locationMatch ? 10 : 0) +
            (experienceMatch ? 5 : 0))
        .clamp(0, 100);
    matches.add(
      HiringMatch(
        candidate: candidate,
        score: score,
        matchedSkills: matched,
        missingSkills: missing,
      ),
    );
  }
  matches.sort((left, right) => right.score.compareTo(left.score));
  return matches;
}

List<String> workforceSkillGaps(
  List<Map<String, dynamic>> roles,
  List<Map<String, dynamic>> employees,
) {
  final currentSkills = employees
      .expand((employee) => _values(employee['skills']).expand(_tokens))
      .toSet();
  final requestedSkills = roles
      .where((role) => _text(role['status'], 'OPEN').toUpperCase() == 'OPEN')
      .expand((role) => _values(role['requiredSkills']).expand(_tokens))
      .toSet();
  final gaps = requestedSkills.difference(currentSkills).toList()..sort();
  return gaps;
}

List<String> _values(Object? value) {
  if (value is Iterable) return value.map((item) => item.toString()).toList();
  if (value == null) return const [];
  return value.toString().split(RegExp(r'[,;|]'));
}

List<String> _tokens(String value) => value
    .toLowerCase()
    .split(RegExp(r'[^a-z0-9]+'))
    .where((token) => token.length > 1)
    .toList(growable: false);

String _text(Object? value, String fallback) {
  final text = value?.toString().trim() ?? '';
  return text.isEmpty ? fallback : text;
}

int? _integer(Object? value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  return int.tryParse(value?.toString() ?? '');
}
