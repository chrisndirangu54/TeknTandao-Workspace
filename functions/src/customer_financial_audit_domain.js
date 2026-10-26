// A release preflight for invoice/payment financial integrity. Read-only and fail closed.
export function auditCustomerFinancialConsistency({invoices,settlements,allocations,journals}){
 if([invoices,settlements,allocations,journals].some(x=>!Array.isArray(x)||x.length>500))
  throw new Error('Audit requires bounded collections');
 const byId=x=>new Map(x.map(row=>[row.id,row]));
 const invoiceById=byId(invoices),settlementById=byId(settlements),journalById=byId(journals);
 const errors=[];
 const invoiceTotals=new Map(),settlementTotals=new Map();
 for(const a of allocations){
  if(!Number.isSafeInteger(a.amountMinor)||a.amountMinor<=0){errors.push({allocationId:a.id,code:'invalid_allocation'});continue;}
  const reversed=a.reversalStatus==='reversed';
  const invoice=invoiceById.get(a.invoiceId),settlement=settlementById.get(a.settlementId);
  if(!invoice||!settlement){errors.push({allocationId:a.id,code:'missing_reference'});continue;}
  if(invoice.contactId!==settlement.contactId)errors.push({allocationId:a.id,code:'customer_mismatch'});
  const originalJournal=journalById.get('customer_payment_'+a.id);
  if(!originalJournal)errors.push({allocationId:a.id,code:'missing_payment_journal'});
  if(reversed&&!journalById.has('customer_reversal_'+a.id))
   errors.push({allocationId:a.id,code:'missing_reversal_journal'});
  if(!reversed){
   invoiceTotals.set(a.invoiceId,(invoiceTotals.get(a.invoiceId)||0)+a.amountMinor);
   settlementTotals.set(a.settlementId,(settlementTotals.get(a.settlementId)||0)+a.amountMinor);
  }
 }
 for(const i of invoices){
  const recorded=invoiceTotals.get(i.id)||0;
  if(i.allocatedMinor!==undefined&&i.allocatedMinor!==recorded)
   errors.push({invoiceId:i.id,code:'invoice_allocation_mismatch'});
  if(Number.isSafeInteger(i.total)&&i.outstandingMinor!==undefined&&i.outstandingMinor!==i.total-recorded)
   errors.push({invoiceId:i.id,code:'invoice_outstanding_mismatch'});
 }
 for(const s of settlements){
  if(s.allocatedMinor!==undefined&&s.allocatedMinor!==(settlementTotals.get(s.id)||0))
   errors.push({settlementId:s.id,code:'settlement_allocation_mismatch'});
 }
 return {ok:errors.length===0,errors,inspected:{invoices:invoices.length,settlements:settlements.length,
 allocations:allocations.length,journals:journals.length},scope:'bounded snapshot; not a complete general ledger audit'};
}
