import 'dart:convert';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

/// A read-only customer bridge to the TV/ISP control plane.
/// Set TV_API_BASE_URL only after the same Firebase Auth issuer is verified.
class ConnectedServicesPage extends StatefulWidget {
  final User user;
  const ConnectedServicesPage({super.key, required this.user});
  @override
  State<ConnectedServicesPage> createState() => _ConnectedServicesPageState();
}

class _ConnectedServicesPageState extends State<ConnectedServicesPage> {
  static const endpoint = String.fromEnvironment('TV_API_BASE_URL');
  bool loading = false;
  String? error;
  Map<String, dynamic>? entitlements;
  List<dynamic> subscriptions = const [];

  Future<void> refresh() async {
    if (endpoint.isEmpty) {
      setState(() => error = 'Connect the verified TV service URL to load your subscriptions.');
      return;
    }
    setState(() { loading = true; error = null; });
    try {
      final base = Uri.parse(endpoint);
      if (base.scheme != 'https') throw const FormatException('HTTPS URL required');
      final token = await widget.user.getIdToken();
      if (token == null) throw StateError('Please sign in again.');
      Future<Map<String, dynamic>> get(String path) async {
        final response = await http.get(base.resolve(path), headers: {
          'Authorization': 'Bearer $token', 'Accept': 'application/json',
        });
        if (response.statusCode != 200) throw StateError('Service returned ${response.statusCode}');
        return jsonDecode(response.body) as Map<String, dynamic>;
      }
      final result = await Future.wait([get('/v1/me/entitlements'),get('/v1/me/subscriptions')]);
      if (!mounted) return;
      setState(() {
        entitlements = result.first;
        subscriptions = result.last['subscriptions'] as List<dynamic>? ?? [];
        loading = false;
      });
    } catch (_) {
      if (mounted) setState(() {
        loading = false;
        error = 'Unable to connect. Check the TV API deployment and shared Firebase identity configuration.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final products = (entitlements?['products'] as List<dynamic>? ?? []).cast<String>();
    Widget item(IconData icon, String title, String detail, bool active) =>
      Card(child: ListTile(leading: Icon(icon), title: Text(title),
        subtitle: Text(detail), trailing: Chip(label: Text(active ? 'Active' : 'Not active'))));
    return Scaffold(
      appBar: AppBar(title: const Text('My internet and TV'), actions: [
        IconButton(onPressed: loading ? null : refresh, tooltip: 'Refresh', icon: const Icon(Icons.refresh)),
      ]),
      body: ListView(padding: const EdgeInsets.all(24), children: [
        Text('Connected TeknTandao services',style:Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 8),
        Text('Account: ${widget.user.email ?? widget.user.uid}'),
        const SizedBox(height: 16),
        item(Icons.wifi,'TeknTandao ISP','Fibre and subscriber management',products.contains('ISP')),
        item(Icons.tv,'TeknTandao TV','Live channels and streaming subscriptions',products.contains('TV')),
        item(Icons.dashboard_customize,'Workspace','Business modules and customer management',products.contains('WORKSPACE')),
        const SizedBox(height: 12),
        if (entitlements?['bundle'] == true) const Text('Internet + TV bundle detected'),
        if (loading) const Center(child: CircularProgressIndicator()),
        if (error != null) Padding(padding: const EdgeInsets.all(10),child: Text(error!)),
        FilledButton.icon(onPressed: loading ? null : refresh,
          icon: const Icon(Icons.sync),label: const Text('Load my subscriptions')),
        const SizedBox(height: 20),
        Text('Subscriptions',style:Theme.of(context).textTheme.titleLarge),
        for (final raw in subscriptions)
          ListTile(leading: const Icon(Icons.receipt_long),
            title: Text('${(raw as Map)['product']} · ${raw['plan']}'),
            subtitle: Text('Status: ${raw['status']}')),
        const SizedBox(height: 16),
        const Text('This dashboard is read-only. It never provisions routers or '
          'modifies payment records. Service activation requires verified billing.'),
      ]),
    );
  }
}
