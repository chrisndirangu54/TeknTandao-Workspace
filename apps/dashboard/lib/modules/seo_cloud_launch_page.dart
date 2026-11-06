import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

/// Public entry point only. Never embed a tenant API key or Google token in Flutter.
class SeoCloudLaunchPage extends StatelessWidget {
  const SeoCloudLaunchPage({super.key});
  static const dashboardUrl = String.fromEnvironment('SEO_CLOUD_DASHBOARD_URL');
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('SEO Cloud')),
    body: Center(child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 560),
      child: Padding(padding: const EdgeInsets.all(24), child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('AI SEO & Content Studio', style: TextStyle(fontSize: 25, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          const Text('Audit websites, prepare AI-assisted blog drafts, approve changes and review SEO analytics using your SEO Cloud tenant account.'),
          const SizedBox(height: 20),
          FilledButton.icon(
            onPressed: dashboardUrl.isEmpty ? null : () async {
              final uri = Uri.tryParse(dashboardUrl);
              if (uri == null || uri.scheme != 'https' || uri.host.isEmpty) return;
              if (!await launchUrl(uri, mode: LaunchMode.externalApplication) && context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Unable to open SEO Cloud')));
              }
            },
            icon: const Icon(Icons.open_in_new), label: const Text('Open SEO Cloud')),
          if (dashboardUrl.isEmpty) const Padding(padding: EdgeInsets.only(top: 12),
            child: Text('Set --dart-define=SEO_CLOUD_DASHBOARD_URL=https://your-service.example/dashboard to activate.')),
        ],
      )),
    )),
  );
}
