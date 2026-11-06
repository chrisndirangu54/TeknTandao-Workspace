import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

typedef WebsiteCmsResolver = Future<List<Map<String, dynamic>>> Function(
  String collectionId,
  int limit,
);
typedef WebsitePluginResolver = Future<Map<String, dynamic>> Function(
  String pluginId,
  String component,
  Map<String, dynamic> input,
);
typedef WebsiteFormSubmitter = Future<Map<String, dynamic>> Function(
  String formId,
  Map<String, String> values,
  int elapsedMs,
);
typedef WebsiteConversionRecorder = Future<void> Function(String event);

Color siteColor(dynamic value, [Color fallback = const Color(0xFF0F172A)]) {
  final raw = value?.toString().replaceFirst('#', '') ?? '';
  if (raw.length != 6 && raw.length != 8) return fallback;
  final parsed = int.tryParse(raw, radix: 16);
  if (parsed == null) return fallback;
  return Color(raw.length == 6 ? 0xFF000000 | parsed : parsed);
}

Map<String, dynamic> siteMap(dynamic value) =>
    value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};

List<Map<String, dynamic>> siteList(dynamic value) => value is List
    ? value
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList()
    : <Map<String, dynamic>>[];

String websiteBreakpoint(double width) {
  if (width < 600) return 'mobile';
  if (width < 1024) return 'tablet';
  if (width < 1440) return 'desktop';
  return 'wide';
}

Map<String, dynamic> resolvedNodeStyle(
  Map<String, dynamic> node,
  double width,
) {
  final base = siteMap(node['style']);
  final responsive = siteMap(node['responsive']);
  return {...base, ...siteMap(responsive[websiteBreakpoint(width)])};
}

Map<String, dynamic>? findWebsiteNode(
  Map<String, dynamic> document,
  String nodeId,
) {
  Map<String, dynamic>? search(Map<String, dynamic> node) {
    if (node['id']?.toString() == nodeId) return node;
    for (final child in siteList(node['children'])) {
      final found = search(child);
      if (found != null) return found;
    }
    return null;
  }

  for (final page in siteList(document['pages'])) {
    final found = search(siteMap(page['root']));
    if (found != null) return found;
  }
  return null;
}

String _bindString(String value, Map<String, dynamic> context) {
  return value.replaceAllMapped(RegExp(r'\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}'), (
    match,
  ) {
    dynamic current = context;
    for (final part in match.group(1)!.split('.')) {
      if (current is! Map || !current.containsKey(part)) return '';
      current = current[part];
    }
    return current?.toString() ?? '';
  });
}

Map<String, dynamic> _bindMap(
  Map<String, dynamic> input,
  Map<String, dynamic> context,
) => {
      for (final entry in input.entries)
        entry.key: entry.value is String
            ? _bindString(entry.value as String, context)
            : entry.value,
    };

class JsonWebsiteRuntime extends StatelessWidget {
  final Map<String, dynamic> document;
  final String? pageId;
  final bool editable;
  final String? selectedNodeId;
  final ValueChanged<String>? onSelectNode;
  final void Function(String parentNodeId, String componentType)? onDropComponent;
  final Map<String, dynamic> dataContext;
  final WebsiteCmsResolver? cmsResolver;
  final WebsitePluginResolver? pluginResolver;
  final WebsiteFormSubmitter? formSubmitter;
  final WebsiteConversionRecorder? conversionRecorder;

  const JsonWebsiteRuntime({
    super.key,
    required this.document,
    this.pageId,
    this.editable = false,
    this.selectedNodeId,
    this.onSelectNode,
    this.onDropComponent,
    this.dataContext = const {},
    this.cmsResolver,
    this.pluginResolver,
    this.formSubmitter,
    this.conversionRecorder,
  });

