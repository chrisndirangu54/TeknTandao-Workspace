import 'package:flutter/material.dart';
import '../suite.dart';
import '../widgets/record_form.dart';

class InventoryModuleScreen extends StatefulWidget {
  final SuiteStore store;
  const InventoryModuleScreen({super.key, required this.store});
  @override State<InventoryModuleScreen> createState()=>_InventoryModuleScreenState();
}

class _InventoryModuleScreenState extends State<InventoryModuleScreen>{
  String query='';
  bool saving=false;

  Future<void> addProduct() async{
    final details=await recordForm(context,'Add New Product SKU',['Product Name','SKU Code','Price in KES','Initial Stock','Warehouse']);
    if(details==null||details.isEmpty||details[0].trim().isEmpty)return;
    final price=double.tryParse(details.length>2?details[2].replaceAll(',','').trim():'');
    final stock=int.tryParse(details.length>3?details[3].trim():'');
    if(price==null||price<0||stock==null||stock<0){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Enter a valid non-negative price and stock quantity.'),backgroundColor:Colors.red));
      return;
    }
    setState(()=>saving=true);
    try{
      final sku = details[1].trim();
      final warehouseId = details[4].trim().isEmpty ? 'main' : details[4].trim();
      final validId = RegExp(r'^[a-zA-Z0-9_-]{1,100}
    }catch(e){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text('Could not save product: $e'),backgroundColor:Colors.red.shade700));
    }finally{if(mounted)setState(()=>saving=false);}
  }

  Future<void> auditInventory() async {
    setState(() => saving = true);
    try {
      final audit = await widget.store.call('auditWarehouseInventory', {});
      if (!mounted) return;
      final raw = audit['issues'];
      final issues = raw is List ? raw : const [];
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(audit['ok'] == true ? 'Inventory reconciled' : 'Inventory discrepancies'),
          content: SizedBox(
            width: 550,
            child: issues.isEmpty
                ? const Text('No discrepancies detected in the scanned inventory.')
                : ListView.builder(
                    shrinkWrap: true,
                    itemCount: issues.length,
                    itemBuilder: (_, i) {
                      final issue = Map<String, dynamic>.from(issues[i] as Map);
                      return ListTile(
                        title: Text(issue['type']?.toString() ?? 'Discrepancy'),
                        subtitle: Text('SKU: ${issue['sku'] ?? 'unknown'}; warehouse: ${issue['warehouseId'] ?? 'all'}'),
                      );
                    },
                  ),
          ),
          actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Close'))],
        ),
      );
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Audit unsuccessful: $error')));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> assignStockBatch() async {
    final values = await recordForm(context, 'Assign tracked stock batch',
      ['SKU Code', 'Warehouse ID', 'Batch ID', 'Units', 'Expiry date YYYY-MM-DD (optional)']);
    if (values == null || values.length < 5) return;
    final units = int.tryParse(values[3].trim());
    if (units == null || units <= 0) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a positive batch quantity.')));
      return;
    }
    setState(() => saving = true);
    try {
      await widget.store.call('assignWarehouseStockBatch', {
        'requestId': 'batch_${DateTime.now().microsecondsSinceEpoch}',
        'sku': values[0].trim(), 'warehouseId': values[1].trim(),
        'batchId': values[2].trim(), 'quantity': units,
        'expiryAt': values[4].trim().isEmpty ? null : values[4].trim(),
      });
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Batch assigned to existing warehouse stock.')));
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Batch assignment failed: $error')));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> approvePurchaseOrder() async {
    final values = await recordForm(context, 'Approve purchase order',
      ['Purchase order ID']);
    if (values == null || values.isEmpty || values[0].trim().isEmpty) return;
    setState(() => saving = true);
    try {
      await widget.store.call('approveWarehousePurchaseOrder', {
        'purchaseOrderId': values[0].trim(),
      });
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Purchase order approved.')));
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Approval unsuccessful: $error')));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> receivePurchaseOrder() async {
    final values = await recordForm(context, 'Receive purchase order',
      ['Purchase order ID', 'SKU Code', 'Warehouse ID', 'Received units']);
    if (values == null || values.length < 4) return;
    final units = int.tryParse(values[3].trim());
    if (units == null || units <= 0) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a positive received quantity.')));
      return;
    }
    setState(() => saving = true);
    try {
      final response = await widget.store.call('receivePurchaseOrderStock', {
        'requestId': 'receipt_${DateTime.now().microsecondsSinceEpoch}',
        'purchaseOrderId': values[0].trim(),
        'sku': values[1].trim(),
        'warehouseId': values[2].trim(),
        'receiving': units,
      });
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Receipt recorded; remaining: ${response['remaining'] ?? 0}')));
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not receive order: $error')));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> postSupplierBill() async {
    final values = await recordForm(context, 'Post matched supplier bill',
      ['Supplier invoice ID']);
    if (values == null || values.isEmpty || values[0].trim().isEmpty) return;
    setState(() => saving = true);
    try {
      final result = await widget.store.call('postMatchedSupplierBill', {
        'invoiceId': values[0].trim(),
      });
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Bill ${result['id']} posted to payables. Payment not recorded.')));
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Posting unsuccessful: $error')));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> matchSupplierInvoice() async {
    final values = await recordForm(context, 'Match supplier invoice to received goods',
      ['Supplier invoice ID', 'Purchase order ID', 'Invoiced units', 'Unit price (KES)']);
    if (values == null || values.length < 4) return;
    final units = int.tryParse(values[2].trim());
    final price = double.tryParse(values[3].replaceAll(',', '').trim());
    if (units == null || units <= 0 || price == null || price <= 0) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter valid positive units and price.')));
      return;
    }
    setState(() => saving = true);
    try {
      final result = await widget.store.call('matchSupplierInvoice', {
        'invoiceId': values[0].trim(),
        'purchaseOrderId': values[1].trim(),
        'units': units,
        'unitPriceMinor': (price * 100).round(),
      });
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Matched bill ${result['id']}; accounting posting still required.')));
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Invoice matching failed: $error')));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> cancelPurchaseOrder() async {
    final values = await recordForm(context, 'Cancel unreceived purchase order',
      ['Purchase order ID']);
    if (values == null || values.isEmpty || values[0].trim().isEmpty) return;
    setState(() => saving = true);
    try {
      await widget.store.call('cancelWarehousePurchaseOrder', {
        'purchaseOrderId': values[0].trim(),
      });
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Purchase order cancelled.')));
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Cancellation unsuccessful: $error')));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> createPurchaseOrder() async {
    final values = await recordForm(context, 'New purchase order',
      ['SKU Code', 'Warehouse ID', 'Ordered units', 'Supplier ID (optional)']);
    if (values == null || values.length < 3) return;
    final units = int.tryParse(values[2].trim());
    if (units == null || units <= 0) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a positive order quantity.')));
      return;
    }
    setState(() => saving = true);
    try {
      final result = await widget.store.call('createWarehousePurchaseOrder', {
        'requestId': 'po_${DateTime.now().microsecondsSinceEpoch}',
        'sku': values[0].trim(),
        'warehouseId': values[1].trim(),
        'ordered': units,
        'supplierId': values.length > 3 && values[3].trim().isNotEmpty ? values[3].trim() : 'unassigned',
      });
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Draft PO created: ${result['id']}')));
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not create PO: $error')));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> showWarehouseBalances() async {
    setState(() => saving = true);
    try {
      final result = await widget.store.call('getWarehouseInventoryOverview', {});
      if (!mounted) return;
      final rawStock = result['stock'];
      final stock = rawStock is List ? rawStock : const [];
      await showDialog<void>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Warehouse balances'),
          content: SizedBox(
            width: 500,
            child: stock.isEmpty
                ? const Text('No warehouse stock records found.')
                : ListView.builder(
                    shrinkWrap: true,
                    itemCount: stock.length,
                    itemBuilder: (context, index) {
                      final item = Map<String, dynamic>.from(stock[index] as Map);
                      return ListTile(
                        title: Text(item['sku']?.toString() ?? 'Unknown SKU'),
                        subtitle: Text(item['warehouseId']?.toString() ?? 'Unknown warehouse'),
                        trailing: Text('${item['quantity'] ?? 0} units'),
                      );
                    },
                  ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Close'),
            ),
          ],
        ),
      );
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not load warehouse balances: $error')));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> transferStock() async {
    final values = await recordForm(context, 'Transfer warehouse stock',
      ['SKU Code', 'From warehouse ID', 'To warehouse ID', 'Units']);
    if (values == null || values.length < 4) return;
    final units = int.tryParse(values[3].trim());
    if (units == null || units <= 0) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a positive number of units.')));
      return;
    }
    setState(() => saving = true);
    try {
      await widget.store.call('transferWarehouseStock', {
        'requestId': 'transfer_${DateTime.now().microsecondsSinceEpoch}',
        'sku': values[0].trim(),
        'fromWarehouse': values[1].trim(),
        'toWarehouse': values[2].trim(),
        'quantity': units,
      });
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Warehouse transfer recorded.')));
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Transfer unsuccessful: $error')));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override Widget build(BuildContext context)=>Scaffold(
    backgroundColor:const Color(0xFFF5F7FB),
    appBar:AppBar(title:const Row(children:[Icon(Icons.inventory_2_rounded,color:Color(0xFFF59E0B)),SizedBox(width:10),Text('Inventory & Warehouses')])),
    floatingActionButton:FloatingActionButton.extended(onPressed:saving?null:addProduct,icon:const Icon(Icons.add_box_rounded),label:Text(saving?'Saving…':'Add SKU')),
    body:StreamBuilder<List<Map<String,dynamic>>>(
      stream:widget.store.watch('products'),
      builder:(context,snapshot){
        if(snapshot.connectionState==ConnectionState.waiting&&!snapshot.hasData)return const Center(child:CircularProgressIndicator());
        if(snapshot.hasError)return _InventoryState(icon:Icons.cloud_off_rounded,title:'Inventory data unavailable',message:snapshot.error.toString());
        final products=snapshot.data??const [];
        final normalized=query.trim().toLowerCase();
        final visible=normalized.isEmpty?products:products.where((p)=>p.values.any((v)=>v.toString().toLowerCase().contains(normalized))).toList();
        int stockOf(Map<String,dynamic> p)=>p['stock'] is num?(p['stock'] as num).round():int.tryParse((p['stock']??'0').toString())??0;
        final low=products.where((p)=>stockOf(p)<=5).length;
        final out=products.where((p)=>stockOf(p)<=0).length;
        final totalUnits=products.fold<int>(0,(sum,p)=>sum+stockOf(p));
        return ListView(
          padding:const EdgeInsets.fromLTRB(24,24,24,100),
          children:[
            Container(
              padding:const EdgeInsets.all(24),
              decoration:BoxDecoration(
                gradient:const LinearGradient(colors:[Color(0xFF111827),Color(0xFFD97706)]),
                borderRadius:BorderRadius.circular(24),
                boxShadow:const [BoxShadow(color:Color(0x22111827),blurRadius:30,offset:Offset(0,12))],
              ),
              child:Wrap(spacing:28,runSpacing:18,crossAxisAlignment:WrapCrossAlignment.center,children:[
                const SizedBox(width:260,child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
                  Text('Stock visibility with operational depth',style:TextStyle(color:Colors.white,fontSize:22,fontWeight:FontWeight.w800)),
                  SizedBox(height:6),
                  Text('Monitor canonical SKUs, low-stock risk and warehouse allocation from one place.',style:TextStyle(color:Color(0xFFFDE68A),height:1.4)),
                ])),
                _InventoryMetric(label:'SKUs',value:products.length.toString(),icon:Icons.inventory_2_outlined),
                _InventoryMetric(label:'Units on hand',value:totalUnits.toString(),icon:Icons.warehouse_rounded),
                _InventoryMetric(label:'Low stock',value:low.toString(),icon:Icons.warning_amber_rounded),
                _InventoryMetric(label:'Out of stock',value:out.toString(),icon:Icons.remove_shopping_cart_rounded),
              ]),
            ),
            const SizedBox(height:16),
            Align(
              alignment: Alignment.centerLeft,
              child: OutlinedButton.icon(
                onPressed: saving ? null : transferStock,
                icon: const Icon(Icons.swap_horiz_rounded),
                label: const Text('Transfer between warehouses'),
              ),
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerLeft,
              child: OutlinedButton.icon(
                onPressed: saving ? null : showWarehouseBalances,
                icon: const Icon(Icons.warehouse_outlined),
                label: const Text('View warehouse balances'),
              ),
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerLeft,
              child: OutlinedButton.icon(
                onPressed: saving ? null : createPurchaseOrder,
                icon: const Icon(Icons.receipt_long_outlined),
                label: const Text('Create draft purchase order'),
              ),
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerLeft,
              child: OutlinedButton.icon(
                onPressed: saving ? null : receivePurchaseOrder,
                icon: const Icon(Icons.inventory_rounded),
                label: const Text('Receive approved purchase order'),
              ),
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerLeft,
              child: OutlinedButton.icon(
                onPressed: saving ? null : approvePurchaseOrder,
                icon: const Icon(Icons.verified_outlined),
                label: const Text('Approve draft purchase order (owner)'),
              ),
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerLeft,
              child: OutlinedButton.icon(
                onPressed: saving ? null : cancelPurchaseOrder,
                icon: const Icon(Icons.cancel_outlined),
                label: const Text('Cancel unreceived purchase order (owner)'),
              ),
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerLeft,
              child: OutlinedButton.icon(
                onPressed: saving ? null : matchSupplierInvoice,
                icon: const Icon(Icons.request_quote_outlined),
                label: const Text('Match supplier invoice (owner)'),
              ),
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerLeft,
              child: OutlinedButton.icon(
                onPressed: saving ? null : postSupplierBill,
                icon: const Icon(Icons.account_balance_outlined),
                label: const Text('Post matched bill to payables (owner)'),
              ),
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerLeft,
              child: OutlinedButton.icon(
                onPressed: saving ? null : assignStockBatch,
                icon: const Icon(Icons.qr_code_2_rounded),
                label: const Text('Assign stock batch / expiry'),
              ),
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerLeft,
              child: OutlinedButton.icon(
                onPressed: saving ? null : auditInventory,
                icon: const Icon(Icons.fact_check_outlined),
                label: const Text('Audit stock reconciliation (owner)'),
              ),
            ),
            const SizedBox(height:20),
            TextField(
              decoration:const InputDecoration(prefixIcon:Icon(Icons.search_rounded),hintText:'Search SKU, product, warehouse or category'),
              onChanged:(v)=>setState(()=>query=v),
            ),
            const SizedBox(height:16),
            if(products.isEmpty)
              const _InventoryState(icon:Icons.inventory_2_outlined,title:'No inventory yet',message:'Create your first SKU to start tracking stock.')
            else if(visible.isEmpty)
              const _InventoryState(icon:Icons.search_off_rounded,title:'No matching products',message:'Try a broader search term.')
            else
              LayoutBuilder(builder:(context,constraints){
                final width=constraints.maxWidth>980?(constraints.maxWidth-24)/3:constraints.maxWidth>680?(constraints.maxWidth-12)/2:constraints.maxWidth;
                return Wrap(spacing:12,runSpacing:12,children:[for(final product in visible)SizedBox(width:width,child:_ProductCard(product:product))]);
              }),
          ],
        );
      },
    ),
  );
}

