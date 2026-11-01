import 'package:flutter/material.dart';
import '../suite.dart';

/// Microsoft quote-first commerce for customers, and a multi-tenant operator
/// console for approved reseller workspace owners. All permissions and money
/// decisions are enforced by Cloud Functions rather than this widget.
class MicrosoftCommerceScreen extends StatefulWidget {
  final SuiteStore store;
  final bool sellerMode;
  final String sellerSlug;
  const MicrosoftCommerceScreen({
    super.key,
    required this.store,
    this.sellerMode = false,
    this.sellerSlug = 'tekntandao',
  });
  @override
  State<MicrosoftCommerceScreen> createState() => _MicrosoftCommerceScreenState();
}

class _MicrosoftCommerceScreenState extends State<MicrosoftCommerceScreen> {
  bool busy = false;
  String? error;
  Map<String, dynamic> marketplace = {};
  Map<String, dynamic> dashboard = {};
  List<Map<String, dynamic>> orders = [];
  Map<String, dynamic>? advice;
  final seats = TextEditingController(text: '5');
  final businessNote = TextEditingController();
  final shopSlug = TextEditingController(text: 'tekntandao');
  final shopName = TextEditingController(text: 'TeknTandao Microsoft Solutions');
  final selectedFamilies = <String>{};
  final selectedNeeds = <String>{'collaboration'};
  String? pendingRequestId;
  static const needs = <String, String>{
    'collaboration': 'Teams and collaboration',
    'email': 'Business email',
    'cloud': 'Azure cloud',
    'crm': 'Customer relationship management',
    'erp': 'Business operations / ERP',
    'analytics': 'Analytics',
    'automation': 'Business automation',
    'security': 'Security',
    'devices': 'Cloud desktops',
    'education': 'Education',
    'developer': 'Developer tools',
  };

  @override
  void initState() {
    super.initState();
    if (!widget.store.demo) {
      // Hand off only harmless catalogue choices from the public website.
      // Buyer identity and approval are always collected inside Workspace.
      final link = Uri.base.queryParameters;
      final proposed = int.tryParse(link['seats'] ?? '');
      if (proposed != null && proposed >= 1 && proposed <= 100000) {
        seats.text = proposed.toString();
      }
      final preselected = (link['families'] ?? '').split(',');
      const allowedFamilies = {
        'm365', 'azure', 'dynamics', 'power', 'security',
        'windows365', 'server', 'education', 'marketplace'
      };
      selectedFamilies.addAll(preselected.where(allowedFamilies.contains));
      final preselectedNeeds = (link['needs'] ?? '').split(',');
      final safeNeeds = preselectedNeeds.where(needs.containsKey).toSet();
      if (safeNeeds.isNotEmpty) {
        selectedNeeds.clear();
        selectedNeeds.addAll(safeNeeds);
      }
      _load();
    }
  }

  @override
  void dispose() {
    seats.dispose();
    businessNote.dispose();
    shopSlug.dispose();
    shopName.dispose();
    super.dispose();
  }

  List<Map<String, dynamic>> _rows(dynamic input) =>
      (input as List? ?? []).whereType<Map>().map((v) => Map<String, dynamic>.from(v)).toList();

  Future<void> _run(Future<void> Function() action) async {
    if (busy) return;
    setState(() { busy = true; error = null; });
    try { await action(); }
    catch (e) { if (mounted) setState(() => error = e.toString()); }
    finally { if (mounted) setState(() => busy = false); }
  }

  Future<void> _load() async {
    await _run(() async {
      if (widget.sellerMode) {
        final result = await widget.store.call('getMicrosoftSellerDashboard');
        if (!mounted) return;
        setState(() {
          dashboard = result;
          orders = _rows(result['orders']);
          final settings = result['store'];
          if (settings is Map) {
            shopSlug.text = settings['slug']?.toString() ?? 'tekntandao';
          }
        });
      } else {
        final values = await Future.wait([
          widget.store.call('getMicrosoftResellerMarketplace', {'seller': widget.sellerSlug}),
          widget.store.call('getMicrosoftBuyerOrders'),
        ]);
        if (!mounted) return;
        setState(() {
          marketplace = values[0];
          orders = _rows(values[1]['orders']);
        });
      }
    });
  }

  Future<void> _publish() async {
    await _run(() async {
      await widget.store.call('publishMicrosoftResellerMarketplace', {
        'store': {
          'slug': shopSlug.text.trim().toLowerCase(),
          'name': shopName.text.trim(),
          'description': 'Microsoft cloud, productivity and business solutions',
          'published': true,
        }
      });
      final result = await widget.store.call('getMicrosoftSellerDashboard');
      if (mounted) setState(() {
        dashboard = result;
        orders = _rows(result['orders']);
      });
    });
  }

