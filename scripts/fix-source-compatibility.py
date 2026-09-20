"""Apply narrowly scoped, repeatable fixes to the audited donor checkouts."""
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
sources = root / 'sources'
def edit(path, transform):
    old = path.read_text(encoding='utf-8-sig')
    new = transform(old)
    if old != new:
        path.write_text(new, encoding='utf-8')
        print(path.relative_to(root))

edit(sources/'ClientFlow/pubspec.yaml', lambda s: s.replace('name: ClientFlow', 'name: clientflow'))
for name in ['employee-attendance','flutter_hr_management_design','SchoolMate-App','The-POS-Flutter']:
    edit(sources/name/'pubspec.yaml', lambda s: re.sub(r'sdk: ([\'\"])>=2\.[^\r\n]+<3\.0\.0\1', "sdk: '>=3.3.0 <4.0.0'", s))

edit(sources/'FlareLine-CRM/lib/core/theme/global_theme.dart', lambda s: re.sub(r'\bCardTheme\b', 'CardThemeData', s))
edit(sources/'SchoolMate-App/lib/main.dart', lambda s: s.replace('backgroundColor: backgroundColor,', 'scaffoldBackgroundColor: backgroundColor,'))
edit(sources/'SchoolMate-App/lib/student/view/chatsearch/chat_search.dart', lambda s: s.replace("import 'package:flutter/material.dart';", "import 'package:flutter/material.dart' hide SearchController;"))

for name in ['The-POS-Flutter', 'SchoolMate-App']:
    for path in (sources/name/'lib').rglob('*.dart'):
        def modernize(text):
            # Only migrate arguments inside a button's styleFrom call.
            def style(match):
                kind, args = match.group(1), match.group(2)
                args = re.sub(r'\bprimary:', 'foregroundColor:' if kind == 'TextButton' else 'backgroundColor:', args)
                args = re.sub(r'\bonPrimary:', 'foregroundColor:', args)
                return kind + '.styleFrom(' + args + ')'
            text = re.sub(r'(TextButton|ElevatedButton|OutlinedButton)\.styleFrom\(([^;]*?)\)', style, text, flags=re.S)
            # MaterialButton retains the old buttons' color/padding API.
            text = re.sub(r'\bFlatButton\(', 'MaterialButton(elevation: 0, ', text)
            text = re.sub(r'\bRaisedButton\(', 'MaterialButton(elevation: 2, ', text)
            return text
        edit(path, modernize)
