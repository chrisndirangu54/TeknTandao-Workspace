export function saleInvoicePostingDecision({runExists,sale,accountingActive,periodClosed,invoiceExists,journalExists,taxOutboxExists}){
 if(runExists)return {action:'already_processed'};
 if(!sale)return {action:'missing_sale'};
 if(accountingActive&&periodClosed)return {action:'blocked_closed_period'};
 if(accountingActive&&(invoiceExists||journalExists||taxOutboxExists))
  return {action:'blocked_conflicting_financial_records'};
 return {action:'process',postAccounting:!!accountingActive};
}
