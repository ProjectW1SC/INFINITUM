import {officeAuth,officeJson,safeOfficeError} from '../../../../../lib/office-server.mjs';
import {adminClient,decryptToken,encryptToken,providerCredentials}
 from '../../../../../lib/openbot-connection-server.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const SERVICES={drive:'google',sheets:'google',gmail:'google',instagram:'meta'};
const MAX_OUTPUT=18000;
const timeout=()=>AbortSignal.timeout(12000);
async function readApi(url,access){
 const response=await fetch(url,{headers:{Authorization:'Bearer '+access,Accept:'application/json'},
  redirect:'error',signal:timeout(),cache:'no-store'});
 const source=await response.text();
 if(source.length>110000)throw Object.assign(Error('Resposta do provedor excedeu o limite.'),{status:502});
 let json;try{json=JSON.parse(source)}catch{throw Error('Provedor devolveu dados inválidos.')}
 if(!response.ok){
  const message=String(json.error?.message||json.error_description||'A conexão foi recusada.').slice(0,170);
  throw Object.assign(Error(message),{status:response.status===401?401:502});
 }
 return json;
}
async function googleRefresh(account,token,admin){
 const expiration=account.expires_at?Date.parse(account.expires_at):0;
 if(!expiration||Date.now()<expiration-60000)return token;
 if(!token.refresh_token)throw Object.assign(Error('Sessão Google expirada. Reconecte esta conta.'),{status:401});
 const creds=providerCredentials('google');
 const body=new URLSearchParams({client_id:creds.clientId,client_secret:creds.secret,
  refresh_token:token.refresh_token,grant_type:'refresh_token'});
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',
  headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body.toString(),signal:timeout(),cache:'no-store'});
 const raw=await response.json().catch(()=>({}));
 if(!response.ok||!raw.access_token)throw Object.assign(Error('O Google exige nova autorização.'),{status:401});
 const updated={...token,...raw,refresh_token:token.refresh_token};
 const expiresAt=Number(raw.expires_in)>0?new Date(Date.now()+Number(raw.expires_in)*1000).toISOString():null;
 const save=await admin.from('openbot_connections').update({
  tokens_ciphertext:encryptToken(updated),expires_at:expiresAt,updated_at:new Date().toISOString()
 }).eq('id',account.id).eq('owner_id',account.owner_id);
 if(save.error)throw Error('Não foi possível salvar o token renovado.');
 return updated;
}
export async function GET(request){
 try{
  const {user}=await officeAuth(request);
  const u=new URL(request.url),service=u.searchParams.get('service'),id=u.searchParams.get('connection_id')||'';
  const provider=SERVICES[service];
  if(!provider||!/^[0-9a-f-]{36}$/i.test(id))throw Object.assign(Error('Serviço ou conexão inválidos.'),{status:400});
  const admin=adminClient();
  const row=await admin.from('openbot_connections')
   .select('id,owner_id,provider,display_name,expires_at,status,tokens_ciphertext')
   .eq('id',id).eq('owner_id',user.id).eq('provider',provider).maybeSingle();
  if(row.error||!row.data)throw Object.assign(Error('Conta não encontrada para este usuário.'),{status:404});
  if(row.data.status!=='connected')throw Object.assign(Error('Esta conta precisa ser reconectada.'),{status:401});
  let token=decryptToken(row.data.tokens_ciphertext);
  if(provider==='google')token=await googleRefresh(row.data,token,admin);
  if(!token?.access_token)throw Object.assign(Error('Token OAuth ausente. Reconecte esta conta.'),{status:401});
  let data=[];
  try{
   if(service==='drive'){
    const p=new URLSearchParams({page_size:'12'});
    const out=await readApi('https://www.googleapis.com/drive/v3/files?'+
     new URLSearchParams({pageSize:'12',fields:'nextPageToken,files(id,name,mimeType,webViewLink,modifiedTime)',
      orderBy:'modifiedTime desc',q:'trashed = false'}),token.access_token);
    data=(out.files||[]).map(x=>({id:x.id,name:x.name,type:x.mimeType||'',url:x.webViewLink||'',
     modified:x.modifiedTime||''})).slice(0,12);
   }else if(service==='sheets'){
    const out=await readApi('https://www.googleapis.com/drive/v3/files?'+
     new URLSearchParams({pageSize:'12',fields:'files(id,name,mimeType,webViewLink,modifiedTime)',
      q:"mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false",
      orderBy:'modifiedTime desc'}),token.access_token);
    data=(out.files||[]).map(x=>({id:x.id,name:x.name,url:x.webViewLink||'',modified:x.modifiedTime||''})).slice(0,12);
   }else if(service==='gmail'){
    const out=await readApi('https://gmail.googleapis.com/gmail/v1/users/me/labels',token.access_token);
    data=(out.labels||[]).filter(x=>['INBOX','SENT','DRAFT','TRASH','SPAM','IMPORTANT','UNREAD'].includes(x.id)||
     x.type==='user').slice(0,20).map(x=>({id:x.id,name:x.name,type:x.type}));
   }else if(service==='instagram'){
    const out=await readApi('https://graph.facebook.com/v24.0/me/accounts?'+
     new URLSearchParams({fields:'id,name,instagram_business_account{id,username,name,profile_picture_url}',limit:'20'}),token.access_token);
    data=(out.data||[]).map(x=>({id:x.id,page:x.name,instagramId:x.instagram_business_account?.id||'',
      username:x.instagram_business_account?.username||'',name:x.instagram_business_account?.name||''})).slice(0,20);
   }
  }catch(error){
   if(error.status===401)await admin.from('openbot_connections').update({status:'needs_reconnect'})
    .eq('owner_id',user.id).eq('id',id);
   throw error;
  }
  return officeJson({ok:true,service,connection:{id:row.data.id,name:row.data.display_name},
   items:data,limitedTo:'metadados',checkedAt:new Date().toISOString(),
   notice:'Prévia de dados autorizados; não foi enviado e-mail, postagem ou WhatsApp.'});
 }catch(e){return safeOfficeError(e)}
}
