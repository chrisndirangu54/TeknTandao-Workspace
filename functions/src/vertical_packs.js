export const verticalPacks = Object.freeze({
  retail: Object.freeze({
    id: 'retail',
    name: 'Retail Operating Pack',
    primaryApps: ['pos', 'inventory', 'procurement', 'accounting', 'crm', 'ecommerce'],
    graphEntities: ['customer', 'product', 'order', 'payment', 'supplier', 'location'],
    events: ['sale.created', 'inventory.low_stock', 'purchase.received', 'order.fulfilled', 'payment.settled'],
    recommendedAutomations: [
      'sale.created -> create accounting record and customer follow-up',
      'inventory.low_stock -> create procurement request',
      'order.fulfilled -> update customer relationship graph'
    ],
    offlineCritical: true
  }),
  sacco: Object.freeze({
    id: 'sacco',
    name: 'SACCO & Cooperative Operating Pack',
    primaryApps: ['sacco', 'payments', 'accounting', 'crm'],
    graphEntities: ['member', 'payment', 'contract', 'customer', 'organization'],
    events: ['member.joined', 'savings.posted', 'loan.approved', 'repayment.received', 'loan.delinquent'],
    recommendedAutomations: [
      'repayment.received -> update member balance and accounting',
      'loan.delinquent -> create collections task and member alert',
      'member.joined -> create member relationship graph'
    ],
    offlineCritical: true
  }),
  property: Object.freeze({
    id: 'property',
    name: 'Property Operating Pack',
    primaryApps: ['property', 'crm', 'accounting', 'payments', 'fieldservice'],
    graphEntities: ['property', 'customer', 'contract', 'invoice', 'payment', 'asset'],
    events: ['lease.signed', 'rent.due', 'rent.paid', 'maintenance.requested', 'maintenance.completed'],
    recommendedAutomations: [
      'rent.due -> create collection task',
      'rent.paid -> reconcile tenant ledger',
      'maintenance.requested -> create field-service dispatch'
    ],
    offlineCritical: false
  }),
  mining: Object.freeze({
    id: 'mining',
    name: 'Mining Intelligence Operating Pack',
    primaryApps: ['inventory', 'procurement', 'fleet', 'accounting', 'mc25_mining_operations', 'mc25_geo_and_mining_intelligence'],
    graphEntities: ['site', 'sample', 'equipment', 'asset', 'shipment', 'location'],
    events: ['sample.collected', 'assay.received', 'equipment.inspected', 'production.recorded', 'shipment.dispatched'],
    recommendedAutomations: [
      'sample.collected -> create laboratory workflow record',
      'assay.received -> link assay result to prospect graph',
      'equipment.inspected -> create maintenance action when required'
    ],
    offlineCritical: true
  }),
  logistics: Object.freeze({
    id: 'logistics',
    name: 'Logistics Operating Pack',
    primaryApps: ['freight', 'fleet', 'inventory', 'accounting', 'payments', 'mc19_cross_border_trade_os'],
    graphEntities: ['shipment', 'vehicle', 'customer', 'location', 'invoice', 'payment'],
    events: ['shipment.booked', 'shipment.dispatched', 'shipment.arrived', 'delivery.confirmed', 'customs.cleared'],
    recommendedAutomations: [
      'shipment.dispatched -> create tracking event',
      'delivery.confirmed -> create invoice and customer notification',
      'customs.cleared -> release downstream delivery workflow'
    ],
    offlineCritical: true
  })
});

export function getVerticalPack(id) {
  if (!Object.hasOwn(verticalPacks, id)) throw new Error('Unknown vertical pack');
  return verticalPacks[id];
}
