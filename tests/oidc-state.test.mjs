import test from 'node:test';
import assert from 'node:assert/strict';
import {createOidcAuthorizationState,validateOidcAuthorizationState,validateOidcIdTokenClaims} from '../backend/oidc-state.mjs';

test('OIDC authorization state includes unpredictable state, nonce and S256 PKCE challenge',()=>{
 const value=createOidcAuthorizationState({issuer:'https://id.example',clientId:'client',redirectUri:'https://app/callback',now:()=>1000});
 assert.equal(value.createdAt,1000);assert.equal(value.expiresAt,601000);assert.ok(value.state.length>30&&value.nonce.length>30&&value.verifier.length>30);
 assert.notEqual(value.state,value.nonce);assert.notEqual(value.verifier,value.challenge);
});
test('OIDC callback state requires matching nonce and expiry',()=>{
 const value=createOidcAuthorizationState({issuer:'i',clientId:'c',redirectUri:'r',now:()=>1000,ttlMs:100});
 assert.deepEqual(validateOidcAuthorizationState(value,{state:value.state,nonce:value.nonce},{now:1050}),{ok:true});
 assert.equal(validateOidcAuthorizationState(value,{state:value.state,nonce:'wrong'},{now:1050}).code,'oidc_state_mismatch');
 assert.equal(validateOidcAuthorizationState(value,{state:value.state,nonce:value.nonce},{now:2000,skewMs:0}).code,'oidc_state_expired');
});
test('OIDC claims validate issuer audience nonce subject and timestamps after signature verification',()=>{
 const base={iss:'i',aud:['c'],nonce:'n',sub:'provider-user',iat:1000,exp:1100};
 assert.equal(validateOidcIdTokenClaims(base,{issuer:'i',clientId:'c',nonce:'n',now:1050}).subject,'provider-user');
 for(const [key,value] of [['iss','other'],['nonce','wrong'],['sub',''],['aud',['other']]])assert.equal(validateOidcIdTokenClaims({...base,[key]:value},{issuer:'i',clientId:'c',nonce:'n',now:1050}).ok,false);
 assert.equal(validateOidcIdTokenClaims(base,{issuer:'i',clientId:'c',nonce:'n',now:1200}).code,'oidc_token_expired');
});
