import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

class SuperAdminGate {
  static Future<Map<String, dynamic>> context() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return const {'isSuperAdmin': false, 'isBootstrap': false};
    try {
      final result = await FirebaseFunctions.instanceFor(region: 'europe-west1')
          .httpsCallable('getSuperAdminContext')
          .call();
      final data = Map<String, dynamic>.from(result.data as Map);
      if (data['refreshToken'] == true) await user.getIdToken(true);
      return data;
    } catch (_) {
      return const {'isSuperAdmin': false, 'isBootstrap': false};
    }
  }

  static Future<bool> resolve() async {
    final data = await context();
    return data['isSuperAdmin'] == true;
  }

  static Future<bool> isBootstrap() async {
    final data = await context();
    return data['isBootstrap'] == true;
  }

}

class SuperAdminConsole extends StatefulWidget {
  const SuperAdminConsole({super.key});
  @override
  State<SuperAdminConsole> createState() => _SuperAdminConsoleState();
}

class _SuperAdminConsoleState extends State<SuperAdminConsole> {
  bool busy = true;
  int tab = 0;
  String? error;
  Map<String, dynamic> data = const {'users': [], 'workspaces': [], 'superAdmins': []};

  FirebaseFunctions get fn => FirebaseFunctions.instanceFor(region: 'europe-west1');

  Future<Map<String, dynamic>> call(String name, [Map<String, dynamic>? payload]) async {
    final result = await fn.httpsCallable(name).call(payload ?? const {});
    return Map<String, dynamic>.from(result.data as Map);
  }

  @override
  void initState() {
    super.initState();
    refresh();
  }

