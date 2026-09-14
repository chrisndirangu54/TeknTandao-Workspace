import 'package:flutter/material.dart';
import '../suite.dart';

class AiCopilotDrawer extends StatefulWidget {
  final SuiteStore store;
  final VoidCallback onClose;

  const AiCopilotDrawer({
    super.key,
    required this.store,
    required this.onClose,
  });

  @override
  State<AiCopilotDrawer> createState() => _AiCopilotDrawerState();
}

class _AiCopilotDrawerState extends State<AiCopilotDrawer> {
  final TextEditingController _promptController = TextEditingController();
  final List<Map<String, String>> _messages = [
    {
      'sender': 'ai',
      'text': 'Jambo! I am your AI Business Copilot. I have secure, RBAC-verified access to your organization\'s live data fabric (CRM, POS, Books, Stock, Hospitals & Schools).\n\nHow can I assist your business executive team today?'
    }
  ];
  bool _thinking = false;

  void _sendQuery(String promptText) async {
    if (promptText.trim().isEmpty || _thinking) return;

    final userQuery = promptText.trim();
    _promptController.clear();

    setState(() {
      _messages.add({'sender': 'user', 'text': userQuery});
      _thinking = true;
    });

    try {
      final response = await widget.store.call('generateReport', {
        'useAi': true,
        'query': userQuery,
      });

      if (mounted) {
        setState(() {
          _messages.add({
            'sender': 'ai',
            'text': response['narrative'] ?? 'Analysis complete.',
          });
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _messages.add({
            'sender': 'ai',
            'text': '⚠️ Copilot Notice: ${e.toString().replaceAll('Exception:', '')}',
          });
        });
      }
    } finally {
      if (mounted) setState(() => _thinking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 400,
      decoration: const BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black26,
            blurRadius: 20,
            offset: Offset(-4, 0),
          )
        ],
      ),
      child: Column(
        children: [
          // Copilot Drawer Header
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: [Color(0xFF4F46E5), Color(0xFF7C3AED)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
            ),
            child: Row(
              children: [
                const Icon(Icons.auto_awesome_rounded, color: Colors.white, size: 24),
                const SizedBox(width: 12),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'AI Business Copilot',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Text(
                        'Tenant RBAC Isolated · Real-time Analytics',
                        style: TextStyle(color: Colors.white70, fontSize: 11),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close_rounded, color: Colors.white),
                  onPressed: widget.onClose,
                ),
              ],
            ),
          ),

          // Recommended Query Presets
          Container(
            color: const Color(0xFFF8FAFC),
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'SUGGESTED EXECUTIVE QUESTIONS:',
                  style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Color(0xFF64748B)),
                ),
                const SizedBox(height: 8),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _buildPresetChip('📊 Revenue & Overdue Invoices'),
                      const SizedBox(width: 8),
                      _buildPresetChip('📦 Low Stock Risk'),
                      const SizedBox(width: 8),
                      _buildPresetChip('🇰🇪 KRA eTIMS Audit'),
                    ],
                  ),
                ),
              ],
            ),
          ),

          const Divider(height: 1),

          // Message Thread
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _messages.length,
              itemBuilder: (context, idx) {
                final msg = _messages[idx];
                final isAi = msg['sender'] == 'ai';
                return Align(
                  alignment: isAi ? Alignment.centerLeft : Alignment.centerRight,
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 14),
                    padding: const EdgeInsets.all(14),
                    constraints: const BoxConstraints(maxWidth: 320),
                    decoration: BoxDecoration(
                      color: isAi ? const Color(0xFFF1F5F9) : const Color(0xFF4F46E5),
                      borderRadius: BorderRadius.circular(16).copyWith(
                        bottomLeft: isAi ? const Radius.circular(0) : const Radius.circular(16),
                        bottomRight: !isAi ? const Radius.circular(0) : const Radius.circular(16),
                      ),
                    ),
                    child: Text(
                      msg['text']!,
                      style: TextStyle(
                        color: isAi ? const Color(0xFF1E293B) : Colors.white,
                        fontSize: 13,
                        height: 1.4,
                      ),
                    ),
                  ),
                );
              },
            ),
          ),

          if (_thinking)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 20, vertical: 8),
              child: Row(
                children: [
                  SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
                  SizedBox(width: 12),
                  Text('Copilot is querying organization ledger & stock...', style: TextStyle(fontSize: 12, color: Colors.grey)),
                ],
              ),
            ),

          const Divider(height: 1),

          // Input Bar
          Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _promptController,
                    decoration: InputDecoration(
                      hintText: 'Ask Copilot anything about your business...',
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(24),
                        borderSide: const BorderSide(color: Color(0xFFCBD5E1)),
                      ),
                    ),
                    onSubmitted: _sendQuery,
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  icon: const Icon(Icons.send_rounded),
                  style: IconButton.styleFrom(backgroundColor: const Color(0xFF4F46E5)),
                  onPressed: () => _sendQuery(_promptController.text),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPresetChip(String text) {
    return ActionChip(
      label: Text(text, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
      backgroundColor: Colors.white,
      side: const BorderSide(color: Color(0xFFCBD5E1)),
      onPressed: () => _sendQuery(text),
    );
  }
}
