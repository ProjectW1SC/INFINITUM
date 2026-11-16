'use client';
import {useEffect,useState} from 'react';
import {useWorkspaceSession} from '../../../components/workspace-session-provider.jsx';
export default function KillaOAuthConsent(){
 const {db,session,loading}=useWorkspaceSession();
 const [authorizationId,setAuthorizationId]=useState('');
 const [approvedClients,setApprovedClients]=useState([]),[mfaOk,setMfaOk]=useState(false);
 const [details,setDetails]=useState(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{
  const id=new URLSearchParams(window.location.search).get('authorization_id')||'';
  setAuthorizationId(id);
  if(!id||!db||!session?.user||!db.auth?.oauth?.getAuthorizationDetails)return;
  let live=true;
  Promise.all([
   db.auth.oauth.getAuthorizationDetails(id),
   db.from('killa_mcp_settings').select('mcp_enabled,allowed_client_ids')
    .eq('owner_id',session.user.id).maybeSingle(),
   db.auth.mfa.getAuthenticatorAssuranceLevel()
  ]).then(([{data,error},settings,mfa])=>{
   if(settings.error||mfa.error){setNotice('Verificação das permissões falhou. Nenhum cliente será autorizado.');return;}
   setApprovedClients(settings.data?.mcp_enabled===true?settings.data?.allowed_client_ids||[]:[]);
   setMfaOk(mfa.data?.currentLevel==='aal2');
   if(!live)return;
   if(error)setNotice(error.message);
   else if(data?.redirect_url&&!data?.authorization_id)window.location.assign(data.redirect_url);
   else setDetails(data);
  }).catch(()=>{if(live)setNotice('Não foi possível verificar a solicitação OAuth.')});
  return()=>{live=false};
 },[db,session?.user?.id]);
 const clientId=String(details?.client?.id||details?.client?.client_id||details?.client_id||'');
 const clientApproved=clientId.length>0&&approvedClients.includes(clientId)&&mfaOk;
 async function decide(approved){
  if(!db?.auth?.oauth||!authorizationId||busy||(approved&&!clientApproved))return;
  setBusy(true);setNotice('');
  try{
   const result=approved?
    await db.auth.oauth.approveAuthorization(authorizationId):
    await db.auth.oauth.denyAuthorization(authorizationId);
   if(result.error||!result.data?.redirect_url)throw Error(result.error?.message||'Autorização não concluída.');
   window.location.assign(result.data.redirect_url);
  }catch(e){setNotice(String(e?.message||e).slice(0,230));setBusy(false)}
 }
 return <main style={{maxWidth:580,margin:'8vh auto',padding:26,background:'var(--panel,#17171b)',borderRadius:14}}>
  <h1>Autorizar Killa AI MCP</h1>
  <p>Um assistente externo solicita acesso de leitura ao INFINITUM. O MCP consulta apenas a empresa e as conversas permitidas para sua conta. Nenhuma ferramenta MCP envia mensagens de WhatsApp.</p>
  {loading&&<p>Verificando sessão...</p>}
  {!loading&&!session?.user&&<p>Entre no INFINITUM neste navegador e volte a este endereço para autorizar a conexão.</p>}
  {!authorizationId&&<p>Solicitação OAuth não identificada.</p>}
  {session?.user&&!db?.auth?.oauth&&<p>O cliente de autenticação precisa ser atualizado para suportar OAuth 2.1.</p>}
  {details&&<section style={{padding:'12px 0'}}>
   <p>Aplicativo: <strong>{details.client?.name||'Cliente MCP'}</strong></p>
   <p>ID OAuth: <code>{clientId||'indisponível'}</code></p>
   {!approvedClients.includes(clientId)&&<p role="alert">Este aplicativo ainda não está na lista de clientes OAuth autorizados em <a href="/mcp/setup">/mcp/setup</a>. Copie o ID exato e peça autorização ao administrador.</p>}
   {!mfaOk&&<p role="alert">MFA (segundo fator) obrigatório. Ative e valide um segundo fator na sua conta antes de permitir acesso externo.</p>}
   <p>Permissões solicitadas: {String(details.scope||'não informadas')}</p>
   <p>Destino de retorno: {details.redirect_uri}</p>
   <p>Confirme somente se reconhece este aplicativo. As regras da sua empresa ainda podem bloquear o acesso.</p>
   <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
    <button type="button" disabled={busy||!clientApproved} onClick={()=>decide(true)}>Autorizar leitura</button>
    <button type="button" disabled={busy} onClick={()=>decide(false)}>Negar acesso</button>
   </div>
  </section>}
  {notice&&<p role="alert">{notice}</p>}
 </main>;
}
