import {createHash} from 'node:crypto';
export function validatePaystackMpesaResult({order,result}){
 const deny=reason=>({verified:false,reason});
 if(!order||!result)return deny('missing_evidence');
 if(order.provider!=='paystack_mpesa_test'||!['pending_verification','initiation_unknown'].includes(order.state))return deny('wrong_order_state');
 if(result.domain!=='test'||result.status!=='success'||result.channel!=='mobile_money')return deny('not_successful_test_mpesa');
 if(typeof order.reference!=='string'||result.reference!==order.reference)return deny('reference_mismatch');
 if(!Number.isSafeInteger(order.amountKes)||order.amountKes<1||!Number.isSafeInteger(result.amount)||
   result.amount!==order.amountKes*100||result.currency!=='KES')return deny('amount_or_currency_mismatch');
 // Use Paystack's unique transaction reference rather than a JavaScript-parsed uint64 ID.
 const paymentId=String(result.reference);
 if(typeof result.paid_at!=='string'||!Number.isFinite(Date.parse(result.paid_at)))return deny('invalid_payment_time');
 if(typeof order.customerEmailHash!=='string'||!/^[a-f0-9]{64}$/.test(order.customerEmailHash)||
    typeof result.customer?.email!=='string')return deny('missing_customer_identity');
 const actual=createHash('sha256').update(result.customer.email.trim().toLowerCase()).digest('hex');
 if(actual!==order.customerEmailHash)return deny('customer_mismatch');
 return {verified:true,reason:'independent_paystack_api_verified',paymentId,
   amountKes:order.amountKes,reference:order.reference,paidAt:result.paid_at};
}
