import {trialBalance} from './ledger_domain.js';
import {identifier,money} from './domain.js';

// Verify that an asset's recorded acquisition matches its immutable journal.
// This intentionally does NOT mark a supplier payment or bank transfer verified.
export function verifyAssetAcquisition(asset,journal){
 if(!asset || !journal)throw new Error('Asset and acquisition journal required');
 const id=identifier(asset.assetId);
 if(journal.sourceType!=='asset_acquisition'||journal.sourceId!==id ||
    asset.acquisitionJournalId!=='asset_acquisition_'+id)
   throw new Error('Asset acquisition journal source mismatch');
 trialBalance([journal]);
 const cost=money(asset.costMinor);
 if(journal.total!==cost || journal.currency!=='KES')throw new Error('Asset acquisition amount mismatch');
 const debit=journal.lines.filter(l=>l.account==='1500').reduce((n,l)=>n+l.debit-l.credit,0);
 const clearing=journal.lines.filter(l=>l.account==='2290').reduce((n,l)=>n+l.credit-l.debit,0);
 if(debit!==cost || clearing!==cost)throw new Error('Acquisition asset or clearing entry mismatch');
 return {assetId:id,acquisitionPosted:true,clearingOutstandingMinor:cost,
   paymentVerified:false,requiresSettlementReconciliation:true};
}
