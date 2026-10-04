import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../suite.dart';

class ResellerStudioScreen extends StatefulWidget {
  final SuiteStore store;
  const ResellerStudioScreen({super.key, required this.store});
  @override
  State<ResellerStudioScreen> createState() => _ResellerStudioScreenState();
}

class _ResellerStudioScreenState extends State<ResellerStudioScreen> {
  Map<String, dynamic>? _data;
  List<Map<String, dynamic>> _clientInvoices = [];
  bool _busy = false;
  String? _error;
  static const _json = JsonEncoder.withIndent('  ');
  List<Map<String, dynamic>> _rows(dynamic value) => (value as List? ?? [])
      .map((row) => Map<String, dynamic>.from(row as Map))
      .toList();
  String _money(dynamic value) =>
      'KES ${((value as num? ?? 0) / 100).toStringAsFixed(2)}';
  bool get _seller => _data?['enabled'] == true;
  String get _month => DateTime.now().toUtc().toIso8601String().substring(0, 7);

  @override
  void initState() {
    super.initState();
    if (!widget.store.demo) _load();
  }

  Future<void> _load() async {
    try {
      final values = await Future.wait([
        widget.store.call('getResellerStudio'),
        widget.store.call('getClientBundleInvoices'),
      ]);
      if (mounted) {
        setState(() {
          _data = values[0];
          _clientInvoices = _rows(values[1]['invoices']);
        });
      }
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    }
  }