  Future<void> _recommend({bool ai = false}) async {
    final count = int.tryParse(seats.text.trim());
    if (count == null || count < 1 || count > 100000 ||
        selectedNeeds.isEmpty || selectedFamilies.isEmpty) {
      setState(() => error = 'Choose a product family, business needs and a valid seat count.');
      return;
    }
    await _run(() async {
      final result = await widget.store.call(
        ai ? 'microsoftMarketplaceAiAdvisor' : 'recommendMicrosoftMarketplace', {
        'requirements': {
          'families': selectedFamilies.toList(),
          'seats': count,
          'needs': selectedNeeds.toList(),
        },
      });
      if (mounted) setState(() => advice = result);
    });
  }

  Future<void> _requestQuote() async {
    final count = int.tryParse(seats.text.trim());
    if (count == null || count < 1 || selectedFamilies.isEmpty || selectedNeeds.isEmpty) {
      setState(() => error = 'Choose your Microsoft product areas, needs and seat count.');
      return;
    }
    pendingRequestId ??= 'req_${DateTime.now().microsecondsSinceEpoch}';
    await _run(() async {
      await widget.store.call('submitMicrosoftSelfServiceRequest', {
        'seller': widget.sellerSlug,
        'clientRequestId': pendingRequestId,
        'order': {
          'families': selectedFamilies.toList(),
          'needs': selectedNeeds.toList(),
          'seats': count,
          'note': businessNote.text.trim(),
          'customerConfirmed': true,
        },
      });
      pendingRequestId = null;
      final result = await widget.store.call('getMicrosoftBuyerOrders');
      if (mounted) setState(() => orders = _rows(result['orders']));
    });
  }

