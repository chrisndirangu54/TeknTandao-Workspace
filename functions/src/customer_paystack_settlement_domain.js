export function verifiedCustomerPaystackSettlement(payment,verification,reference){
 if(!payment||payment.provider!=='paystack'||payment.state!=='pending')throw new Error('Unrecognized customer payment');
 if(verification?.status!=='success'||verification.reference!==reference||
 verification.currency!=='KES'||verification.currency!==payment.currency||
 !Number.isSafeInteger(verification.amount)||verification.amount!==payment.amountMinor||
 !Number.isSafeInteger(payment.amountMinor)||payment.amountMinor<=0)
 throw new Error('Payment provider verification mismatch');
 if(payment.contactId===undefined||typeof payment.contactId!=='string')throw new Error('Missing customer identity');
 return {contactId:payment.contactId,amountMinor:payment.amountMinor,currency:'KES',
  verificationStatus:'verified',trustBoundary:'provider_webhook_verified',
  verificationSource:'paystack_api',provider:'paystack',providerReference:reference,
  providerTransactionId:String(verification.id)};
}