class _InventoryMetric extends StatelessWidget{
  final String label,value;final IconData icon;
  const _InventoryMetric({required this.label,required this.value,required this.icon});
  @override Widget build(BuildContext context)=>Container(
    padding:const EdgeInsets.symmetric(horizontal:16,vertical:14),
    decoration:BoxDecoration(color:Colors.white.withValues(alpha:.09),borderRadius:BorderRadius.circular(16),border:Border.all(color:Colors.white.withValues(alpha:.12))),
    child:Row(mainAxisSize:MainAxisSize.min,children:[Icon(icon,color:Colors.white),const SizedBox(width:10),Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(value,style:const TextStyle(color:Colors.white,fontWeight:FontWeight.w800,fontSize:20)),Text(label,style:const TextStyle(color:Color(0xFFFFF7ED),fontSize:12))])]),
  );
}

class _ProductCard extends StatelessWidget{
  final Map<String,dynamic> product;
  const _ProductCard({required this.product});
  @override Widget build(BuildContext context){
    final name=(product['name']??'Unnamed product').toString().trim();
    final stock=product['stock'] is num?(product['stock'] as num).round():int.tryParse((product['stock']??'0').toString())??0;
    final price=product['price'] is num?(product['price'] as num).round():int.tryParse((product['price']??'0').toString())??0;
    final level=stock<=0?'Out of stock':stock<=5?'Low stock':'Healthy';
    final badge=stock<=0?const Color(0xFFFEE2E2):stock<=5?const Color(0xFFFEF3C7):const Color(0xFFD1FAE5);
    return Container(
      padding:const EdgeInsets.all(18),
      decoration:BoxDecoration(color:Colors.white,borderRadius:BorderRadius.circular(18),border:Border.all(color:const Color(0xFFE5E7EB)),boxShadow:const [BoxShadow(color:Color(0x0D0F172A),blurRadius:18,offset:Offset(0,6))]),
      child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Row(children:[
          Container(padding:const EdgeInsets.all(10),decoration:BoxDecoration(color:const Color(0xFFFFF7ED),borderRadius:BorderRadius.circular(12)),child:const Icon(Icons.inventory_2_rounded,color:Color(0xFFD97706))),
          const Spacer(),
          Chip(backgroundColor:badge,label:Text(level,style:const TextStyle(fontWeight:FontWeight.w700))),
        ]),
        const SizedBox(height:14),
        Text(name.isEmpty?'Unnamed product':name,style:const TextStyle(fontWeight:FontWeight.w800,fontSize:16),maxLines:2,overflow:TextOverflow.ellipsis),
        const SizedBox(height:6),
        Text('SKU: '+(product['sku']??'—').toString(),style:const TextStyle(color:Color(0xFF64748B))),
        Text('Warehouse: '+(product['warehouse']??'—').toString(),style:const TextStyle(color:Color(0xFF64748B))),
        const SizedBox(height:14),
        Row(children:[Expanded(child:Text(kes(price),style:const TextStyle(fontWeight:FontWeight.w800,fontSize:16))),Text(stock.toString()+' units',style:const TextStyle(fontWeight:FontWeight.w700))]),
      ]),
    );
  }
}