  Future<void> _accept(String orderId) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Accept verified Microsoft quote?'),
        content: const Text('This confirms your approval of the reseller quote. It does not charge you, sign the Microsoft Customer Agreement or activate licences. Your reseller must fulfil through an authorized partner channel.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Approve quote')),
        ],
      ),
    );
    if (yes != true) return;
    await _run(() async {
      await widget.store.call('acceptMicrosoftVerifiedQuote', {
        'orderId': orderId, 'customerApproved': true,
      });
      final result = await widget.store.call('getMicrosoftBuyerOrders');
      if (mounted) setState(() => orders = _rows(result['orders']));
    });
  }

  Future<void> _quote(Map<String, dynamic> order) async {
    final sku = TextEditingController();
    final amount = TextEditingController();
    final reference = TextEditingController();
    final valid = TextEditingController(text: '7');
    try {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Issue provider-verified quote'),
          content: SizedBox(
            width: 490,
            child: SingleChildScrollView(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Text('Quantity: ${order['seats']} seats. Enter a real supplier quotation and eligible SKU.'),
                TextField(controller: sku, decoration: const InputDecoration(labelText: 'Actual eligible SKU / offer ID')),
                TextField(controller: amount, keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Price per seat in KES (whole shillings)')),
                TextField(controller: reference, decoration: const InputDecoration(labelText: 'Supplier price evidence / reference')),
                TextField(controller: valid, keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Validity in days (1–30)')),
                const SizedBox(height: 12),
                const Text('By issuing this quote you attest you checked your current partner eligibility, SKU and supplier price.'),
              ]),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Issue verified quote')),
          ],
        ),
      );
      if (confirmed != true) return;
      final kes = int.tryParse(amount.text.trim());
      if (kes == null || kes <= 0) {
        setState(() => error = 'Enter a valid whole-shilling verified unit price.');
        return;
      }
      await _run(() async {
        await widget.store.call('issueMicrosoftVerifiedQuote', {
          'orderId': order['id'],
          'quote': {
            'currency': 'KES',
            'unitPriceMinor': kes * 100,
            'sku': sku.text.trim(),
            'supplierEvidence': reference.text.trim(),
            'validDays': int.tryParse(valid.text.trim()) ?? 7,
            'commercialVerification': true,
          },
        });
        final result = await widget.store.call('getMicrosoftSellerDashboard');
        if (mounted) setState(() => orders = _rows(result['orders']));
      });
    } finally {
      sku.dispose(); amount.dispose(); reference.dispose(); valid.dispose();
    }
  }

  Future<void> _verifyFulfillment(Map<String, dynamic> order) async {
    final providerOrder = TextEditingController();
    final agreement = TextEditingController();
    final entitlement = TextEditingController();
    try {
      final confirmed = await showDialog<bool>(context: context, builder: (ctx) => AlertDialog(
        title: const Text('Record externally verified fulfillment'),
        content: SizedBox(width: 490, child: SingleChildScrollView(child: Column(
          mainAxisSize: MainAxisSize.min, children: [
            const Text('Only use this after the authorized CSP or indirect provider has placed the order and verified the customer agreement and entitlements.'),
            TextField(controller: providerOrder, decoration: const InputDecoration(labelText: 'Provider order reference')),
            TextField(controller: agreement, decoration: const InputDecoration(labelText: 'Customer agreement evidence reference')),
            TextField(controller: entitlement, decoration: const InputDecoration(labelText: 'Licensing/entitlement evidence reference')),
          ],
        ))),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Record verified fulfillment')),
        ],
      ));
      if (confirmed != true) return;
      await _run(() async {
        await widget.store.call('confirmMicrosoftManualProvisioning', {
          'orderId': order['id'],
          'verification': {
            'providerOrderReference': providerOrder.text.trim(),
            'customerAgreementEvidence': agreement.text.trim(),
            'entitlementEvidence': entitlement.text.trim(),
            'providerAuthorizationConfirmed': true,
          }
        });
        final result = await widget.store.call('getMicrosoftSellerDashboard');
        if (mounted) setState(() => orders = _rows(result['orders']));
      });
    } finally {
      providerOrder.dispose();agreement.dispose();entitlement.dispose();
    }
  }

  Widget _orders(bool seller) {
    if (orders.isEmpty) return const Padding(
      padding: EdgeInsets.all(24),
      child: Text('No requests yet. New requests appear here after a buyer submits a quote.'),
    );
    return Column(children: [
      for (final order in orders) Card(
        margin: const EdgeInsets.only(bottom: 12),
        child: Padding(
          padding: const EdgeInsets.all(17),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Order ${(order['id'] ?? '').toString().substring(0, 8)}',
              style: Theme.of(context).textTheme.titleMedium),
            Text('Status: ${order['status']} · Seats: ${order['seats']}'),
            Text('Families: ${(order['families'] as List? ?? []).join(', ')}'),
            if (seller) Text('Customer workspace: ${order['buyerOrgId']}'),
            if (order['quote'] is Map) Builder(builder: (_) {
              final q = Map<String, dynamic>.from(order['quote'] as Map);
              final minor = (q['totalMinor'] as num? ?? 0).toDouble();
              return Text('Verified quote: KES ${(minor / 100).toStringAsFixed(2)} · SKU: ${q['sku']}');
            }),
            const SizedBox(height: 12),
            Wrap(spacing: 10, children: [
              if (seller && order['status'] == 'quote_requested')
                OutlinedButton(onPressed: busy ? null : () => _quote(order),
                  child: const Text('Quote verified offer')),
              if (seller && order['status'] == 'customer_accepted_pending_partner_order')
                OutlinedButton(onPressed: busy ? null : () => _verifyFulfillment(order),
                  child: const Text('Record provider fulfillment')),
              if (!seller && order['status'] == 'quote_ready')
                FilledButton(onPressed: busy ? null : () => _accept(order['id'].toString()),
                  child: const Text('Review & accept quote')),
              if (order['status'] == 'customer_accepted_pending_partner_order')
                const Chip(label: Text('Awaiting authorized provider order')),
            ]),
          ]),
        ),
      ),
    ]);
  }

  Widget _buyerBody() {
    final families = _rows(marketplace['catalog']);
    return ListView(padding: const EdgeInsets.all(21), children: [
      Text(marketplace['name']?.toString() ?? 'Microsoft products',
        style: Theme.of(context).textTheme.headlineMedium),
      const SizedBox(height: 6),
      const Text('Self-service discovery, AI-assisted planning, requests, verified quotes and customer approval. No payment or licensing occurs without a verified provider.'),
      const SizedBox(height: 22),
      Text('1. Choose Microsoft solution areas', style: Theme.of(context).textTheme.titleLarge),
      const SizedBox(height: 8),
      Wrap(spacing: 8, runSpacing: 7, children: [
        for (final family in families)
          FilterChip(label: Text(family['name']?.toString() ?? ''), selected: selectedFamilies.contains(family['id']),
            onSelected: (value) => setState(() {
              final id = family['id'].toString();
              if (value) { selectedFamilies.add(id); } else { selectedFamilies.remove(id); }
            })),
      ]),
      const SizedBox(height: 18),
      Text('2. What do you need?', style: Theme.of(context).textTheme.titleLarge),
      Wrap(spacing: 8, runSpacing: 7, children: [
        for (final need in needs.entries)
          FilterChip(label: Text(need.value), selected: selectedNeeds.contains(need.key),
            onSelected: (selected) => setState(() {
              if (selected) { selectedNeeds.add(need.key); } else if (selectedNeeds.length > 1) { selectedNeeds.remove(need.key); }
            })),
      ]),
      const SizedBox(height: 16),
      TextField(controller: seats, keyboardType: TextInputType.number,
        decoration: const InputDecoration(labelText: 'Estimated number of licences / seats')),
      const SizedBox(height: 12),
      TextField(controller: businessNote, maxLines: 2, maxLength: 1200,
        decoration: const InputDecoration(labelText: 'Optional requirements (avoid secrets)')),
      const SizedBox(height: 10),
      Wrap(spacing: 9, runSpacing: 9, children: [
        OutlinedButton.icon(onPressed: busy ? null : () => _recommend(), icon: const Icon(Icons.auto_awesome_outlined),
          label: const Text('Get recommendations')),
        OutlinedButton.icon(onPressed: busy ? null : () => _recommend(ai: true), icon: const Icon(Icons.psychology_outlined),
          label: const Text('Ask AI adviser')),
        FilledButton.icon(onPressed: busy || families.isEmpty ? null : _requestQuote,
          icon: const Icon(Icons.request_quote_outlined), label: const Text('Request verified quote')),
      ]),
      if (advice != null) Card(margin: const EdgeInsets.only(top: 18), child: Padding(
        padding: const EdgeInsets.all(16), child: Column(
          crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Advisory only · ${advice!['source'] ?? 'explainable_rules'}',
              style: Theme.of(context).textTheme.titleMedium),
            Text(advice!['narrative'] is Map
                ? (advice!['narrative'] as Map)['summary']?.toString() ?? 'Review recommended families.'
                : 'The recommendations are based on your selected needs; reseller eligibility, SKUs and live prices are not verified.'),
            for (final r in _rows((advice!['advice'] as Map?)?['recommendations']))
              ListTile(title: Text(r['name'].toString()), subtitle: Text('Recommended for: ${(r['rationale'] as List? ?? []).join(', ')}')),
          ]),
      )),
      const SizedBox(height: 25),
      Text('3. Your purchase requests', style: Theme.of(context).textTheme.titleLarge),
      const SizedBox(height: 11),
      _orders(false),
      const SizedBox(height: 12),
      const Text('Microsoft Customer Agreement, reseller relationships, actual partner prices and provisioning must be verified externally. A quote acceptance is not a payment or a licence purchase.'),
    ]);
  }

  Widget _sellerBody() => ListView(padding: const EdgeInsets.all(20), children: [
    Text('Microsoft Reseller SaaS', style: Theme.of(context).textTheme.headlineMedium),
    const Text('Publish your own tenant-isolated customer storefront and manage verified quotes. Other resellers cannot view your records.'),
    const SizedBox(height: 22),
    Card(child: Padding(padding: const EdgeInsets.all(17), child: Column(
      crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Your reseller storefront', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        TextField(controller: shopName, decoration: const InputDecoration(labelText: 'Store display name')),
        const SizedBox(height: 10),
        TextField(controller: shopSlug, decoration: const InputDecoration(labelText: 'Storefront URL slug (e.g. tekntandao)')),
        const SizedBox(height: 10),
        FilledButton(onPressed: busy ? null : _publish, child: const Text('Publish my reseller storefront')),
        if (dashboard['store'] is Map)
          SelectableText('Customer link: https://tekntandaoworkspace.web.app/?module=microsoft-marketplace&seller=${shopSlug.text}'),
      ]),
    )),
    const SizedBox(height: 20),
    const Card(child: ListTile(
      leading: Icon(Icons.verified_user_outlined),
      title: Text('Safe fulfilment gateway'),
      subtitle: Text('AI may recommend. Customers may request and accept quotes. Only an authorized provider can place orders. Automatic billing and licences are disabled pending verified integration.'),
    )),
    const SizedBox(height: 18),
    Text('Customer sales pipeline', style: Theme.of(context).textTheme.titleLarge),
    const SizedBox(height: 10),
    _orders(true),
  ]);

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(widget.sellerMode ? 'Microsoft Reseller SaaS' : 'Microsoft Self-Service Shop'), actions: [
      IconButton(tooltip: 'Refresh', onPressed: busy ? null : _load, icon: const Icon(Icons.refresh)),
    ]),
    body: widget.store.demo ? const Center(child: Text('Sign in to a live Workspace to request Microsoft quotations.'))
        : Column(children: [
            if (busy) const LinearProgressIndicator(),
            if (error != null) MaterialBanner(content: Text(error!),
              actions: [TextButton(onPressed: () => setState(() => error = null),
                child: const Text('Dismiss'))]),
            Expanded(child: widget.sellerMode ? _sellerBody() : _buyerBody()),
          ]),
  );
}
