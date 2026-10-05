import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';

class PlatformSecurityPanel extends StatefulWidget {
  const PlatformSecurityPanel({super.key});
  @override
  State<PlatformSecurityPanel> createState() => _PlatformSecurityPanelState();
}

class _PlatformSecurityPanelState extends State<PlatformSecurityPanel> {
  bool busy = true;
  String? error;
  Map<String, dynamic> vault = const {'secrets': []};

  FirebaseFunctions get functions =>
      FirebaseFunctions.instanceFor(region: 'europe-west1');

  Future<Map<String, dynamic>> call(String name, [Map<String, dynamic>? payload]) async {
    final result = await functions.httpsCallable(name).call(payload ?? const {});
    return Map<String, dynamic>.from(result.data as Map);
  }

  @override
  void initState() {
    super.initState();
    refresh();
  }

  Future<void> refresh() async {
    setState(() { busy = true; error = null; });
    try {
      final next = await call('getPlatformSecretVault');
      if (mounted) setState(() => vault = next);
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void toast(String message, {bool bad = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: bad ? Colors.red.shade700 : null),
    );
  }

  Future<String?> prompt(String title, String label, {bool secret = false, String? helper}) async {
    final controller = TextEditingController();
    var hidden = secret;
    final value = await showDialog<String>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) => AlertDialog(
          title: Text(title),
          content: SizedBox(
            width: 560,
            child: TextField(
              controller: controller,
              autofocus: true,
              obscureText: hidden,
              decoration: InputDecoration(
                labelText: label,
                helperText: helper,
                suffixIcon: secret
                    ? IconButton(
                        tooltip: hidden ? 'Show while typing' : 'Hide value',
                        onPressed: () => setDialogState(() => hidden = !hidden),
                        icon: Icon(hidden ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                      )
                    : null,
              ),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel')),
            FilledButton(
              onPressed: () => Navigator.pop(dialogContext, controller.text.trim()),
              child: const Text('Continue'),
            ),
          ],
        ),
      ),
    );
    controller.dispose();
    return value;
  }

  Future<void> createSecret() async {
    final id = await prompt('Add API key / secret', 'Secret ID', helper: 'Example: OPENAI_API_KEY or STRIPE_SECRET_KEY');
    if (id == null || id.isEmpty) return;
    final value = await prompt('Add ' + id, 'Secret value', secret: true, helper: 'Write-only: the value will not be displayed again.');
    if (value == null || value.isEmpty) return;
    try {
      await call('createPlatformSecret', {'id': id, 'value': value});
      toast(id + ' stored in Secret Manager.');
      await refresh();
    } catch (e) { toast('Could not create secret: ' + e.toString(), bad: true); }
  }

