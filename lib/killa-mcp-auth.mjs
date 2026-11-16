// Parser used only AFTER a signed-in session is verified with Supabase Auth.
// Parsing an unverified JWT alone does not authenticate anyone.
export function jwtClaims(jwt){
 if(typeof jwt!=='string'||jwt.length>12000||jwt.split('.').length!==3)return null;
 try{
  const encoded=jwt.split('.')[1];
  if(!/^[A-Za-z0-9_-]+$/.test(encoded))return null;
  const data=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8'));
  return data&&typeof data==='object'&&!Array.isArray(data)?data:null;
 }catch{return null}
}
export function assertAuthorizedMcpClaims(claims,{userId,allowedClientIds=[],requireMfa=true}={}){
 const deny=reason=>{throw Object.assign(Error(reason),{status:403})};
 if(!userId||!claims||claims.sub!==userId)deny('Identidade de usuário OAuth não verificada.');
 const clientId=claims.client_id;
 if(typeof clientId!=='string'||clientId.length<5||clientId.length>200||!/^[A-Za-z0-9._:-]+$/.test(clientId))
  deny('Cliente OAuth identificado é obrigatório; sessão comum do CRM não funciona no MCP.');
 if(!Array.isArray(allowedClientIds)||!allowedClientIds.includes(clientId))
  deny('Cliente OAuth não autorizado pelo administrador.');
 if(requireMfa&&claims.aal!=='aal2')
  deny('MFA (segundo fator, nível aal2) é obrigatório para acessar dados por MCP.');
 return {clientId,userId,mfaVerified:claims.aal==='aal2'};
}
export function isOauthToken(claims){return typeof claims?.client_id==='string'&&claims.client_id.length>0}