  Future<void> refresh() async {
    setState(() => busy = true);
    try {
      final next = await call('getSuperAdminOverview');
      if (mounted) setState(() { data = next; error = null; });
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void toast(String text, {bool bad = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(text), backgroundColor: bad ? Colors.red.shade700 : null),
    );
  }

  Future<String?> prompt(String title, String label) async {
    final controller = TextEditingController();
    final value = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: TextField(controller: controller, autofocus: true, decoration: InputDecoration(labelText: label)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, controller.text.trim()), child: const Text('Continue')),
        ],
      ),
    );
    controller.dispose();
    return value;
  }

  Future<void> createUser() async {
    final email = await prompt('Create user', 'Email');
    if (email == null || email.isEmpty) return;
    final name = await prompt('Create user', 'Display name');
    if (name == null || name.isEmpty) return;
    try {
      final result = await call('createPlatformUser', {'email': email, 'displayName': name});
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('User created'),
          content: SelectableText('Password reset link:\n\n' + (result['passwordResetLink']?.toString() ?? '')),
          actions: [FilledButton(onPressed: () => Navigator.pop(ctx), child: const Text('Done'))],
        ),
      );
      await refresh();
    } catch (e) { toast('Could not create user: ' + e.toString(), bad: true); }
  }

  Future<void> createWorkspace() async {
    final name = await prompt('Create workspace', 'Workspace name');
    if (name == null || name.isEmpty) return;
    final ownerEmail = await prompt('Create workspace', 'Owner email');
    if (ownerEmail == null || ownerEmail.isEmpty) return;
    try {
      await call('createWorkspaceAsSuperAdmin', {'name': name, 'ownerEmail': ownerEmail});
      toast('Workspace created.');
      await refresh();
    } catch (e) { toast('Could not create workspace: ' + e.toString(), bad: true); }
  }

  Future<void> addAdmin() async {
    final email = await prompt('Add super admin', 'Existing user email');
    if (email == null || email.isEmpty) return;
    try { await call('grantSuperAdmin', {'email': email}); toast('Super admin added.'); await refresh(); }
    catch (e) { toast('Could not add super admin: ' + e.toString(), bad: true); }
  }

  Future<void> editUser(Map<String, dynamic> user) async {
    final name = await prompt('Edit user', 'Display name');
    if (name == null || name.isEmpty) return;
    final email = await prompt('Edit user', 'Email');
    if (email == null || email.isEmpty) return;
    try {
      await call('updatePlatformUser', {'uid': user['uid'], 'displayName': name, 'email': email});
      await refresh();
    } catch (e) { toast('Could not edit user: ' + e.toString(), bad: true); }
  }

  Future<void> toggleUser(Map<String, dynamic> user) async {
    try {
      await call('updatePlatformUser', {'uid': user['uid'], 'disabled': user['disabled'] != true});
      await refresh();
    } catch (e) { toast('Could not update user: ' + e.toString(), bad: true); }
  }

  Future<void> deleteUser(Map<String, dynamic> user) async {
    final email = user['email']?.toString() ?? '';
    final confirm = await prompt('Delete user permanently', 'Type ' + email + ' to confirm');
    if (confirm != email) return;
    try { await call('deletePlatformUser', {'uid': user['uid'], 'confirmEmail': confirm}); await refresh(); }
    catch (e) { toast('Could not delete user: ' + e.toString(), bad: true); }
  }

  Future<void> renameWorkspace(Map<String, dynamic> workspace) async {
    final name = await prompt('Rename workspace', 'New name');
    if (name == null || name.isEmpty) return;
    try { await call('updateWorkspaceAsSuperAdmin', {'workspaceId': workspace['id'], 'name': name}); await refresh(); }
    catch (e) { toast('Could not update workspace: ' + e.toString(), bad: true); }
  }

  Future<void> archiveWorkspace(Map<String, dynamic> workspace) async {
    try {
      await call('updateWorkspaceAsSuperAdmin', {'workspaceId': workspace['id'], 'archived': workspace['archived'] != true});
      await refresh();
    } catch (e) { toast('Could not update workspace: ' + e.toString(), bad: true); }
  }

  Future<void> deleteWorkspace(Map<String, dynamic> workspace) async {
    final id = workspace['id'].toString();
    final confirm = await prompt('Delete workspace permanently', 'Type ' + id + ' to confirm');
    if (confirm != id) return;
    try { await call('deleteWorkspaceAsSuperAdmin', {'workspaceId': id, 'confirmWorkspaceId': confirm}); await refresh(); }
    catch (e) { toast('Could not delete workspace: ' + e.toString(), bad: true); }
  }

  Future<void> revokeAdmin(Map<String, dynamic> admin) async {
    try { await call('revokeSuperAdmin', {'uid': admin['uid']}); await refresh(); }
    catch (e) { toast('Could not revoke admin: ' + e.toString(), bad: true); }
  }

  @override
  Widget build(BuildContext context) {
    final users = (data['users'] as List? ?? const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    final workspaces = (data['workspaces'] as List? ?? const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    final admins = (data['superAdmins'] as List? ?? const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();

    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FB),
      appBar: AppBar(
        title: const Text('Platform Super Admin'),
        actions: [IconButton(onPressed: busy ? null : refresh, icon: const Icon(Icons.refresh_rounded))],
      ),
      body: busy
          ? const Center(child: CircularProgressIndicator())
          : error != null
              ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(error!)))
              : Column(
                  children: [
                    Container(
                      margin: const EdgeInsets.all(20),
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: const Color(0xFF111827),
                        borderRadius: BorderRadius.circular(24),
                      ),
                      child: Wrap(
                        spacing: 16,
                        runSpacing: 12,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          stat('Users', users.length, Icons.people_rounded),
                          stat('Workspaces', workspaces.length, Icons.domain_rounded),
                          stat('Admins', admins.where((a) => a['active'] != false).length, Icons.shield_rounded),
                          FilledButton.icon(onPressed: createUser, icon: const Icon(Icons.person_add_rounded), label: const Text('Create user')),
                          FilledButton.icon(onPressed: createWorkspace, icon: const Icon(Icons.add_business_rounded), label: const Text('Create workspace')),
                          OutlinedButton.icon(
                            style: OutlinedButton.styleFrom(foregroundColor: Colors.white),
                            onPressed: addAdmin,
                            icon: const Icon(Icons.admin_panel_settings_rounded),
                            label: const Text('Add super admin'),
                          ),
                        ],
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: SegmentedButton<int>(
                        segments: const [
                          ButtonSegment(value: 0, label: Text('Users'), icon: Icon(Icons.people_rounded)),
                          ButtonSegment(value: 1, label: Text('Workspaces'), icon: Icon(Icons.domain_rounded)),
                          ButtonSegment(value: 2, label: Text('Admins'), icon: Icon(Icons.shield_rounded)),
                        ],
                        selected: {tab},
                        onSelectionChanged: (v) => setState(() => tab = v.first),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Expanded(
                      child: switch (tab) {
                        1 => workspaceList(workspaces),
                        2 => adminList(admins),
                        _ => userList(users),
                      },
                    ),
                  ],
                ),
    );
  }

  Widget stat(String label, int value, IconData icon) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(color: Colors.white.withValues(alpha: .08), borderRadius: BorderRadius.circular(14)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, color: Colors.white),
          const SizedBox(width: 8),
          Text(label + ': ' + value.toString(), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
        ]),
      );

  Widget panel(Widget child) => Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: const Color(0xFFE5E7EB)),
          boxShadow: const [BoxShadow(color: Color(0x0D0F172A), blurRadius: 18, offset: Offset(0, 6))],
        ),
        child: child,
      );

  Widget userList(List<Map<String, dynamic>> users) => ListView.separated(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 40),
        itemCount: users.length,
        separatorBuilder: (_, _) => const SizedBox(height: 10),
        itemBuilder: (_, i) {
          final user = users[i];
          return panel(ListTile(
            leading: CircleAvatar(child: Text(((user['displayName'] ?? user['email'] ?? '?').toString().isEmpty ? '?' : (user['displayName'] ?? user['email']).toString()[0]).toUpperCase())),
            title: Text((user['displayName'] ?? 'Unnamed user').toString(), style: const TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text((user['email'] ?? '').toString() + '\n' + (user['uid'] ?? '').toString()),
            isThreeLine: true,
            trailing: Wrap(spacing: 4, children: [
              if (user['isSuperAdmin'] == true) const Chip(label: Text('Super admin')),
              IconButton(onPressed: () => editUser(user), icon: const Icon(Icons.edit_outlined)),
              IconButton(onPressed: () => toggleUser(user), icon: Icon(user['disabled'] == true ? Icons.play_circle_outline : Icons.block_rounded)),
              IconButton(onPressed: () => deleteUser(user), icon: const Icon(Icons.delete_outline_rounded)),
            ]),
          ));
        },
      );

  Widget workspaceList(List<Map<String, dynamic>> rows) => ListView.separated(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 40),
        itemCount: rows.length,
        separatorBuilder: (_, _) => const SizedBox(height: 10),
        itemBuilder: (_, i) {
          final workspace = rows[i];
          return panel(ListTile(
            leading: const CircleAvatar(child: Icon(Icons.domain_rounded)),
            title: Text((workspace['name'] ?? workspace['id']).toString(), style: const TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text('ID: ' + workspace['id'].toString() + ' · Owner: ' + (workspace['owner'] ?? 'unknown').toString()),
            trailing: Wrap(spacing: 4, children: [
              IconButton(onPressed: () => renameWorkspace(workspace), icon: const Icon(Icons.edit_outlined)),
              IconButton(onPressed: () => archiveWorkspace(workspace), icon: Icon(workspace['archived'] == true ? Icons.unarchive_outlined : Icons.archive_outlined)),
              IconButton(onPressed: () => deleteWorkspace(workspace), icon: const Icon(Icons.delete_forever_outlined)),
            ]),
          ));
        },
      );

  Widget adminList(List<Map<String, dynamic>> rows) => ListView.separated(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 40),
        itemCount: rows.length,
        separatorBuilder: (_, _) => const SizedBox(height: 10),
        itemBuilder: (_, i) {
          final admin = rows[i];
          return panel(ListTile(
            leading: const CircleAvatar(child: Icon(Icons.admin_panel_settings_rounded)),
            title: Text((admin['email'] ?? admin['uid']).toString(), style: const TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text(admin['bootstrap'] == true ? 'Bootstrap super admin · protected' : (admin['active'] == false ? 'Revoked' : 'Active')),
            trailing: admin['bootstrap'] == true || admin['active'] == false
                ? null
                : IconButton(onPressed: () => revokeAdmin(admin), icon: const Icon(Icons.remove_moderator_outlined)),
          ));
        },
      );
}
