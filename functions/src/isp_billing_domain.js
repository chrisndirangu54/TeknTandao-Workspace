// Monetary amounts are integers in KES cents. No provider callback can be
// considered paid from client-submitted evidence or from this domain.
const safeId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
export function draftIspInvoice({subscriberId,planId,priceMinorKes,period,reference}){
 if(!safeId(subscriberId)||!safeId(planId)||!safeId(reference)||
  !Number.isSafeInteger(priceMinorKes)||priceMinorKes<0||priceMinorKes>100000000000||
  typeof period!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))
  throw new Error('Invalid ISP invoice input');
 return {subscriberId,planId,reference,period,currency:'KES',
  totalMinor:priceMinorKes,paidMinor:0,paymentStatus:'unverified',
  providerVerification:'not_connected',serviceEntitlementChanged:false};
}
export function prepareIspPaymentEvidence(input){
 if(!input||!safeId(input.invoiceId)||!safeId(input.reference)||
  !['mpesa','bank_transfer','cash'].includes(input.provider)||
  !Number.isSafeInteger(input.amountMinor)||input.amountMinor<=0||
  input.amountMinor>100000000000)
  throw new Error('Invalid payment evidence');
 return {invoiceId:input.invoiceId,reference:input.reference,
  provider:input.provider,amountMinor:input.amountMinor,
  status:'awaiting_provider_verification',verified:false,canActivateService:false};
}
