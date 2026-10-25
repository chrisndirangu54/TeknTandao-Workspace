import {accountingPeriod,assertOpenPeriod} from './accounting_period_domain.js';
import {trialBalance} from './ledger_domain.js';
import {identifier} from './domain.js';

// Common validation for all journal producers. Call from inside a Firestore
// transaction after reading the period lock and existing journal documents.
export function preparePosting({postingDate,periodState,sourceType,sourceId,journal,existing=null}) {
  const period=accountingPeriod(postingDate);
  const type=identifier(sourceType), id=identifier(sourceId);
  if(existing){
    if(existing.sourceType!==type || existing.sourceId!==id ||
       existing.period!==period || existing.postingDate!==postingDate)
      throw new Error('Journal ID has conflicting source or accounting period');
    trialBalance([journal]);
    trialBalance([existing]);
    if(existing.currency!==journal.currency || existing.total!==journal.total ||
       JSON.stringify(existing.lines)!==JSON.stringify(journal.lines))
      throw new Error('Journal ID has conflicting financial content');
    return {replayed:true,period};
  }
  assertOpenPeriod(period,periodState);
  const verified=trialBalance([journal]);
  if(verified.journalCount!==1 || journal.currency!=='KES')
    throw new Error('Invalid posting journal');
  return {replayed:false,period,postingDate,sourceType:type,sourceId:id,
    journal:{...journal,period,postingDate,sourceType:type,sourceId:id}};
}