class _InventoryState extends StatelessWidget{
  final IconData icon;final String title,message;
  const _InventoryState({required this.icon,required this.title,required this.message});
  @override Widget build(BuildContext context)=>Center(child:Container(
    constraints:const BoxConstraints(maxWidth:560),padding:const EdgeInsets.all(28),
    decoration:BoxDecoration(color:Colors.white,borderRadius:BorderRadius.circular(20),border:Border.all(color:const Color(0xFFE5E7EB))),
    child:Column(mainAxisSize:MainAxisSize.min,children:[Icon(icon,size:44,color:const Color(0xFF64748B)),const SizedBox(height:12),Text(title,style:const TextStyle(fontWeight:FontWeight.w800,fontSize:18)),const SizedBox(height:6),Text(message,textAlign:TextAlign.center,style:const TextStyle(color:Color(0xFF64748B)))]),
  ));
}
);
      if (!validId.hasMatch(sku) || !validId.hasMatch(warehouseId)) {
        throw StateError('SKU and warehouse IDs must use letters, numbers, _ or - only.');
      }
      await widget.store.call('saveRecord',{'appId':'inventory','id':sku,'record':{
        'name':details[0].trim(),'sku':sku,
        'price':(price*100).round(),'stock':stock,
        'warehouseId':warehouseId,
        'category':'General Product',
      }});
    }catch(e){
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text('Could not save product: $e'),backgroundColor:Colors.red.shade700));
    }finally{if(mounted)setState(()=>saving=false);}
  }

  Future<void> approvePurchaseOrder() async {
    final values = await recordForm(context, 'Approve purchase order',
      ['Purchase order ID']);
    if (values == null || values.isEmpty || values[0].trim().isEmpty) return;
    setState(() => saving = true);
    try {
      await widget.store.call('approveWarehousePurchaseOrder', {
        'purchaseOrderId': values[0].trim(),
      });
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Purchase order approved.')));
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Approval unsuccessful: $error')));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> receivePurchaseOrder() async {
    final values = await recordForm(context, 'Receive purchase order',
      ['Purchase order ID', 'SKU Code', 'Warehouse ID', 'Received units']);
    if (values == null || values.length < 4) return;
    final units = int.tryParse(values[3].trim());
    if (units == null || units <= 0) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a positive received quantity.')));
      return;
    }
    setState(() => saving = true);
    try {
      final response = await widget.store.call('receivePurchaseOrderStock', {
        'requestId': 'receipt_${DateTime.now().microsecondsSinceEpoch}',
        'purchaseOrderId': values[0].trim(),
        'sku': values[1].trim(),
        'warehouseId': values[2].trim(),
        'receiving': units,
      });
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Receipt recorded; remaining: ${response['remaining'] ?? 0}')));
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not receive order: $error')));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> createPurchaseOrder() async {
    final values = await recordForm(context, 'New purchase order',
      ['SKU Code', 'Warehouse ID', 'Ordered units']);
    if (values == null || values.length < 3) return;
    final units = int.tryParse(values[2].trim());
    if (units == null || units <= 0) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a positive order quantity.')));
      return;
    }
    setState(() => saving = true);
    try {
      final result = await widget.store.call('createWarehousePurchaseOrder', {
        'requestId': 'po_${DateTime.now().microsecondsSinceEpoch}',
        'sku': values[0].trim(),
        'warehouseId': values[1].trim(),
        'ordered': units,
      });
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Draft PO created: ${result['id']}')));
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not create PO: $error')));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> showWarehouseBalances() async {
    setState(() => saving = true);
    try {
      final result = await widget.store.call('getWarehouseInventoryOverview', {});
      if (!mounted) return;
      final rawStock = result['stock'];
      final stock = rawStock is List ? rawStock : const [];
      await showDialog<void>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Warehouse balances'),
          content: SizedBox(
            width: 500,
            child: stock.isEmpty
                ? const Text('No warehouse stock records found.')
                : ListView.builder(
                    shrinkWrap: true,
                    itemCount: stock.length,
                    itemBuilder: (context, index) {
                      final item = Map<String, dynamic>.from(stock[index] as Map);
                      return ListTile(
                        title: Text(item['sku']?.toString() ?? 'Unknown SKU'),
                        subtitle: Text(item['warehouseId']?.toString() ?? 'Unknown warehouse'),
                        trailing: Text('${item['quantity'] ?? 0} units'),
                      );
                    },
                  ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Close'),
            ),
          ],
        ),
      );
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not load warehouse balances: $error')));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> transferStock() async {
    final values = await recordForm(context, 'Transfer warehouse stock',
      ['SKU Code', 'From warehouse ID', 'To warehouse ID', 'Units']);
    if (values == null || values.length < 4) return;
    final units = int.tryParse(values[3].trim());
    if (units == null || units <= 0) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a positive number of units.')));
      return;
    }
    setState(() => saving = true);
    try {
      await widget.store.call('transferWarehouseStock', {
        'requestId': 'transfer_${DateTime.now().microsecondsSinceEpoch}',
        'sku': values[0].trim(),
        'fromWarehouse': values[1].trim(),
        'toWarehouse': values[2].trim(),
        'quantity': units,
      });
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Warehouse transfer recorded.')));
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Transfer unsuccessful: $error')));
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override Widget build(BuildContext context)=>Scaffold(
    backgroundColor:const Color(0xFFF5F7FB),
    appBar:AppBar(title:const Row(children:[Icon(Icons.inventory_2_rounded,color:Color(0xFFF59E0B)),SizedBox(width:10),Text('Inventory & Warehouses')])),
    floatingActionButton:FloatingActionButton.extended(onPressed:saving?null:addProduct,icon:const Icon(Icons.add_box_rounded),label:Text(saving?'Saving…':'Add SKU')),
    body:StreamBuilder<List<Map<String,dynamic>>>(
      stream:widget.store.watch('products'),
      builder:(context,snapshot){
        if(snapshot.connectionState==ConnectionState.waiting&&!snapshot.hasData)return const Center(child:CircularProgressIndicator());
        if(snapshot.hasError)return _InventoryState(icon:Icons.cloud_off_rounded,title:'Inventory data unavailable',message:snapshot.error.toString());
        final products=snapshot.data??const [];
        final normalized=query.trim().toLowerCase();
        final visible=normalized.isEmpty?products:products.where((p)=>p.values.any((v)=>v.toString().toLowerCase().contains(normalized))).toList();
        int stockOf(Map<String,dynamic> p)=>p['stock'] is num?(p['stock'] as num).round():int.tryParse((p['stock']??'0').toString())??0;
        final low=products.where((p)=>stockOf(p)<=5).length;
        final out=products.where((p)=>stockOf(p)<=0).length;
        final totalUnits=products.fold<int>(0,(sum,p)=>sum+stockOf(p));
        return ListView(
          padding:const EdgeInsets.fromLTRB(24,24,24,100),
          children:[
            Container(
              padding:const EdgeInsets.all(24),
              decoration:BoxDecoration(
                gradient:const LinearGradient(colors:[Color(0xFF111827),Color(0xFFD97706)]),
                borderRadius:BorderRadius.circular(24),
                boxShadow:const [BoxShadow(color:Color(0x22111827),blurRadius:30,offset:Offset(0,12))],
              ),
              child:Wrap(spacing:28,runSpacing:18,crossAxisAlignment:WrapCrossAlignment.center,children:[
                const SizedBox(width:260,child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
                  Text('Stock visibility with operational depth',style:TextStyle(color:Colors.white,fontSize:22,fontWeight:FontWeight.w800)),
                  SizedBox(height:6),
                  Text('Monitor canonical SKUs, low-stock risk and warehouse allocation from one place.',style:TextStyle(color:Color(0xFFFDE68A),height:1.4)),
                ])),
                _InventoryMetric(label:'SKUs',value:products.length.toString(),icon:Icons.inventory_2_outlined),
                _InventoryMetric(label:'Units on hand',value:totalUnits.toString(),icon:Icons.warehouse_rounded),
                _InventoryMetric(label:'Low stock',value:low.toString(),icon:Icons.warning_amber_rounded),
                _InventoryMetric(label:'Out of stock',value:out.toString(),icon:Icons.remove_shopping_cart_rounded),
              ]),
            ),
            const SizedBox(height:16),
            Align(
              alignment: Alignment.centerLeft,
              child: OutlinedButton.icon(
                onPressed: saving ? null : transferStock,
                icon: const Icon(Icons.swap_horiz_rounded),
                label: const Text('Transfer between warehouses'),
              ),
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerLeft,
              child: OutlinedButton.icon(
                onPressed: saving ? null : showWarehouseBalances,
                icon: const Icon(Icons.warehouse_outlined),
                label: const Text('View warehouse balances'),
              ),
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerLeft,
              child: OutlinedButton.icon(
                onPressed: saving ? null : createPurchaseOrder,
                icon: const Icon(Icons.receipt_long_outlined),
                label: const Text('Create draft purchase order'),
              ),
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerLeft,
              child: OutlinedButton.icon(
                onPressed: saving ? null : receivePurchaseOrder,
                icon: const Icon(Icons.inventory_rounded),
                label: const Text('Receive approved purchase order'),
              ),
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerLeft,
              child: OutlinedButton.icon(
                onPressed: saving ? null : approvePurchaseOrder,
                icon: const Icon(Icons.verified_outlined),
                label: const Text('Approve draft purchase order (owner)'),
              ),
            ),
            const SizedBox(height:20),
            TextField(
              decoration:const InputDecoration(prefixIcon:Icon(Icons.search_rounded),hintText:'Search SKU, product, warehouse or category'),
              onChanged:(v)=>setState(()=>query=v),
            ),
            const SizedBox(height:16),
            if(products.isEmpty)
              const _InventoryState(icon:Icons.inventory_2_outlined,title:'No inventory yet',message:'Create your first SKU to start tracking stock.')
            else if(visible.isEmpty)
              const _InventoryState(icon:Icons.search_off_rounded,title:'No matching products',message:'Try a broader search term.')
            else
              LayoutBuilder(builder:(context,constraints){
                final width=constraints.maxWidth>980?(constraints.maxWidth-24)/3:constraints.maxWidth>680?(constraints.maxWidth-12)/2:constraints.maxWidth;
                return Wrap(spacing:12,runSpacing:12,children:[for(final product in visible)SizedBox(width:width,child:_ProductCard(product:product))]);
              }),
          ],
        );
      },
    ),
  );
}

