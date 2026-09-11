import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';

const base64url=value=>Buffer.from(value).toString('base64url');
const digest=value=>createHash('sha256').update(value).digest();
const equal=(left,right)=>{if(typeof left!=='string'||typeof right!=='string')return false;const a=Buffer.from(left),b=Buffer.from(right);return a.length===b.length&&timingSafeEqual(a,b);};

export function createOidcAuthorizationState({issuer,clientId,redirectUri,now=Date.now,ttlMs=10*60*1000}={}){
 if(!issuer||!clientId||!redirectUri)throw new TypeError('oidc_config_required');
 const state=base64url(randomBytes(32)),nonce=base64url(randomBytes(32)),verifier=base64url(randomBytes(48));
 return {issuer,clientId,redirectUri,state,nonce,verifier,challenge:base64url(digest(verifier)),createdAt:now(),expiresAt:now()+ttlMs};
}

export function validateOidcAuthorizationState(expected,returned,{now=Date.now,skewMs=30_000}={}){
 const current=typeof now==='function'?now():now;
 if(!expected||!returned||!equal(expected.state,returned.state)||!equal(expected.nonce,returned.nonce))return {ok:false,code:'oidc_state_mismatch'};
 if(expected.expiresAt+skewMs<current)return {ok:false,code:'oidc_state_expired'};
 return {ok:true};
}

// Signature and JWKS verification belong to the selected identity provider
// adapter. This function only validates claims after cryptographic verification.
export function validateOidcIdTokenClaims(claims,{issuer,clientId,nonce,now=Math.floor(Date.now()/1000),clockSkew=60}={}){
 if(!claims||claims.iss!==issuer||!Array.isArray(claims.aud)&&claims.aud!==clientId||Array.isArray(claims.aud)&&!claims.aud.includes(clientId)||!equal(claims.nonce,nonce))return {ok:false,code:'oidc_claims_invalid'};
 if(typeof claims.exp!=='number'||claims.exp+clockSkew<now)return {ok:false,code:'oidc_token_expired'};
 if(typeof claims.iat==='number'&&claims.iat-clockSkew>now)return {ok:false,code:'oidc_token_issued_in_future'};
 if(typeof claims.sub!=='string'||!claims.sub.trim()||claims.sub.length>255)return {ok:false,code:'oidc_subject_invalid'};
 return {ok:true,subject:claims.sub};
}
