import test from 'node:test';
import assert from 'node:assert/strict';
import {payrollAuthorizationDraft,authorizePayrollProposal} from '../src/hr_payroll_authorization_domain.js';
const register={period:'2026-10',digest:'a'.repeat(64),payrollPosted:false};
test('payroll proposal is traceable to an unposted reconciliation digest',()=>{
 const proposal=payrollAuthorizationDraft(register,10000000,'Monthly gross pay checked');
 assert.equal(proposal.status,'pending');
 assert.equal(proposal.payrollPosted,false);
 assert.equal(proposal.registerDigest,register.digest);
});
test('gross pay and fingerprint must be valid',()=>{
 assert.throws(()=>payrollAuthorizationDraft(register,-100,'Review'),/gross/);
 assert.throws(()=>payrollAuthorizationDraft({...register,digest:'bad'},100,'Review'),/register/);
});
test('review requires another person and cannot be repeated',()=>{
 const proposal={...payrollAuthorizationDraft(register,100000,'Review'),preparedBy:'preparer'};
 assert.equal(authorizePayrollProposal(proposal,'approved','Checked','reviewer').status,'approved');
 assert.throws(()=>authorizePayrollProposal(proposal,'approved','Checked','preparer'),/Independent/);
 assert.throws(()=>authorizePayrollProposal({...proposal,status:'approved'},'approved','Again','reviewer'),/already/);
});
