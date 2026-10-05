import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'cost_aware_store.dart';
import 'dashboard.dart';
import 'modules/talent_marketplace.dart';
import 'workspace_memberships.dart';
import 'super_admin_console.dart';

class WorkspaceHub extends StatefulWidget {
  final User user;
  final String? initialWorkspaceId;
  final String? initialModuleId;
  final WorkspaceMembershipService service;

  const WorkspaceHub({
    super.key,
    required this.user,
    this.initialWorkspaceId,
    this.initialModuleId,
    required this.service,
  });

  @override
  State<WorkspaceHub> createState() => _WorkspaceHubState();
}

class _WorkspaceHubState extends State<WorkspaceHub> {
  String? _activeWorkspaceId;
  bool _creating = false;
  bool _isSuperAdmin = false;

  @override
  void initState() {
    super.initState();
    _activeWorkspaceId = widget.initialWorkspaceId;
    _resolveSuperAdmin();
  }

  Future<void> _resolveSuperAdmin() async {
    final allowed = await SuperAdminGate.resolve();
    if (mounted) setState(() => _isSuperAdmin = allowed);
  }

  Future<void> _createWorkspace() async {
    final nameController = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Create workspace'),
        content: TextField(
          controller: nameController,
          autofocus: true,
          textCapitalization: TextCapitalization.words,
          maxLength: 120,
          decoration: const InputDecoration(labelText: 'Workspace name'),
          onSubmitted: (value) => Navigator.pop(dialogContext, value.trim()),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () =>
                Navigator.pop(dialogContext, nameController.text.trim()),
            child: const Text('Create'),
          ),
        ],
      ),
    );
    nameController.dispose();
    if (name == null || name.trim().isEmpty || !mounted) return;

    setState(() => _creating = true);
    try {
      final workspace = await widget.service.create(widget.user, name);
      if (mounted) setState(() => _activeWorkspaceId = workspace.id);
    } catch (error) {
      _showError('Unable to create workspace: $error');
    } finally {
      if (mounted) setState(() => _creating = false);
    }
  }

  Future<void> _openWorkspace(WorkspaceMembership workspace) async {
    try {
      await widget.service.select(widget.user.uid, workspace.id);
      if (!mounted) return;
      final navigator = Navigator.of(context);
      final user = widget.user;
      final service = widget.service;
      final initialModuleId = widget.initialModuleId;
      navigator.pushReplacement(
        MaterialPageRoute<void>(
          builder: (_) => Dashboard(
            store: CostAwareFirebaseSuiteStore(workspace.id),
            initialModuleId: initialModuleId,
            workspaceName: workspace.name,
            isSuperAdmin: _isSuperAdmin,
            onSwitchWorkspace: () => navigator.pushReplacement(
              MaterialPageRoute<void>(
                builder: (_) => WorkspaceHub(
                  user: user,
                  initialWorkspaceId: workspace.id,
                  initialModuleId: initialModuleId,
                  service: service,
                ),
              ),
            ),
          ),
        ),
      );
    } catch (error) {
      _showError('Unable to open workspace: $error');
    }
  }

  Future<void> _copyWorkspaceId(WorkspaceMembership workspace) async {
    await Clipboard.setData(ClipboardData(text: workspace.id));
    if (!mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('Workspace ID copied.')));
  }

  Future<void> _createInvite(WorkspaceMembership workspace) async {
    try {
      final invite = await widget.service.createInvite(widget.user, workspace);
      await Clipboard.setData(ClipboardData(text: invite));
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('30-day invite link copied.')),
      );
    } catch (error) {
      _showError('Unable to create invite link: $error');
    }
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: Colors.red.shade700),
    );
  }

  @override
  Widget build(BuildContext context) {
    final compact = MediaQuery.sizeOf(context).width < 680;
    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      appBar: AppBar(
        title: const Text('Your workspaces'),
        actions: [
          if (_isSuperAdmin)
            IconButton(
              tooltip: 'Super admin console',
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => const SuperAdminConsole()),
              ),
              icon: const Icon(Icons.admin_panel_settings_rounded),
            ),
          IconButton(
            tooltip: 'Talent profile',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => TalentProfileScreen(
                  user: widget.user,
                  service: TalentMarketplaceService(),
                ),
              ),
            ),
            icon: const Icon(Icons.badge_outlined),
          ),
          IconButton(
            tooltip: 'Sign out',
            onPressed: () async {
              await FirebaseAuth.instance.signOut();
              if (context.mounted) {
                Navigator.of(
                  context,
                ).pushNamedAndRemoveUntil('/', (route) => false);
              }
            },
            icon: const Icon(Icons.logout_rounded),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: SafeArea(
        child: StreamBuilder<List<WorkspaceMembership>>(
          stream: widget.service.watch(widget.user.uid),
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(
                    'Unable to load your workspaces: ${snapshot.error}',
                  ),
                ),
              );
            }
            if (!snapshot.hasData) {
              return const Center(child: CircularProgressIndicator());
            }
            final workspaces = snapshot.data!;
            return Align(
              alignment: Alignment.topCenter,
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 920),
                child: ListView(
                  padding: EdgeInsets.all(compact ? 16 : 32),
                  children: [
                    Text(
                      'Choose a workspace',
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Signed in as ${widget.user.email ?? widget.user.displayName ?? 'your account'}',
                      style: const TextStyle(color: Color(0xFF64748B)),
                    ),
                    const SizedBox(height: 20),
                    for (final workspace in workspaces)
                      _WorkspaceCard(
                        workspace: workspace,
                        active: workspace.id == _activeWorkspaceId,
                        onOpen: () => _openWorkspace(workspace),
                        onCopyId: () => _copyWorkspaceId(workspace),
                        onCreateInvite: workspace.role == 'owner'
                            ? () => _createInvite(workspace)
                            : null,
                      ),
                    if (workspaces.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 28),
                        child: Text(
                          'No workspace memberships yet. Create one or open an owner invite link to join.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Color(0xFF64748B)),
                        ),
                      ),
                    const SizedBox(height: 8),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: FilledButton.icon(
                        onPressed: _creating ? null : _createWorkspace,
                        icon: const Icon(Icons.add_business_rounded),
                        label: Text(
                          _creating ? 'Creating…' : 'Create workspace',
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _WorkspaceCard extends StatelessWidget {
  final WorkspaceMembership workspace;
  final bool active;
  final VoidCallback onOpen;
  final VoidCallback onCopyId;
  final VoidCallback? onCreateInvite;

  const _WorkspaceCard({
    required this.workspace,
    required this.active,
    required this.onOpen,
    required this.onCopyId,
    required this.onCreateInvite,
  });

  @override
  Widget build(BuildContext context) => Card(
    margin: const EdgeInsets.only(bottom: 12),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.business_rounded, color: Color(0xFF176B59)),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  workspace.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              if (active)
                const Chip(
                  label: Text('Active'),
                  visualDensity: VisualDensity.compact,
                ),
            ],
          ),
          const SizedBox(height: 10),
          SelectableText(
            'Workspace ID: ${workspace.id}',
            style: const TextStyle(
              fontSize: 13,
              color: Color(0xFF475569),
              fontFeatures: [],
            ),
          ),
          const SizedBox(height: 4),
          Text(
            workspace.role == 'owner' ? 'Owner' : 'Member',
            style: const TextStyle(fontSize: 12, color: Color(0xFF64748B)),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FilledButton.icon(
                onPressed: onOpen,
                icon: const Icon(Icons.open_in_new_rounded, size: 18),
                label: const Text('Open'),
              ),
              OutlinedButton.icon(
                onPressed: onCopyId,
                icon: const Icon(Icons.copy_rounded, size: 18),
                label: const Text('Copy ID'),
              ),
              if (onCreateInvite != null)
                OutlinedButton.icon(
                  onPressed: onCreateInvite,
                  icon: const Icon(Icons.link_rounded, size: 18),
                  label: const Text('Copy invite link'),
                ),
            ],
          ),
        ],
      ),
    ),
  );
}