class _InventoryMetric extends StatelessWidget{
  final String label,value;final IconData icon;
  const _InventoryMetric({required this.label,required this.value,required this.icon});
  @override Widget build(BuildContext context)=>Container(
    padding:const EdgeInsets.symmetric(horizontal:16,vertical:14),
    decoration:BoxDecoration(color:Colors.white.withValues(alpha:.09),borderRadius:BorderRadius.circular(16),border:Border.all(color:Colors.white.withValues(alpha:.12))),
    child:Row(mainAxisSize:MainAxisSize.min,children:[Icon(icon,color:Colors.white),const SizedBox(width:10),Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(value,style:const TextStyle(color:Colors.white,fontWeight:FontWeight.w800,fontSize:20)),Text(label,style:const TextStyle(color:Color(0xFFFFF7ED),fontSize:12))])]),
  );
}

class _ProductCard extends StatelessWidget{
  final Map<String,dynamic> product;
  const _ProductCard({required this.product});
  @override Widget build(BuildContext context){
    final name=(product['name']??'Unnamed product').toString().trim();
    final stock=product['stock'] is num?(product['stock'] as num).round():int.tryParse((product['stock']??'0').toString())??0;
    final price=product['price'] is num?(product['price'] as num).round():int.tryParse((product['price']??'0').toString())??0;
    final level=stock<=0?'Out of stock':stock<=5?'Low stock':'Healthy';
    final badge=stock<=0?const Color(0xFFFEE2E2):stock<=5?const Color(0xFFFEF3C7):const Color(0xFFD1FAE5);
    return Container(
      padding:const EdgeInsets.all(18),
      decoration:BoxDecoration(color:Colors.white,borderRadius:BorderRadius.circular(18),border:Border.all(color:const Color(0xFFE5E7EB)),boxShadow:const [BoxShadow(color:Color(0x0D0F172A),blurRadius:18,offset:Offset(0,6))]),
      child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Row(children:[
          Container(padding:const EdgeInsets.all(10),decoration:BoxDecoration(color:const Color(0xFFFFF7ED),borderRadius:BorderRadius.circular(12)),child:const Icon(Icons.inventory_2_rounded,color:Color(0xFFD97706))),
          const Spacer(),
          Chip(backgroundColor:badge,label:Text(level,style:const TextStyle(fontWeight:FontWeight.w700))),
        ]),
        const SizedBox(height:14),
        Text(name.isEmpty?'Unnamed product':name,style:const TextStyle(fontWeight:FontWeight.w800,fontSize:16),maxLines:2,overflow:TextOverflow.ellipsis),
        const SizedBox(height:6),
        Text('SKU: '+(product['sku']??'—').toString(),style:const TextStyle(color:Color(0xFF64748B))),
        Text('Warehouse: '+(product['warehouse']??'—').toString(),style:const TextStyle(color:Color(0xFF64748B))),
        const SizedBox(height:14),
        Row(children:[Expanded(child:Text(kes(price),style:const TextStyle(fontWeight:FontWeight.w800,fontSize:16))),Text(stock.toString()+' units',style:const TextStyle(fontWeight:FontWeight.w700))]),
      ]),
    );
  }
}

class _InventoryState extends StatelessWidget{
  final IconData icon;final String title,message;
  const _InventoryState({required this.icon,required this.title,required this.message});
  @override Widget build(BuildContext context)=>Center(child:Container(
    constraints:const BoxConstraints(maxWidth:560),padding:const EdgeInsets.all(28),
    decoration:BoxDecoration(color:Colors.white,borderRadius:BorderRadius.circular(20),border:Border.all(color:const Color(0xFFE5E7EB))),
    child:Column(mainAxisSize:MainAxisSize.min,children:[Icon(icon,size:44,color:const Color(0xFF64748B)),const SizedBox(height:12),Text(title,style:const TextStyle(fontWeight:FontWeight.w800,fontSize:18)),const SizedBox(height:6),Text(message,textAlign:TextAlign.center,style:const TextStyle(color:Color(0xFF64748B)))]),
  ));
}
