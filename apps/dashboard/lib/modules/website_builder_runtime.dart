import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

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
    ? value.whereType<Map>().map((item) => Map<String, dynamic>.from(item)).toList()
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

class JsonWebsiteRuntime extends StatelessWidget {
  final Map<String, dynamic> document;
  final String? pageId;
  final bool editable;
  final String? selectedNodeId;
  final ValueChanged<String>? onSelectNode;
  final void Function(String parentNodeId, String componentType)? onDropComponent;

  const JsonWebsiteRuntime({
    super.key,
    required this.document,
    this.pageId,
    this.editable = false,
    this.selectedNodeId,
    this.onSelectNode,
    this.onDropComponent,
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
                  maxWidth: ((theme['maxContentWidth'] as num?)?.toDouble() ??
                          1200)
                      .clamp(320, 2400)
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

  const _SiteNode({
    required this.node,
    required this.document,
    required this.availableWidth,
    required this.editable,
    required this.selectedNodeId,
    required this.onSelectNode,
    required this.onDropComponent,
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
        builder: (context, candidates, rejects) => MouseRegion(
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

  List<Widget> _children() => siteList(node['children'])
      .map(
        (child) => _SiteNode(
          node: child,
          document: document,
          availableWidth: availableWidth,
          editable: editable,
          selectedNodeId: selectedNodeId,
          onSelectNode: onSelectNode,
          onDropComponent: onDropComponent,
        ),
      )
      .toList(growable: false);

  Widget _buildContent(
    BuildContext context,
    Map<String, dynamic> style,
    Map<String, dynamic> theme,
  ) {
    final type = node['type']?.toString() ?? 'text';
    final props = siteMap(node['props']);
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
            aspectRatio: (props['aspectRatio'] as num?)?.toDouble() ?? 16 / 9,
            child: Image.network(
              imageUrl,
              fit: BoxFit.cover,
              errorBuilder: (_, _, _) => ColoredBox(
                color: const Color(0xFFE2E8F0),
                child: const Center(child: Icon(Icons.broken_image_outlined)),
              ),
            ),
          ),
        );
      case 'button':
        return Align(
          alignment: _alignment(style['alignment']),
          child: FilledButton(
            onPressed: editable ? null : () => _runAction(context),
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
        return Divider(color: siteColor(style['borderColor'], const Color(0xFFE2E8F0)));
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
        final columns = (availableWidth < 600
                ? 1
                : availableWidth < 960
                    ? requested.clamp(1, 2)
                    : requested.clamp(1, 6))
            .toInt();
        return GridView.count(
          crossAxisCount: columns,
          crossAxisSpacing: gap,
          mainAxisSpacing: gap,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          childAspectRatio: (props['childAspectRatio'] as num?)?.toDouble() ?? 1.6,
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
        return _navbar(context, props, children, foreground);
      case 'hero':
        return _hero(context, props, children, foreground);
      case 'cta':
        return _cta(props, children, foreground);
      case 'footer':
        return _footer(props, children, foreground);
      case 'form':
        return _form(props, children);
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
    BuildContext context,
    Map<String, dynamic> props,
    List<Widget> children,
    Color foreground,
  ) {
    return Row(
      children: [
        Expanded(
          child: Text(
            props['brand']?.toString() ?? document['title']?.toString() ?? 'Brand',
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
    BuildContext context,
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
            style: TextStyle(color: foreground.withValues(alpha: 0.72), fontSize: 18, height: 1.5),
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
  ) => Column(
        children: [
          Text(
            props['title']?.toString() ?? 'Ready to get started?',
            textAlign: TextAlign.center,
            style: TextStyle(color: foreground, fontSize: 32, fontWeight: FontWeight.w800),
          ),
          if ((props['subtitle']?.toString() ?? '').isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text(props['subtitle'].toString(), textAlign: TextAlign.center),
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
  ) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ...children,
          if ((props['copyright']?.toString() ?? '').isNotEmpty) ...[
            const SizedBox(height: 20),
            Text(props['copyright'].toString(), style: TextStyle(color: foreground.withValues(alpha: 0.65))),
          ],
        ],
      );

  Widget _form(Map<String, dynamic> props, List<Widget> children) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if ((props['title']?.toString() ?? '').isNotEmpty)
            Text(props['title'].toString(), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          TextField(decoration: InputDecoration(labelText: props['field1']?.toString() ?? 'Name')),
          const SizedBox(height: 12),
          TextField(decoration: InputDecoration(labelText: props['field2']?.toString() ?? 'Email')),
          const SizedBox(height: 12),
          ...children,
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
    if (style['width'] == 'content') current = Align(alignment: _alignment(style['alignment']), child: IntrinsicWidth(child: current));
    return current;
  }

  Future<void> _runAction(BuildContext context) async {
    final action = siteMap(node['action']);
    switch (action['type']) {
      case 'externalUrl':
        final uri = Uri.tryParse(action['url']?.toString() ?? '');
        if (uri != null) await launchUrl(uri, mode: LaunchMode.platformDefault);
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

  List<Widget> _withGap(List<Widget> children, double gap, {bool vertical = false}) {
    final result = <Widget>[];
    for (var i = 0; i < children.length; i++) {
      if (i > 0) result.add(SizedBox(width: vertical ? 0 : gap, height: vertical ? gap : 0));
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
