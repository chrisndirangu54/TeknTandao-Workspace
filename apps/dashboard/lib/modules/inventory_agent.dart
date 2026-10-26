import 'package:flutter/material.dart';
import '../suite.dart';

class InventoryAgentScreen extends StatefulWidget {
  final SuiteStore store;
  const InventoryAgentScreen({super.key,required this.store});
  @override State<InventoryAgentScreen> createState()=>_InventoryAgentScreenState();
}
class _InventoryAgentScreenState extends State<InventoryAgentScreen>{
  final List<Map<String,dynamic>> recommendations=[];
  String? cursor,error;
  bool more=true,busy=false;
  @override void initState(){super.initState();load();}
  Future<void> load() async{
    if(busy||!more)return;
    setState(()=>busy=true);
    try{
      final result=await widget.store.call('getInventoryAgentRecommendations',{
        'pageSize':50,if(cursor!=null)'afterId':cursor
      });
      if(!mounted)return;
      setState((){
        recommendations.addAll((result['recommendations'] as List? ?? const [])
          .whereType<Map>().map((x)=>Map<String,dynamic>.from(x)));
        cursor=result['nextCursor']?.toString();
        more=result['hasMore']==true;error=null;
      });
    }catch(e){if(mounted)setState(()=>error=e.toString());}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> draft(Map<String,dynamic> row) async{
    final sku=row['sku']?.toString()??'',warehouse=row['warehouseId']?.toString()??'';
    final approved=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(
      title:const Text('Prepare purchase recommendation'),
      content:Text('SKU: $sku\nWarehouse: $warehouse\n'
        'Suggested units: ${row['recommendedQuantity']}\n'
        'Estimated cost (KES minor units): ${row['estimatedCostMinor']??'not configured'}\n\n'
        'This is an internal draft, NOT a purchase order or supplier instruction.'),
      actions:[
        TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Cancel')),
        FilledButton(onPressed:()=>Navigator.pop(ctx,true),child:const Text('Save draft'))
      ]
    ));
    if(approved!=true||!mounted)return;
    setState(()=>busy=true);
    try{
      final draftId='reorder_${DateTime.now().microsecondsSinceEpoch}';
      await widget.store.call('draftInventoryPurchaseRecommendation',{
        'draftId':draftId,'sku':sku,'warehouseId':warehouse
      });
      if(mounted)ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content:Text('Draft saved for procurement approval.')));
    }catch(e){if(mounted)setState(()=>error=e.toString());}
    finally{if(mounted)setState(()=>busy=false);}
  }
  @override Widget build(BuildContext context)=>Scaffold(
    appBar:AppBar(title:const Text('Inventory Agent')),
    body:ListView(padding:const EdgeInsets.all(20),children:[
      const Text('Stock intelligence & purchase planning',
        style:TextStyle(fontSize:22,fontWeight:FontWeight.bold)),
      const SizedBox(height:8),
      const Text('Uses configured daily demand, supplier lead times, reservations and incoming stock. Recommendations are advisory. No supplier orders are sent.'),
      const SizedBox(height:16),
      if(error!=null)Text(error!,style:TextStyle(color:Theme.of(context).colorScheme.error)),
      for(final row in recommendations)Card(child:ListTile(
        title:Text('${row['productName']} · ${row['warehouseId']}'),
        subtitle:Text('On hand: ${row['onHand']} · Position: ${row['inventoryPosition']} · Reorder point: ${row['reorderPoint']}\n'
          'Recommended: ${row['recommendedQuantity']} units · Est. cost: ${row['estimatedCostMinor']??'unavailable'} KES minor units'),
        isThreeLine:true,
        trailing:TextButton(onPressed:busy?null:()=>draft(row),child:const Text('Review draft'))
      )),
      if(busy)const Center(child:CircularProgressIndicator()),
      if(more)Center(child:OutlinedButton(onPressed:busy?null:load,child:const Text('Load next page'))),
      if(!more&&recommendations.isEmpty)const Text('No reorder recommendations for the scanned stock records. Ensure reorder policies are configured.'),
    ])
  );
}
