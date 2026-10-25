import {identifier,money} from './domain.js';
import {reconcileStatementEntries} from './payment_reconciliation_domain.js';

// A deterministic, read-only bank reconciliation report. Statement lines are
// untrusted observations, never evidence of actual payment on their own.
export function reconcileBankStatement({ledger=[],statement=[]}={}) {
  if(!Array.isArray(ledger)||!Array.isArray(statement)||ledger.length>500||statement.length>500)
    throw new Error('Reconciliation supports at most 500 entries per side');
  const normalize=rows=>rows.map(row=>{
    const reference=identifier(row.reference);
    const total=money(row.total);
    if(total===0)throw new Error('Zero amount is not reconcilable');
    if(row.currency!=='KES')throw new Error('Currency mismatch');
    if(!['mpesa','paystack','bank'].includes(row.provider))throw new Error('Unsupported channel');
    return {reference,total,currency:row.currency,provider:row.provider};
  });
  const expected=normalize(ledger),observed=normalize(statement);
  const result=reconcileStatementEntries({expected,observed});
  return {...result,ledgerCount:expected.length,statementCount:observed.length,
    requiresManualReview:!result.fullyReconciled};
}
