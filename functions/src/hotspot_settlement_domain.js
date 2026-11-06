// Provider-agnostic settlement checks. Safaricom STK callbacks are NOT signed.
// A callback + STK query alone does not authenticate receipt amount or merchant.
export function parseStkCallback(body){
 const c=body?.Body?.stkCallback;
 if(!c||typeof c!=='object'||Array.isArray(c))return {valid:false,reason:'missing_callback'};
 const checkoutId=c.CheckoutRequestID;
 if(typeof checkoutId!=='string'||!/^[-A-Za-z0-9_]{8,150}$/.test(checkoutId))return {valid:false,reason:'invalid_checkout'};
 const code=Number(c.ResultCode);
 if(!Number.isInteger(code)||code<0||code>100000)return {valid:false,reason:'invalid_result'};
 const items=c.CallbackMetadata?.Item;
 const values={};
 if(Array.isArray(items)){
  for(const item of items){
   if(!item||!['Amount','MpesaReceiptNumber','PhoneNumber','TransactionDate'].includes(item.Name))continue;
   if(Object.hasOwn(values,item.Name))return {valid:false,reason:'duplicate_metadata'};
   values[item.Name]=item.Value;
  }
 }
 if(code===0){
  if(!Number.isSafeInteger(values.Amount)||values.Amount<1)return {valid:false,reason:'invalid_amount'};
  if(typeof values.MpesaReceiptNumber!=='string'||!/^[A-Za-z0-9]{8,30}$/.test(values.MpesaReceiptNumber))return {valid:false,reason:'invalid_receipt'};
 }
 return {valid:true,checkoutId,resultCode:code,receipt:code===0?values.MpesaReceiptNumber:null,
   amountKes:code===0?values.Amount:null,phoneLast4:values.PhoneNumber===undefined?null:String(values.PhoneNumber).slice(-4),
   trusted:false};
}
export function evaluateSettlementEvidence({order,callback,providerQuery,officialStatement}){
 if(!order||!callback?.valid)return {settled:false,reason:'missing_order_or_callback'};
 if(order.checkoutRequestId!==callback.checkoutId)return {settled:false,reason:'checkout_mismatch'};
 if(callback.resultCode!==0||String(providerQuery?.ResultCode)!=='0')return {settled:false,reason:'provider_not_confirmed'};
 // A statement MUST be obtained independently via an authenticated
 // provider reporting API/portal and verified outside the callback channel.
 if(!officialStatement||officialStatement.authenticatedSource!=='independent_provider_statement')
  return {settled:false,reason:'independent_receipt_verification_required'};
 if(officialStatement.checkoutId!==order.checkoutRequestId||
  officialStatement.receipt!==callback.receipt||
  officialStatement.amountKes!==order.amountKes||
  officialStatement.amountKes!==callback.amountKes||
  officialStatement.merchantAccount!==order.merchantAccount)
  return {settled:false,reason:'statement_mismatch'};
 return {settled:true,reason:'evidence_matches',receipt:callback.receipt};
}