  @override
  Widget build(BuildContext context) {
    final pages = siteList(document['pages']);
    if (pages.isEmpty) {
      return const Center(child: Text('This website has no pages.'));
    }
    final page = pages.firstWhere(
      (item) => item['id'] == pageId,
      orElse: () => pages.first,
    );
    final theme = siteMap(document['theme']);
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth.isFinite
            ? constraints.maxWidth
            : 1200.0;
        return ColoredBox(
          color: siteColor(theme['backgroundColor'], Colors.white),
          child: SingleChildScrollView(
            child: Center(
              child: ConstrainedBox(
                constraints: BoxConstraints(
                  maxWidth: (((theme['maxContentWidth'] as num?)?.toDouble() ??
                              1200)
                          .clamp(320, 2400))
                      .toDouble(),
                ),
                child: _SiteNode(
                  node: siteMap(page['root']),
                  document: document,
                  availableWidth: width,
                  editable: editable,
                  selectedNodeId: selectedNodeId,
                  onSelectNode: onSelectNode,
                  onDropComponent: onDropComponent,
                  dataContext: dataContext,
                  cmsResolver: cmsResolver,
                  pluginResolver: pluginResolver,
                  formSubmitter: formSubmitter,
                  conversionRecorder: conversionRecorder,
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class _SiteNode extends StatelessWidget {
  final Map<String, dynamic> node;
  final Map<String, dynamic> document;
  final double availableWidth;
  final bool editable;
  final String? selectedNodeId;
  final ValueChanged<String>? onSelectNode;
  final void Function(String parentNodeId, String componentType)? onDropComponent;
  final Map<String, dynamic> dataContext;
  final WebsiteCmsResolver? cmsResolver;
  final WebsitePluginResolver? pluginResolver;
  final WebsiteFormSubmitter? formSubmitter;
  final WebsiteConversionRecorder? conversionRecorder;
  final int pluginDepth;

  const _SiteNode({
    required this.node,
    required this.document,
    required this.availableWidth,
    required this.editable,
    required this.selectedNodeId,
    required this.onSelectNode,
    required this.onDropComponent,
    required this.dataContext,
    required this.cmsResolver,
    required this.pluginResolver,
    required this.formSubmitter,
    required this.conversionRecorder,
    this.pluginDepth = 0,
  });

  @override
  Widget build(BuildContext context) {
    final id = node['id']?.toString() ?? '';
    final style = resolvedNodeStyle(node, availableWidth);
    if (style['hidden'] == true) return const SizedBox.shrink();
    final theme = siteMap(document['theme']);
    Widget content = _buildContent(context, style, theme);
    content = _decorate(content, style, theme);

    if (editable) {
      final selected = id == selectedNodeId;
      content = DragTarget<String>(
        onWillAcceptWithDetails: (_) => _acceptsChildren(node['type']?.toString()),
        onAcceptWithDetails: (details) =>
            onDropComponent?.call(id, details.data),
        builder: (context, candidates, _) => MouseRegion(
          cursor: SystemMouseCursors.click,
          child: GestureDetector(
            behavior: HitTestBehavior.translucent,
            onTap: () => onSelectNode?.call(id),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 120),
              decoration: BoxDecoration(
                border: Border.all(
                  color: selected
                      ? const Color(0xFF2563EB)
                      : candidates.isNotEmpty
                          ? const Color(0xFF10B981)
                          : Colors.transparent,
                  width: selected || candidates.isNotEmpty ? 2 : 0,
                ),
              ),
              child: content,
            ),
          ),
        ),
      );
    }
    return content;
  }

  bool _acceptsChildren(String? type) => !{
        'heading',
        'text',
        'richText',
        'image',
        'button',
        'icon',
        'divider',
        'spacer',
      }.contains(type);

  List<Widget> _children([Map<String, dynamic>? childContext]) =>
      siteList(node['children'])
          .map(
            (child) => _SiteNode(
              node: child,
              document: document,
              availableWidth: availableWidth,
              editable: editable,
              selectedNodeId: selectedNodeId,
              onSelectNode: onSelectNode,
              onDropComponent: onDropComponent,
              dataContext: childContext ?? dataContext,
              cmsResolver: cmsResolver,
              pluginResolver: pluginResolver,
              formSubmitter: formSubmitter,
              conversionRecorder: conversionRecorder,
              pluginDepth: pluginDepth,
            ),
          )
          .toList(growable: false);

  Widget _buildContent(
    BuildContext context,
    Map<String, dynamic> style,
    Map<String, dynamic> theme,
  ) {
    final type = node['type']?.toString() ?? 'text';
    final props = _bindMap(siteMap(node['props']), dataContext);
    final dataCollection = props['dataCollection']?.toString();
    if (dataCollection != null && dataCollection.isNotEmpty && cmsResolver != null) {
      return _CmsCollection(
        collectionId: dataCollection,
        limit: ((props['dataLimit'] as num?)?.toInt() ?? 20).clamp(1, 100),
        resolver: cmsResolver!,
        builder: (item) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: _children(item),
        ),
      );
    }

    final pluginId = props['pluginId']?.toString();
    if (pluginId != null && pluginId.isNotEmpty && pluginResolver != null) {
      if (pluginDepth >= 3) {
        return const Text('Plugin nesting limit reached.');
      }
      return _PluginFragment(
        pluginId: pluginId,
        component: props['pluginComponent']?.toString() ?? 'default',
        input: dataContext,
        resolver: pluginResolver!,
        renderer: (fragment) => _SiteNode(
          node: fragment,
          document: document,
          availableWidth: availableWidth,
          editable: false,
          selectedNodeId: null,
          onSelectNode: null,
          onDropComponent: null,
          dataContext: dataContext,
          cmsResolver: cmsResolver,
          pluginResolver: pluginResolver,
          formSubmitter: formSubmitter,
          conversionRecorder: conversionRecorder,
          pluginDepth: pluginDepth + 1,
        ),
      );
    }

    final children = _children();
    final foreground = siteColor(
      style['foregroundColor'],
      siteColor(theme['textColor']),
    );
    final gap = (style['gap'] as num?)?.toDouble() ?? 12;
    final fontSize = (style['fontSize'] as num?)?.toDouble();
    final fontWeight = _fontWeight(style['fontWeight']);

    switch (type) {
      case 'heading':
        return Text(
          props['text']?.toString() ?? '',
          style: TextStyle(
            color: foreground,
            fontSize: fontSize ?? 38,
            fontWeight: fontWeight ?? FontWeight.w800,
            height: 1.12,
          ),
        );
      case 'text':
      case 'richText':
        return Text(
          props['text']?.toString() ?? '',
          style: TextStyle(
            color: foreground,
            fontSize: fontSize ?? 16,
            fontWeight: fontWeight,
            height: 1.5,
          ),
        );
      case 'image':
        final imageUrl = props['imageUrl']?.toString() ?? '';
        return ClipRRect(
          borderRadius: BorderRadius.circular(
            (style['radius'] as num?)?.toDouble() ?? 12,
          ),
          child: AspectRatio(
            aspectRatio:
                (props['aspectRatio'] as num?)?.toDouble() ?? 16 / 9,
            child: Image.network(
              imageUrl,
              fit: BoxFit.cover,
              errorBuilder: (_, _, _) => const ColoredBox(
                color: Color(0xFFE2E8F0),
                child: Center(child: Icon(Icons.broken_image_outlined)),
              ),
            ),
          ),
        );
      case 'button':
        return Align(
          alignment: _alignment(style['alignment']),
          child: FilledButton(
            onPressed: editable
                ? null
                : () async {
                    final event = props['conversionEvent']?.toString();
                    if (event != null && event.isNotEmpty) {
                      await conversionRecorder?.call(event);
                    }
                    if (context.mounted) await _runAction(context);
                  },
            child: Text(props['text']?.toString() ?? 'Button'),
          ),
        );
      case 'icon':
        return Icon(
          _icon(props['icon']?.toString()),
          size: (props['size'] as num?)?.toDouble() ?? 32,
          color: foreground,
        );
      case 'divider':
        return Divider(
          color: siteColor(
            style['borderColor'],
            const Color(0xFFE2E8F0),
          ),
        );
      case 'spacer':
        return SizedBox(height: (props['height'] as num?)?.toDouble() ?? 32);
      case 'row':
        if (availableWidth < 700) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: _withGap(children, gap, vertical: true),
          );
        }
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: _withGap(
            children.map((child) => Expanded(child: child)).toList(),
            gap,
          ),
        );
      case 'wrap':
        return Wrap(spacing: gap, runSpacing: gap, children: children);
      case 'stack':
        return Stack(children: children);
      case 'grid':
      case 'features':
      case 'pricing':
      case 'testimonials':
        final requested = (props['columns'] as num?)?.toInt() ?? 3;
        final columns = availableWidth < 600
            ? 1
            : availableWidth < 960
                ? requested.clamp(1, 2)
                : requested.clamp(1, 6);
        return GridView.count(
          crossAxisCount: columns,
          crossAxisSpacing: gap,
          mainAxisSpacing: gap,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          childAspectRatio:
              (props['childAspectRatio'] as num?)?.toDouble() ?? 1.6,
          children: children,
        );
      case 'card':
        return Card(
          elevation: (style['elevation'] as num?)?.toDouble() ?? 0,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: _withGap(children, gap, vertical: true),
            ),
          ),
        );
      case 'navbar':
        return _navbar(props, children, foreground);
      case 'hero':
        return _hero(props, children, foreground);
      case 'cta':
        return _cta(props, children, foreground);
      case 'footer':
        return _footer(props, children, foreground);
      case 'form':
        return _RuntimeForm(
          formId: node['id']?.toString() ?? 'form',
          props: props,
          submitter: formSubmitter,
          conversionRecorder: conversionRecorder,
        );
      case 'page':
      case 'section':
      case 'container':
      case 'column':
      default:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: _withGap(children, gap, vertical: true),
        );
    }
  }

  Widget _navbar(
    Map<String, dynamic> props,
    List<Widget> children,
    Color foreground,
  ) {
    return Row(
      children: [
        Expanded(
          child: Text(
            props['brand']?.toString() ??
                document['title']?.toString() ??
                'Brand',
            style: TextStyle(
              color: foreground,
              fontSize: 20,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
        if (availableWidth >= 760) ...children.take(5),
        if (availableWidth < 760) const Icon(Icons.menu_rounded),
      ],
    );
  }

  Widget _hero(
    Map<String, dynamic> props,
    List<Widget> children,
    Color foreground,
  ) {
    final text = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if ((props['eyebrow']?.toString() ?? '').isNotEmpty)
          Text(
            props['eyebrow'].toString().toUpperCase(),
            style: TextStyle(
              color: siteColor(siteMap(document['theme'])['primaryColor']),
              fontWeight: FontWeight.bold,
              letterSpacing: 1.2,
            ),
          ),
        const SizedBox(height: 10),
        Text(
          props['title']?.toString() ?? document['title']?.toString() ?? '',
          style: TextStyle(
            color: foreground,
            fontSize: availableWidth < 600 ? 40 : 64,
            height: 1.02,
            fontWeight: FontWeight.w900,
          ),
        ),
        if ((props['subtitle']?.toString() ?? '').isNotEmpty) ...[
          const SizedBox(height: 16),
          Text(
            props['subtitle'].toString(),
            style: TextStyle(
              color: foreground.withValues(alpha: 0.72),
              fontSize: 18,
              height: 1.5,
            ),
          ),
        ],
        if (children.isNotEmpty) ...[
          const SizedBox(height: 24),
          Wrap(spacing: 12, runSpacing: 12, children: children),
        ],
      ],
    );
    return ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 360),
      child: Align(alignment: Alignment.centerLeft, child: text),
    );
  }

  Widget _cta(
    Map<String, dynamic> props,
    List<Widget> children,
    Color foreground,
  ) =>
      Column(
        children: [
          Text(
            props['title']?.toString() ?? 'Ready to get started?',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: foreground,
              fontSize: 32,
              fontWeight: FontWeight.w800,
            ),
          ),
          if ((props['subtitle']?.toString() ?? '').isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text(
                props['subtitle'].toString(),
                textAlign: TextAlign.center,
              ),
            ),
          if (children.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 18),
              child: Wrap(spacing: 12, runSpacing: 12, children: children),
            ),
        ],
      );

  Widget _footer(
    Map<String, dynamic> props,
    List<Widget> children,
    Color foreground,
  ) =>
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ...children,
          if ((props['copyright']?.toString() ?? '').isNotEmpty) ...[
            const SizedBox(height: 20),
            Text(
              props['copyright'].toString(),
              style: TextStyle(color: foreground.withValues(alpha: 0.65)),
            ),
          ],
        ],
      );

  Widget _decorate(
    Widget child,
    Map<String, dynamic> style,
    Map<String, dynamic> theme,
  ) {
    final padding = (style['padding'] as num?)?.toDouble() ?? 0;
    final margin = (style['margin'] as num?)?.toDouble() ?? 0;
    final radius = (style['radius'] as num?)?.toDouble() ??
        (theme['radius'] as num?)?.toDouble() ??
        0;
    final maxWidth = (style['maxWidth'] as num?)?.toDouble();
    final minHeight = (style['minHeight'] as num?)?.toDouble();
    Widget current = Container(
      constraints: BoxConstraints(
        maxWidth: maxWidth ?? double.infinity,
        minHeight: minHeight ?? 0,
      ),
      padding: EdgeInsets.all(padding),
      margin: EdgeInsets.all(margin),
      decoration: BoxDecoration(
        color: style['backgroundColor'] == null
            ? null
            : siteColor(style['backgroundColor'], Colors.transparent),
        borderRadius: BorderRadius.circular(radius),
        border: style['borderColor'] == null
            ? null
            : Border.all(color: siteColor(style['borderColor'])),
      ),
      child: child,
    );
    if (style['width'] == 'content') {
      current = Align(
        alignment: _alignment(style['alignment']),
        child: IntrinsicWidth(child: current),
      );
    }
    return current;
  }

  Future<void> _runAction(BuildContext context) async {
    final action = siteMap(node['action']);
    switch (action['type']) {
      case 'externalUrl':
        final uri = Uri.tryParse(action['url']?.toString() ?? '');
        if (uri != null) {
          await launchUrl(uri, mode: LaunchMode.platformDefault);
        }
        break;
      case 'navigate':
        final target = action['path']?.toString();
        if (target != null && context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Runtime navigation target: $target')),
          );
        }
        break;
    }
  }

  List<Widget> _withGap(
    List<Widget> children,
    double gap, {
    bool vertical = false,
  }) {
    final result = <Widget>[];
    for (var i = 0; i < children.length; i++) {
      if (i > 0) {
        result.add(
          SizedBox(
            width: vertical ? 0 : gap,
            height: vertical ? gap : 0,
          ),
        );
      }
      result.add(children[i]);
    }
    return result;
  }

  Alignment _alignment(dynamic value) => switch (value?.toString()) {
        'center' => Alignment.center,
        'end' => Alignment.centerRight,
        _ => Alignment.centerLeft,
      };

  FontWeight? _fontWeight(dynamic value) => switch ((value as num?)?.toInt()) {
        100 => FontWeight.w100,
        200 => FontWeight.w200,
        300 => FontWeight.w300,
        400 => FontWeight.w400,
        500 => FontWeight.w500,
        600 => FontWeight.w600,
        700 => FontWeight.w700,
        800 => FontWeight.w800,
        900 => FontWeight.w900,
        _ => null,
      };

  IconData _icon(String? value) => switch (value) {
        'store' => Icons.storefront_rounded,
        'rocket' => Icons.rocket_launch_rounded,
        'check' => Icons.check_circle_rounded,
        'security' => Icons.security_rounded,
        'analytics' => Icons.analytics_rounded,
        'phone' => Icons.phone_rounded,
        'mail' => Icons.mail_rounded,
        'location' => Icons.location_on_rounded,
        _ => Icons.auto_awesome_rounded,
      };
}

