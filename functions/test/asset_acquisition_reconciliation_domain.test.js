import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyAssetAcquisition} from '../src/asset_acquisition_reconciliation_domain.js';
import {assetAcquisitionJournal} from '../src/fixed_assets_domain.js';
const asset={assetId:'machine',costMinor:120000,acquisitionJournalId:'asset_acquisition_machine'};
const journal={...assetAcquisitionJournal(120000),sourceType:'asset_acquisition',sourceId:'machine'};
test('unsettled acquisition is confirmed as posted, not paid',()=>{
 const r=verifyAssetAcquisition(asset,journal);
 assert.equal(r.clearingOutstandingMinor,120000);
 assert.equal(r.paymentVerified,false);
});
test('rejects missing and misattributed acquisition journals',()=>{
 assert.throws(()=>verifyAssetAcquisition(asset,null));
 assert.throws(()=>verifyAssetAcquisition(asset,{...journal,sourceId:'other'}),/source mismatch/);
});
