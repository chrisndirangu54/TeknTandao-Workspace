import test from 'node:test';
import assert from 'node:assert/strict';
import {settlementDisputeDecision} from '../src/customer_settlement_disputes_domain.js';
import {customerSettlementAllocation} from '../src/customer_settlement_transaction_domain.js';
const settlement={contactId:'c',currency:'KES',amountMinor:1000,allocatedMinor:0,
 verificationStatus:'verified',trustBoundary:'provider_webhook_verified',verificationSource:'paystack_api'};
const invoice={contactId:'c',currency:'KES',total:1000};
test('finance dispute freezes provider-verified settlement',()=>{
 assert.equal(settlementDisputeDecision(settlement,'chargeback').status,'freeze');
 assert.equal(settlementDisputeDecision({...settlement,disputeState:'frozen'},'chargeback').status,'already_frozen');
 assert.throws(()=>settlementDisputeDecision(settlement,'settled'),/Invalid/);
});
test('refund-pending and disputed funds cannot be allocated',()=>{
 for(const reason of ['frozen','refund_pending','chargeback'])
 assert.throws(()=>customerSettlementAllocation(invoice,{...settlement,disputeState:reason},100),/frozen/);
 assert.equal(customerSettlementAllocation(invoice,settlement,100).invoiceOutstandingMinor,900);
});