class _CmsCollection extends StatelessWidget {
  final String collectionId;
  final int limit;
  final WebsiteCmsResolver resolver;
  final Widget Function(Map<String, dynamic>) builder;

  const _CmsCollection({
    required this.collectionId,
    required this.limit,
    required this.resolver,
    required this.builder,
  });

  @override
  Widget build(BuildContext context) => FutureBuilder<List<Map<String, dynamic>>>(
        future: resolver(collectionId, limit),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Text('Could not load content: ${snapshot.error}');
          }
          final rows = snapshot.data ?? const <Map<String, dynamic>>[];
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: rows.map(builder).toList(growable: false),
          );
        },
      );
}

class _PluginFragment extends StatelessWidget {
  final String pluginId;
  final String component;
  final Map<String, dynamic> input;
  final WebsitePluginResolver resolver;
  final Widget Function(Map<String, dynamic>) renderer;

  const _PluginFragment({
    required this.pluginId,
    required this.component,
    required this.input,
    required this.resolver,
    required this.renderer,
  });

  @override
  Widget build(BuildContext context) => FutureBuilder<Map<String, dynamic>>(
        future: resolver(pluginId, component, input),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Text('Plugin unavailable: ${snapshot.error}');
          }
          final result = snapshot.data ?? const {};
          final fragment = siteMap(result['fragment']);
          if (fragment.isEmpty) {
            final data = siteMap(result['data']);
            return Text(data['text']?.toString() ?? 'Plugin returned data.');
          }
          return renderer(fragment);
        },
      );
}