  Future<Map<String, dynamic>?> _call(
    String name,
    Map<String, dynamic> args,
  ) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await widget.store.call(name, args);
      await _load();
      return result;
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
      return null;
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<Map<String, String>?> _form(
    String title,
    Map<String, String> fields, {
    Map<String, String> initial = const {},
    Set<String> optional = const {},
    String? note,
  }) async {
    final controllers = fields.map(
      (key, _) =>
          MapEntry(key, TextEditingController(text: initial[key] ?? '')),
    );
    final formKey = GlobalKey<FormState>();
    final result = await showDialog<Map<String, String>>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: SizedBox(
          width: 560,
          child: SingleChildScrollView(
            child: Form(
              key: formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (note != null) Text(note),
                  for (final entry in fields.entries)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: TextFormField(
                        controller: controllers[entry.key],
                        decoration: InputDecoration(labelText: entry.value),
                        validator: (value) =>
                            !optional.contains(entry.key) &&
                                (value?.trim().isEmpty ?? true)
                            ? 'Required'
                            : null,
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              if (formKey.currentState!.validate()) {
                Navigator.pop(
                  context,
                  controllers.map(
                    (key, value) => MapEntry(key, value.text.trim()),
                  ),
                );
              }
            },
            child: const Text('Continue'),
          ),
        ],
      ),
    );
    // The dialog route finishes animating before its controllers are disposed.
    await Future<void>.delayed(const Duration(milliseconds: 300));
    for (final controller in controllers.values) {
      controller.dispose();
    }
    return result;
  }

  Future<void> _show(String title, dynamic value) async {
    if (!mounted) return;
    final text = value is String ? value : _json.convert(value);
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: SizedBox(
          width: 700,
          child: SingleChildScrollView(child: SelectableText(text)),
        ),
        actions: [
          TextButton(
            onPressed: () => Clipboard.setData(ClipboardData(text: text)),
            child: const Text('Copy'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  Future<void> _pricing() async {
    final p = Map<String, dynamic>.from(_data?['pricing'] as Map? ?? {});
    final values = await _form(
      'Cost + your profit',
      const {
        'monthlyFixed': 'Monthly fixed profit (KES)',
        'monthlyPercent': 'Monthly markup (%)',
        'generationFixed': 'Generation fixed profit (KES)',
        'generationPercent': 'Generation markup (%)',
        'model': 'Generation model ID',
        'input': 'Input cost per million tokens (KES)',
        'output': 'Output / thinking cost per million tokens (KES)',
        'cached': 'Cached input cost per million tokens (KES)',
        'exchange': 'KES per USD for Namecheap quotes',
      },
      initial: p.isEmpty
          ? {}
          : {
              'monthlyFixed': '${p['monthlyProfit']['fixedMinor'] / 100}',
              'monthlyPercent': '${p['monthlyProfit']['markupBps'] / 100}',
              'generationFixed': '${p['generationProfit']['fixedMinor'] / 100}',
              'generationPercent':
                  '${p['generationProfit']['markupBps'] / 100}',
              'model': '${p['tokenRates']['model']}',
              'input': '${p['tokenRates']['inputPerMillionMinor'] / 100}',
              'output': '${p['tokenRates']['outputPerMillionMinor'] / 100}',
              'cached':
                  '${p['tokenRates']['cachedInputPerMillionMinor'] / 100}',
              'exchange': '${p['usdToKes']}',
            },
      note:
          'Monthly price = allocated Firebase cost + fixed profit + cost × markup. Generation uses actual provider tokens with the same formula. Enter your actual model rates. Domain registration is an annual pass-through.',
    );
    if (values == null || !mounted) return;
    try {
      int minor(String key) {
        final number = double.parse(values[key]!);
        if (!number.isFinite || number < 0) throw const FormatException();
        return (number * 100).round();
      }

      await _call('saveResellerPricing', {
        'policy': {
          'currency': 'KES',
          'monthlyProfit': {
            'fixedMinor': minor('monthlyFixed'),
            'markupBps': minor('monthlyPercent'),
          },
          'generationProfit': {
            'fixedMinor': minor('generationFixed'),
            'markupBps': minor('generationPercent'),
          },
          'tokenRates': {
            'model': values['model'],
            'inputPerMillionMinor': minor('input'),
            'outputPerMillionMinor': minor('output'),
            'cachedInputPerMillionMinor': minor('cached'),
          },
          'usdToKes': double.parse(values['exchange']!),
        },
      });
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'Enter valid non-negative numbers for costs and profit, and a positive exchange rate.',
        );
      }
    }
  }

  Future<void> _cost() async {
    final value = await _form(
      'Allocate Firebase cost',
      const {
        'client': 'Client workspace ID',
        'period': 'Month (YYYY-MM)',
        'amount': 'Firebase cost (KES)',
        'source': 'Billing export / allocation evidence',
        'estimated': 'Is this an estimate? (yes / no)',
      },
      initial: {'period': _month, 'estimated': 'yes'},
      note:
          'Use only this client’s share of Hosting, Firestore, Functions and related Firebase infrastructure. Include shared infrastructure allocation once.',
    );
    if (value == null || !mounted) return;
    final amount = double.tryParse(value['amount']!);
    if (amount == null ||
        !amount.isFinite ||
        amount < 0 ||
        !['yes', 'no'].contains(value['estimated']!.toLowerCase())) {
      setState(() => _error = 'Enter a valid cost and yes or no for estimate.');
      return;
    }
    await _call('recordResellerFirebaseCost', {
      'cost': {
        'clientWorkspaceId': value['client'],
        'period': value['period'],
        'amountMinor': (amount * 100).round(),
        'source': value['source'],
        'estimated': value['estimated']!.toLowerCase() == 'yes',
      },
    });
  }

  Future<void> _quote() async {
    final value = await _form(
      'Namecheap domain quote',
      const {'domain': 'Domain (example.com)'},
      note:
          'Supported: .com, .net, .org, .co, .io, .biz and .info. Standard domains only. Quotes expire in 15 minutes.',
    );
    if (value == null || !mounted) return;
    final quote = await _call('quoteResellerDomain', value);
    if (quote != null) {
      await _show('Domain quote — save the quote ID for your bundle', quote);
    }
  }

  Future<void> _bundle(Map<String, dynamic> project) async {
    final apps = await _chooseApps();
    if (apps == null || !mounted) return;
    final value = await _form(
      'Offer ${project['title']} to a client',
      const {
        'name': 'Bundle name',
        'client': 'Client workspace ID',
        'domain': 'Domain quote ID (optional)',
        'generation': 'Generation usage ID (optional)',
      },
      optional: {'domain', 'generation'},
      note:
          'Website Builder is included automatically. The client reviews and pays their invoice in Reseller → Invoices. Profit rates are locked to this offer.',
    );
    if (value == null || !mounted) return;
    await _call('createResellerBundle', {
      'bundle': {
        'name': value['name'],
        'clientWorkspaceId': value['client'],
        'projectId': project['id'],
        'apps': apps,
        'domainQuoteId': value['domain']!.isEmpty ? null : value['domain'],
        'generationId': value['generation']!.isEmpty
            ? null
            : value['generation'],
      },
    });
  }

  Future<List<String>?> _chooseApps() async {
    final selected = <String>{};
    var query = '';
    return showDialog<List<String>>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, update) {
          final apps = _rows(_data?['apps'])
              .where(
                (app) =>
                    app['id'] != 'mc14_website_builder' &&
                    app['name'].toString().toLowerCase().contains(
                      query.toLowerCase(),
                    ),
              )
              .toList();
          return AlertDialog(
            title: const Text('Include workspace apps'),
            content: SizedBox(
              width: 560,
              height: 420,
              child: Column(
                children: [
                  const Text(
                    'Website Builder is included. Choose up to 30 additional apps.',
                  ),
                  TextField(
                    decoration: const InputDecoration(labelText: 'Search apps'),
                    onChanged: (value) => update(() => query = value),
                  ),
                  Expanded(
                    child: ListView.builder(
                      itemCount: apps.length,
                      itemBuilder: (context, index) {
                        final app = apps[index], id = app['id'].toString();
                        return CheckboxListTile(
                          title: Text(app['name'].toString()),
                          value: selected.contains(id),
                          onChanged:
                              selected.length >= 30 && !selected.contains(id)
                              ? null
                              : (value) => update(() {
                                  if (value == true) {
                                    selected.add(id);
                                  } else {
                                    selected.remove(id);
                                  }
                                }),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(context, selected.toList()),
                child: const Text('Continue'),
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _saveTemplate(Map<String, dynamic> project) async {
    final value = await _form(
      'Save vetted template',
      const {'name': 'Template name'},
      initial: {'name': '${project['title']}'},
    );
    if (value != null && mounted) {
      await _call('saveVettedSiteTemplate', {
        ...value,
        'projectId': project['id'],
      });
    }
  }

  Future<void> _export(Map<String, dynamic> project) async {
    final result = await _call('exportVettedSite', {
      'projectId': project['id'],
    });
    if (result == null || !mounted) return;
    final files = Map<String, dynamic>.from(result['files'] as Map);
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Self-hosting export'),
        content: SizedBox(
          width: 550,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'Save all files into one folder and serve it with any static web host.',
                ),
                for (final entry in files.entries)
                  ListTile(
                    title: Text(entry.key),
                    trailing: IconButton(
                      icon: const Icon(Icons.download),
                      tooltip: 'Save ${entry.key}',
                      onPressed: () async {
                        try {
                          await FilePicker.platform.saveFile(
                            dialogTitle: 'Save ${entry.key}',
                            fileName: entry.key,
                            bytes: Uint8List.fromList(
                              utf8.encode(entry.value.toString()),
                            ),
                          );
                        } catch (error) {
                          await _show(
                            'Save failed — copy the file content instead',
                            entry.value,
                          );
                        }
                      },
                    ),
                    onTap: () => _show(entry.key, entry.value),
                  ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  Future<void> _register(Map<String, dynamic> bundle) async {
    final value = await _form(
      'Register ${bundle['domainQuote']['domain']}',
      const {
        'FirstName': 'Registrant first name',
        'LastName': 'Registrant last name',
        'Address1': 'Address',
        'City': 'City',
        'StateProvince': 'State / province',
        'PostalCode': 'Postal code',
        'Country': 'Country code (e.g. KE)',
        'Phone': 'Phone (+254.712345678)',
        'EmailAddress': 'Registrant email',
        'confirm': 'Type REGISTER to buy this domain',
      },
      note:
          'This spends the reseller’s Namecheap balance for one year. The client must already have paid the domain invoice. Registration cannot be undone here.',
    );
    if (value == null || !mounted) return;
    if (value.remove('confirm') != 'REGISTER') {
      setState(() => _error = 'Registration was not confirmed.');
      return;
    }
    final result = await _call('registerResellerDomain', {
      'bundleId': bundle['id'],
      'contact': value,
      'confirmPurchase': true,
    });
    if (result != null) await _show('Registration result', result);
  }

  Future<void> _pay(Map<String, dynamic> invoice) async {
    final result = await _call('startResellerInvoicePayment', {
      'invoiceId': invoice['id'],
    });
    if (result == null || !mounted) return;
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Pay ${_money(invoice['totalMinor'])}'),
        content: const Text(
          'Continue to Paystack, then return and select Verify payment.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
          FilledButton(
            onPressed: () async {
              await launchUrl(
                Uri.parse(result['url'].toString()),
                mode: LaunchMode.externalApplication,
              );
            },
            child: const Text('Continue to Paystack'),
          ),
        ],
      ),
    );
  }

  Widget _button(String label, VoidCallback action) =>
      OutlinedButton(onPressed: _busy ? null : action, child: Text(label));
  Widget _card(String title, String detail, List<Widget> actions) => Card(
    child: Padding(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          Text(detail),
          const SizedBox(height: 12),
          Wrap(spacing: 8, runSpacing: 8, children: actions),
        ],
      ),
    ),
  );
  Widget _page(List<Widget> children) => Align(
    alignment: Alignment.topCenter,
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 1000),
      child: ListView(padding: const EdgeInsets.all(20), children: children),
    ),
  );

  @override
  Widget build(BuildContext context) => DefaultTabController(
    length: 4,
    child: Scaffold(
      appBar: AppBar(
        title: const Text('Reseller Studio'),
        actions: [
          IconButton(
            onPressed: _busy || widget.store.demo ? null : _load,
            tooltip: 'Refresh reseller data',
            icon: const Icon(Icons.refresh),
          ),
        ],
        bottom: const TabBar(
          isScrollable: true,
          tabs: [
            Tab(text: 'Library'),
            Tab(text: 'Pricing & costs'),
            Tab(text: 'Clients'),
            Tab(text: 'Invoices'),
          ],
        ),
      ),
      body: widget.store.demo
          ? const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                  'Sign in as a workspace owner to build your template library, manage client bundles and view invoices.',
                ),
              ),
            )
          : Column(
              children: [
                if (_busy) const LinearProgressIndicator(),
                if (_error != null)
                  MaterialBanner(
                    content: Text(_error!),
                    actions: [
                      TextButton(
                        onPressed: () => setState(() => _error = null),
                        child: const Text('Dismiss'),
                      ),
                    ],
                  ),
                if (_data == null)
                  Expanded(
                    child: Center(
                      child: _error == null
                          ? const CircularProgressIndicator()
                          : _button('Retry', _load),
                    ),
                  )
                else
                  Expanded(
                    child: TabBarView(
                      children: [
                        _library(),
                        _pricingTab(),
                        _clients(),
                        _invoices(),
                      ],
                    ),
                  ),
              ],
            ),
    ),
  );

  Widget _library() => _page([
    const Text(
      'Vetted websites & components',
      style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
    ),
    const Text(
      'AI fills structured content in these versioned components. Layout code stays in the tested library. Save successful sites as reusable templates or export plain HTML and CSS.',
    ),
    for (final preset in _rows(_data?['presets']))
      _card('${preset['name']}', '${preset['category']} · sample content', [
        _button(
          'Create site',
          () => _call('installVettedSiteTemplate', {'presetId': preset['id']}),
        ),
      ]),
    for (final template in _rows(_data?['library']))
      _card(
        '${template['name']}',
        'Your library · version ${template['version']}',
        [
          _button(
            'Use template',
            () => _call('installVettedSiteTemplate', {
              'templateId': template['id'],
            }),
          ),
        ],
      ),
    const SizedBox(height: 16),
    const Text('Your structured-content sites', style: TextStyle(fontSize: 20)),
    for (final project in _rows(
      _data?['projects'],
    ).where((p) => p['hasBlueprint'] == true))
      _card('${project['title']}', 'Project ${project['id']}', [
        _button('Save template', () => _saveTemplate(project)),
        _button('Export', () => _export(project)),
        if (_seller) _button('Offer client bundle', () => _bundle(project)),
      ]),
    _card(
      'Component library',
      _rows(
        _data?['components'],
      ).map((c) => '${c['name']} v${c['version']}').join('\n'),
      [],
    ),
  ]);

  Widget _pricingTab() => _page([
    const Text(
      'Your cost-plus pricing',
      style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
    ),
    const Text(
      'Monthly: allocated Firebase running cost + your profit.\nGeneration: actual token cost + your profit.\nDomains: annual registrar cost shown separately. Payment-provider fees reduce your proceeds; account for them in your profit.',
    ),
    if (!_seller)
      const Padding(
        padding: EdgeInsets.all(16),
        child: Text(
          'Selling bundles requires platform-approved reseller access. Client invoices and the template library are available to workspace owners.',
        ),
      ),
    if (_seller)
      Wrap(
        spacing: 8,
        children: [
          _button('Configure pricing', _pricing),
          _button('Record Firebase cost', _cost),
          _button('Quote Namecheap domain', _quote),
        ],
      ),
    if (_data?['pricing'] != null)
      _card(
        'Current pricing policy',
        'New offers use these rates. Existing offers keep their agreed policy.',
        [
          _button(
            'View policy',
            () => _show('Pricing policy (minor units)', _data?['pricing']),
          ),
        ],
      ),
    for (final cost in _rows(_data?['costs']))
      _card(
        '${cost['clientWorkspaceId']} · ${cost['period']}',
        '${_money(cost['amountMinor'])} · ${cost['estimated'] == true ? 'Estimate' : 'Actual allocation'}\n${cost['source']}',
        [],
      ),
    const SizedBox(height: 16),
    const Text('Generation usage', style: TextStyle(fontSize: 20)),
    for (final usage in _rows(_data?['usage']))
      _card(
        '${usage['model']} · ${usage['status']}',
        'Usage ID: ${usage['id']}\n${usage['charge'] == null ? 'Unpriced — configure rates and review usage' : 'Token cost ${_money(usage['charge']['costMinor'])} + profit ${_money(usage['charge']['profitMinor'])} = ${_money(usage['charge']['totalMinor'])}'}',
        [
          _button('View usage', () => _show('Generation record', usage)),
          if (_seller &&
              usage['charge'] == null &&
              usage['status'] == 'validated')
            _button(
              'Apply configured token rates',
              () => _call('priceResellerGeneration', {
                'generationId': usage['id'],
              }),
            ),
        ],
      ),
  ]);

  Widget _clients() => _page([
    const Text(
      'Site + hosting + workspace apps',
      style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
    ),
    const Text(
      'Create an offer from a structured site in Library. Record the client’s Firebase cost, then create an invoice. Verified payment activates the site and app access for 30 days. Renewals require invoice payment; cards are not charged automatically.',
    ),
    for (final bundle in [..._rows(_data?['sold']), ..._rows(_data?['bought'])])
      _card(
        '${bundle['name']}',
        '${bundle['status']} · client ${bundle['clientOrgId']}\nApps: ${(bundle['apps'] as List? ?? []).join(', ')}\nDomain: ${bundle['domainStatus']}\n${bundle['publicId'] == null ? 'Site activates after payment' : Uri.base.replace(queryParameters: {'site': bundle['publicId'].toString()}, fragment: '')}',
        [
          _button('Bundle details', () => _show('Bundle', bundle)),
          if (_rows(_data?['sold']).any((b) => b['id'] == bundle['id']) &&
              ['offered', 'active'].contains(bundle['status']))
            _button('Create monthly invoice', () async {
              final result = await _call('createResellerInvoice', {
                'bundleId': bundle['id'],
                'period': _month,
              });
              if (result != null) await _show('Invoice', result);
            }),
          if (_seller &&
              bundle['domainStatus'] == 'awaiting_payment' &&
              bundle['status'] == 'active')
            _button('Register paid domain', () => _register(bundle)),
          if (bundle['domainStatus'] == 'registered')
            _button('Connect domain to hosting', () async {
              final result = await _call('connectResellerDomain', {
                'bundleId': bundle['id'],
              });
              if (result != null) {
                await _show(
                  'Hosting DNS records — add these at Namecheap',
                  result,
                );
              }
            }),
          if (bundle['status'] != 'cancelled')
            _button('Cancel renewal', () async {
              final value = await _form(
                'Cancel bundle renewal',
                const {'confirm': 'Type CANCEL'},
                note:
                    'Paid access remains until expiry. Domain registration is not refunded or cancelled.',
              );
              if (value?['confirm'] == 'CANCEL' && mounted) {
                await _call('cancelResellerBundle', {'bundleId': bundle['id']});
              }
            }),
        ],
      ),
  ]);

  Widget _invoices() => _page([
    const Text(
      'Invoices',
      style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
    ),
    if (_clientInvoices.isEmpty && _rows(_data?['invoices']).isEmpty)
      const Text('No invoices yet.'),
    for (final invoice in [..._clientInvoices, ..._rows(_data?['invoices'])])
      _card(
        '${invoice['period']} · ${_money(invoice['totalMinor'])}',
        '${invoice['status']} · ${invoice['estimated'] == true ? 'Estimated Firebase allocation' : 'Actual Firebase allocation'}\nFirebase ${_money(invoice['monthly']['costMinor'])} + profit ${_money(invoice['monthly']['profitMinor'])}\nGeneration ${_money(invoice['generationMinor'])} · Annual domain ${_money(invoice['domainMinor'])}\nInvoice ${invoice['id']}',
        [
          _button('Review details', () => _show('Invoice breakdown', invoice)),
          if (_clientInvoices.any((row) => row['id'] == invoice['id']) &&
              invoice['status'] == 'due')
            _button('Pay invoice', () => _pay(invoice)),
          if (_clientInvoices.any((row) => row['id'] == invoice['id']) &&
              invoice['status'] == 'due' &&
              invoice['checkout'] != null)
            _button('Verify payment', () async {
              final result = await _call('checkResellerInvoicePayment', {
                'reference': invoice['checkout']['reference'],
              });
              if (result != null) await _show('Payment status', result);
            }),
        ],
      ),
  ]);
}
