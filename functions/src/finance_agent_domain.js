const valid=n=>Number.isSafeInteger(n)&&n>=0;
export function financeAgentSummary(invoices,issues,asOf=new Date().toISOString(),limit=50){
 if(!Array.isArray(invoices)||!Array.isArray(issues)||invoices.length>500||issues.length>2000||
 !Number.isInteger(limit)||limit<1||limit>100||!Number.isFinite(Date.parse(asOf)))
 throw new Error('Invalid finance agent snapshot');
 const rows=[],warnings=[];
 let totalOutstandingMinor=0,totalInvoiceMinor=0,overdueMinor=0;
 for(const i of invoices){
  const total=i.total,allocated=i.allocatedMinor??0;
  if(!valid(total)||!valid(allocated)||allocated>total||i.currency&&i.currency!=='KES'){
   warnings.push({invoiceId:i.id||null,reason:'invalid_invoice_balance'});continue;
  }
  const outstanding=total-allocated;
  totalInvoiceMinor+=total;totalOutstandingMinor+=outstanding;
  const due=i.dueDate||i.dueAt||null;
  const isOverdue=outstanding>0&&typeof due==='string'&&Number.isFinite(Date.parse(due))&&Date.parse(due)<Date.parse(asOf);
  if(isOverdue)overdueMinor+=outstanding;
  if(outstanding>0)rows.push({invoiceId:i.id,contactId:i.contactId||null,
   outstandingMinor:outstanding,invoiceTotalMinor:total,overdue:isOverdue,
   dueDate:due||null,reviewRequired:i.paymentReviewRequired===true});
 }
 rows.sort((a,b)=>Number(b.overdue)-Number(a.overdue)||b.outstandingMinor-a.outstandingMinor);
 return {currency:'KES',totalInvoices:invoices.length,totalInvoiceMinor,
  totalOutstandingMinor,overdueMinor,outstandingInvoiceCount:rows.length,
  invoices:rows.slice(0,limit),discrepancies:issues.slice(0,100),
  discrepancyCount:issues.length,warnings,readOnly:true,complete:invoices.length<500,
  note:'Calculated from invoice allocation counters and bounded audit data; not bank-confirmed cash or a full ledger reconciliation.'};
}