class _RuntimeForm extends StatefulWidget {
  final String formId;
  final Map<String, dynamic> props;
  final WebsiteFormSubmitter? submitter;
  final WebsiteConversionRecorder? conversionRecorder;

  const _RuntimeForm({
    required this.formId,
    required this.props,
    required this.submitter,
    required this.conversionRecorder,
  });

  @override
  State<_RuntimeForm> createState() => _RuntimeFormState();
}

class _RuntimeFormState extends State<_RuntimeForm> {
  late final DateTime _openedAt;
  final Map<String, TextEditingController> _controllers = {};
  bool _busy = false;
  String? _message;

  @override
  void initState() {
    super.initState();
    _openedAt = DateTime.now();
    for (var i = 1; i <= 8; i++) {
      final label = widget.props['field$i']?.toString();
      if (label != null && label.trim().isNotEmpty) {
        _controllers['field$i'] = TextEditingController();
      }
    }
    if (_controllers.isEmpty) {
      _controllers['field1'] = TextEditingController();
      _controllers['field2'] = TextEditingController();
    }
  }

  @override
  void dispose() {
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy || widget.submitter == null) return;
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      final result = await widget.submitter!(
        widget.formId,
        {for (final entry in _controllers.entries) entry.key: entry.value.text.trim()},
        DateTime.now().difference(_openedAt).inMilliseconds,
      );
      if (result['accepted'] == true) {
        await widget.conversionRecorder?.call('form_submit');
      }
      if (!mounted) return;
      setState(() {
        _message = result['accepted'] == false
            ? 'Thanks. Your submission was received for review.'
            : widget.props['successMessage']?.toString() ??
                'Thanks — your submission was received.';
      });
      if (result['accepted'] == true) {
        for (final controller in _controllers.values) {
          controller.clear();
        }
      }
    } catch (error) {
      if (mounted) setState(() => _message = 'Could not submit: $error');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if ((widget.props['title']?.toString() ?? '').isNotEmpty)
          Text(
            widget.props['title'].toString(),
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
          ),
        const SizedBox(height: 12),
        for (final entry in _controllers.entries) ...[
          TextField(
            controller: entry.value,
            decoration: InputDecoration(
              labelText:
                  widget.props[entry.key]?.toString() ?? entry.key.toUpperCase(),
            ),
          ),
          const SizedBox(height: 12),
        ],
        FilledButton.icon(
          onPressed: _busy || widget.submitter == null ? null : _submit,
          icon: _busy
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.send_rounded),
          label: Text(widget.props['submitText']?.toString() ?? 'Submit'),
        ),
        if (_message != null)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Text(_message!),
          ),
      ],
    );
  }
}
