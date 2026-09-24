from pathlib import Path
import re
root = Path(__file__).resolve().parents[1]/'sources/The-POS-Flutter/lib/features/carts/presentation/views'
for layout in ['mobile','web']:
    path = root/layout/'cart_view.dart'
    text = path.read_text(encoding='utf-8')
    if 'mode: Mode.MENU' not in text: continue
    text = text.replace('mode: Mode.MENU,', 'popupProps: PopupProps.menu(showSearchBox: true, isFilterOnline: true, showSelectedItems: true, itemBuilder: _customPopupItemBuilder),')
    text = re.sub(r'^\s+(showSearchBox|isFilteredOnline|showSelectedItems): true,\n', '\n', text, flags=re.M)
    text = text.replace('onFind: (String? value) => customerController.onSearch(value!),', 'asyncItems: (String value) => customerController.onSearch(value),')
    text = re.sub(r'dropDownButton: const Icon\((.*?)\n(\s*)\),', r'dropdownButtonProps: const DropdownButtonProps(icon: Icon(\1\n\2)),', text, flags=re.S)
    hint = re.search(r'^\s+hint: (.*),\n', text, flags=re.M)
    hint_value = hint.group(1) if hint else "'Select customer'"
    text = re.sub(r'^\s+hint: .*\n', '\n', text, flags=re.M)
    text = text.replace('dropdownSearchDecoration: const InputDecoration(', 'dropdownDecoratorProps: DropDownDecoratorProps(dropdownSearchDecoration: const InputDecoration(hintText: '+hint_value+',')
    text = text.replace('contentPadding: EdgeInsets.zero),', 'contentPadding: EdgeInsets.zero)),')
    text = re.sub(r'^\s+popupItemBuilder: _customPopupItemBuilder,\n', '\n', text, flags=re.M)
    path.write_text(text, encoding='utf-8')
