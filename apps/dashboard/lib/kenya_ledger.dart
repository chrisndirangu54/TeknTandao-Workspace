// February 2026 Kenya payroll arithmetic, matching functions/src/payroll_domain.js.
// NSSF lower limit KES 9,000, upper limit KES 108,000, 6% employee and employer.
// SHIF 2.75% of gross, minimum KES 300. Housing levy 1.5% employee and employer.
// PAYE bands and KES 2,400 monthly personal relief. NSSF, SHIF and housing levy
// reduce taxable pay. Amounts are rounded to the nearest shilling.
// This calculates a payslip. It does not file a KRA return.

const rateCard = 'KE-2026-02';

int _money(int value) {
  if (value < 0 || value > 1000000000) {
    throw StateError('Invalid amount in minor units');
  }
  return value;
}

int _shillings(double value) => value.round();

int _minor(num shillings) => (shillings * 100).round();

Map<String, Object> statutoryPayroll(int grossMinor) {
  _money(grossMinor);
  if (grossMinor <= 0 || grossMinor % 100 != 0) {
    throw StateError('Gross pay must be positive whole shillings');
  }
  final gross = grossMinor / 100;
  const nssfLower = 9000.0;
  const nssfUpper = 108000.0;
  final tier1 = gross < nssfLower ? gross : nssfLower;
  final capped = gross < nssfUpper ? gross : nssfUpper;
  final tier2 = capped - nssfLower > 0 ? capped - nssfLower : 0.0;
  final nssf = _shillings(tier1 * 0.06) + _shillings(tier2 * 0.06);
  final shifCalculated = _shillings(gross * 0.0275);
  final shif = shifCalculated < 300 ? 300 : shifCalculated;
  final housing = _shillings(gross * 0.015);
  final taxablePay = gross - nssf - shif - housing;
  final taxable = taxablePay < 0 ? 0.0 : taxablePay.toDouble();
  const bands = <List<double>>[
    [24000, 0.1],
    [8333, 0.25],
    [467667, 0.3],
    [300000, 0.325],
    [double.infinity, 0.35],
  ];
  var remaining = taxable;
  var tax = 0.0;
  for (final band in bands) {
    final slice = remaining < band[0] ? remaining : band[0];
    tax += slice * band[1];
    remaining -= slice;
    if (remaining <= 0) break;
  }
  final payeAfterRelief = _shillings(tax) - 2400;
  final paye = payeAfterRelief < 0 ? 0 : payeAfterRelief;
  final net = gross - nssf - shif - housing - paye;
  if (net < 0 || net != net.roundToDouble()) {
    throw StateError('Deductions exceed gross pay');
  }
  return {
    'rateCard': rateCard,
    'grossMinor': _minor(gross),
    'nssfEmployeeMinor': _minor(nssf),
    'nssfEmployerMinor': _minor(nssf),
    'shifMinor': _minor(shif),
    'housingEmployeeMinor': _minor(housing),
    'housingEmployerMinor': _minor(housing),
    'taxableMinor': _minor(taxable),
    'payeMinor': _minor(paye),
    'netMinor': _minor(net),
    'employerCostMinor': _minor(gross + nssf + housing),
  };
}

Map<String, dynamic> _line(String code, String name, int debit, int credit) {
  if ((debit == 0 && credit == 0) || (debit > 0 && credit > 0)) {
    throw StateError('A journal line is either a debit or a credit');
  }
  return {
    'account': code,
    'name': name,
    'debit': _money(debit),
    'credit': _money(credit),
  };
}

Map<String, dynamic> _balanced(List<Map<String, dynamic>> lines, String memo) {
  if (lines.length < 2) {
    throw StateError('A journal entry needs at least two lines');
  }
  final debit = lines.fold<int>(0, (sum, line) => sum + (line['debit'] as int));
  final credit = lines.fold<int>(0, (sum, line) => sum + (line['credit'] as int));
  if (debit != credit || debit <= 0) {
    throw StateError('Journal entry must balance');
  }
  return {'currency': 'KES', 'memo': memo, 'total': debit, 'lines': lines};
}

Map<String, dynamic> invoiceJournal(int totalMinor) {
  final total = _money(totalMinor);
  return _balanced([
    _line('1100', 'Accounts receivable', total, 0),
    _line('4000', 'Revenue', 0, total),
  ], 'Customer invoice');
}

Map<String, dynamic> creditJournal(int totalMinor) {
  final total = _money(totalMinor);
  return _balanced([
    _line('4000', 'Revenue', total, 0),
    _line('1100', 'Accounts receivable', 0, total),
  ], 'Credit note');
}

Map<String, dynamic> paymentJournal(int totalMinor, String provider) {
  final total = _money(totalMinor);
  final clearing = provider == 'mpesa'
      ? ['1120', 'M-Pesa clearing']
      : provider == 'paystack'
          ? ['1130', 'Paystack clearing']
          : null;
  if (clearing == null) throw StateError('Unsupported settlement account');
  return _balanced([
    _line(clearing[0], clearing[1], total, 0),
    _line('1100', 'Accounts receivable', 0, total),
  ], 'Customer payment');
}

Map<String, dynamic> payrollJournal(Map<String, Object> slip) {
  final candidates = [
    ['6100', 'Salary expense', slip['employerCostMinor'] as int, 0],
    ['2140', 'Net pay payable', 0, slip['netMinor'] as int],
    ['2100', 'PAYE payable', 0, slip['payeMinor'] as int],
    ['2110', 'NSSF payable', 0, (slip['nssfEmployeeMinor'] as int) + (slip['nssfEmployerMinor'] as int)],
    ['2120', 'SHIF payable', 0, slip['shifMinor'] as int],
    ['2130', 'Housing levy payable', 0, (slip['housingEmployeeMinor'] as int) + (slip['housingEmployerMinor'] as int)],
  ];
  final lines = [
    for (final row in candidates)
      if ((row[2] as int) > 0 || (row[3] as int) > 0)
        _line(row[0] as String, row[1] as String, row[2] as int, row[3] as int),
  ];
  return _balanced(lines, 'Payroll ${slip['period'] ?? ''}');
}

Map<String, dynamic> trialBalance(List<Map<String, dynamic>> journals) {
  final totals = <String, Map<String, dynamic>>{};
  for (final journal in journals) {
    if (journal['currency'] != 'KES' || journal['lines'] is! List) {
      throw StateError('Invalid journal');
    }
    for (final item in journal['lines'] as List) {
      final line = Map<String, dynamic>.from(item as Map);
      final account = line['account'] as String;
      final current = totals.putIfAbsent(account, () => {
        'account': account,
        'name': line['name'],
        'debit': 0,
        'credit': 0,
      });
      current['debit'] = (current['debit'] as int) + (line['debit'] as int);
      current['credit'] = (current['credit'] as int) + (line['credit'] as int);
    }
  }
  final rows = totals.values
      .map((row) => {
            ...row,
            'balance': (row['debit'] as int) - (row['credit'] as int),
          })
      .toList()
    ..sort((a, b) => (a['account'] as String).compareTo(b['account'] as String));
  final net = rows.fold<int>(0, (sum, row) => sum + (row['balance'] as int));
  if (net != 0) throw StateError('Trial balance is out of balance');
  return {'currency': 'KES', 'rows': rows, 'journalCount': journals.length};
}
