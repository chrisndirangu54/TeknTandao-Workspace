import test from 'node:test';
import assert from 'node:assert/strict';
import {domainSchema,domainOrderSchema,hostingOrderSchema,
  parseDomainCheck,parseDomainPrice} from '../src/namecheap_domain.js';

const xml=(part)=>'<?xml version="1.0"?><ApiResponse Status="OK"><Errors/><CommandResponse>'+part+'</CommandResponse></ApiResponse>';
test('domain validation rejects untrusted URLs and invalid domains',()=>{
 assert.equal(domainSchema.parse('Example.COM'),'example.com');
 for(const candidate of ['https://example.com','bad domain.com','evil.com?x=1','-abc.com'])
  assert.equal(domainSchema.safeParse(candidate).success,false);
});
test('sandbox availability returns correct premium indicators without claiming live sale',()=>{
 const body=xml('<DomainCheckResult Domain="sample.com" Available="true" IsPremiumName="true" PremiumRegistrationPrice="300.00"/>');
 const result=parseDomainCheck(body,'sample.com');
 assert.equal(result.available,true);
 assert.equal(result.premium,true);
 assert.equal(result.pricingVerified,false);
 assert.equal(result.premiumRegistrationUsd,300);
});
test('rejects provider errors, malformed XML and absent domain',()=>{
 assert.throws(()=>parseDomainCheck('<ApiResponse Status="ERROR"/>','sample.com'));
 assert.throws(()=>parseDomainCheck(xml('<DomainCheckResult Domain="other.com" Available="true"/>'),'sample.com'));
 assert.throws(()=>parseDomainCheck('<!DOCTYPE z [<!ENTITY x SYSTEM "file:///etc/passwd">]><ApiResponse/>','sample.com'));
});
test('read-only USD registrar pricing is sourced from Namecheap response',()=>{
 const body=xml('<UserGetPricingResult><ProductType Name="DOMAIN"><ProductCategory Name="REGISTER"><Product Name="com"><Price Duration="1" DurationType="YEAR" Price="11.20" Currency="USD"/></Product></ProductCategory></ProductType></UserGetPricingResult>');
 assert.equal(parseDomainPrice(body,'com').costUsd,11.2);
});
test('domain and hosting orders require explicit consent and approved package codes',()=>{
 assert.equal(domainOrderSchema.safeParse({domain:'example.com',years:1,customerApproved:true,purpose:'register'}).success,true);
 assert.equal(domainOrderSchema.safeParse({domain:'example.com',years:1,customerApproved:false}).success,false);
 assert.equal(hostingOrderSchema.safeParse({domain:'example.com',packageCode:'starter',customerApproved:true}).success,true);
 assert.equal(hostingOrderSchema.safeParse({domain:'example.com',packageCode:'arbitrary',customerApproved:true}).success,false);
});