  Future<void> rotateSecret(Map<String, dynamic> secret) async {
    final id = secret['id'].toString();
    final value = await prompt('Rotate ' + id, 'New secret value', secret: true, helper: 'Creates a new version without revealing old values.');
    if (value == null || value.isEmpty) return;
    final disable = await showDialog<bool>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            title: const Text('Disable previous active versions?'),
            content: const Text('Disable previous versions for a strict cutover. Keep them only when a provider requires an overlap window.'),
            actions: [
              TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('Keep previous')),
              FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('Disable previous')),
            ],
          ),
        ) ??
        false;
    try {
      await call('rotatePlatformSecret', {'id': id, 'value': value, 'disablePrevious': disable});
      toast(id + ' rotated.');
      await refresh();
    } catch (e) { toast('Could not rotate secret: ' + e.toString(), bad: true); }
  }

  Future<void> setVersionState(Map<String, dynamic> secret, Map<String, dynamic> version, bool enabled) async {
    try {
      await call('setPlatformSecretVersionState', {
        'id': secret['id'],
        'version': version['version'].toString(),
        'enabled': enabled,
      });
      await refresh();
    } catch (e) { toast('Could not update secret version: ' + e.toString(), bad: true); }
  }

  Future<void> destroyVersion(Map<String, dynamic> secret, Map<String, dynamic> version) async {
    final id = secret['id'].toString();
    final versionId = version['version'].toString();
    final expected = 'DESTROY ' + id + ' VERSION ' + versionId;
    final confirmation = await prompt('Destroy secret version', 'Type exactly: ' + expected);
    if (confirmation != expected) return;
    try {
      await call('destroyPlatformSecretVersion', {'id': id, 'version': versionId, 'confirmation': confirmation});
      toast('Secret version destroyed.');
      await refresh();
    } catch (e) { toast('Could not destroy secret version: ' + e.toString(), bad: true); }
  }

  Future<void> deleteSecret(Map<String, dynamic> secret) async {
    final id = secret['id'].toString();
    final expected = 'DELETE SECRET ' + id;
    final confirmation = await prompt('Delete entire secret', 'Type exactly: ' + expected);
    if (confirmation != expected) return;
    try {
      await call('deletePlatformSecret', {'id': id, 'confirmation': confirmation});
      toast(id + ' deleted.');
      await refresh();
    } catch (e) { toast('Could not delete secret: ' + e.toString(), bad: true); }
  }

  @override
  Widget build(BuildContext context) {
    if (busy) return const Center(child: CircularProgressIndicator());
    if (error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.enhanced_encryption_outlined, size: 48, color: Color(0xFFDC2626)),
              const SizedBox(height: 12),
              Text(error!, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              FilledButton.icon(onPressed: refresh, icon: const Icon(Icons.refresh_rounded), label: const Text('Retry')),
            ],
          ),
        ),
      );
    }

    final rows = (vault['secrets'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 40),
      children: [
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(color: const Color(0xFF111827), borderRadius: BorderRadius.circular(20)),
          child: Wrap(
            spacing: 18,
            runSpacing: 12,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              const Icon(Icons.enhanced_encryption_rounded, color: Color(0xFF22C55E), size: 32),
              SizedBox(
                width: 500,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('High-security API key vault', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18)),
                    const SizedBox(height: 5),
                    Text(
                      (vault['policy'] ?? 'Secret values are never returned after storage.').toString(),
                      style: const TextStyle(color: Color(0xFFCBD5E1), height: 1.4),
                    ),
                  ],
                ),
              ),
              FilledButton.icon(onPressed: createSecret, icon: const Icon(Icons.vpn_key_rounded), label: const Text('Add secret')),
              IconButton(tooltip: 'Refresh vault', onPressed: refresh, color: Colors.white, icon: const Icon(Icons.refresh_rounded)),
            ],
          ),
        ),
        const SizedBox(height: 16),
        if (rows.isEmpty)
          const Card(
            child: Padding(
              padding: EdgeInsets.all(28),
              child: Column(
                children: [
                  Icon(Icons.key_off_outlined, size: 42),
                  SizedBox(height: 10),
                  Text('No managed secrets found', style: TextStyle(fontWeight: FontWeight.w800)),
                  SizedBox(height: 5),
                  Text('Add an API key or provider credential. Values remain write-only.', textAlign: TextAlign.center),
                ],
              ),
            ),
          )
        else
          for (final secret in rows) ...[secretCard(secret), const SizedBox(height: 12)],
      ],
    );
  }

  Widget secretCard(Map<String, dynamic> secret) {
    final versions = (secret['versions'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
    final latest = secret['latestVersion'] is Map
        ? Map<String, dynamic>.from(secret['latestVersion'] as Map)
        : const <String, dynamic>{};
    final latestText = latest.isEmpty
        ? 'No versions'
        : 'Latest v' + latest['version'].toString() + ' · ' + latest['state'].toString() + ' · values hidden';

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFE5E7EB)),
        boxShadow: const [BoxShadow(color: Color(0x0D0F172A), blurRadius: 18, offset: Offset(0, 6))],
      ),
      child: ExpansionTile(
        leading: const CircleAvatar(backgroundColor: Color(0xFFECFDF5), child: Icon(Icons.key_rounded, color: Color(0xFF059669))),
        title: Text(secret['id'].toString(), style: const TextStyle(fontWeight: FontWeight.w800)),
        subtitle: Text(latestText),
        trailing: Wrap(
          spacing: 4,
          children: [
            IconButton(tooltip: 'Rotate secret', onPressed: () => rotateSecret(secret), icon: const Icon(Icons.rotate_right_rounded)),
            IconButton(tooltip: 'Delete entire secret (root only)', onPressed: () => deleteSecret(secret), icon: const Icon(Icons.delete_forever_outlined)),
          ],
        ),
        children: [
          if (versions.isEmpty)
            const Padding(padding: EdgeInsets.all(18), child: Text('No secret versions are available.'))
          else
            for (final version in versions)
              ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 22, vertical: 4),
                leading: Icon(
                  version['state'] == 'ENABLED'
                      ? Icons.check_circle_rounded
                      : version['state'] == 'DISABLED'
                          ? Icons.pause_circle_rounded
                          : Icons.cancel_rounded,
                  color: version['state'] == 'ENABLED' ? const Color(0xFF16A34A) : const Color(0xFF64748B),
                ),
                title: Text('Version ' + version['version'].toString(), style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text(version['state'].toString() + ' · ' + (version['createTime'] ?? 'unknown creation time').toString()),
                trailing: version['state'] == 'DESTROYED'
                    ? const Chip(label: Text('Destroyed'))
                    : Wrap(
                        spacing: 4,
                        children: [
                          IconButton(
                            tooltip: version['state'] == 'ENABLED' ? 'Disable version' : 'Enable version',
                            onPressed: () => setVersionState(secret, version, version['state'] != 'ENABLED'),
                            icon: Icon(version['state'] == 'ENABLED' ? Icons.pause_rounded : Icons.play_arrow_rounded),
                          ),
                          IconButton(
                            tooltip: 'Destroy version permanently',
                            onPressed: () => destroyVersion(secret, version),
                            icon: const Icon(Icons.delete_outline_rounded),
                          ),
                        ],
                      ),
              ),
        ],
      ),
    );
  }
}
