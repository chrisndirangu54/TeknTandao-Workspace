import 'package:flutter/material.dart';

Future<List<String>?> recordForm(
  BuildContext context,
  String title,
  List<String> labels,
) async {
  final controllers = labels.map((_) => TextEditingController()).toList();
  final result = await showDialog<List<String>>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: SizedBox(
        width: 420,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var i = 0; i < labels.length; i++)
                Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: TextField(
                    controller: controllers[i],
                    decoration: InputDecoration(labelText: labels[i]),
                  ),
                ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(
            context,
            controllers.map((c) => c.text.trim()).toList(),
          ),
          child: const Text('Save'),
        ),
      ],
    ),
  );
  await Future<void>.delayed(const Duration(milliseconds: 250));
  for (final c in controllers) {
    c.dispose();
  }
  return result;
}
