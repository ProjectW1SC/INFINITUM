'use client';
import {useEffect,useState} from 'react';
import {useWorkspaceSession} from '../../../components/workspace-session-provider.jsx';

const SHARED_LEXIS_DB=process.env.NEXT_PUBLIC_LEXIS_SHARED_DB==='1';

async function approvedClientsForUser(db,userId){
 if(SHARED_LEXIS_DB){
  const member=await db.from('usuarios').select('empresa_id').eq('auth_user_id',userId).limit(2);
  if(member.error||member.data?.length!==1||!member.data[0]?.empresa_id)
   throw Error('Não foi possível confirmar a empresa vinculada à conta.');
  const settings=await db.from('office_agent_company_policies').select('config')
   .eq('empresa_id',member.data[0].empresa_id).limit(1).maybeSingle();
  if(settings.error)throw Error('Não foi possível ler a autorização MCP da empresa.');
  const config=settings.data?.config||{};
  return config.mcp_enabled===true&&Array.isArray(config.mcp_allowed_client_ids)
   ?config.mcp_allowed_client_ids:[];
 }
 const settings=await db.from('killa_mcp_settings').select('mcp_enabled,allowed_client_ids')
  .eq('owner_id',userId).maybeSingle();
 if(settings.error)throw Error('Não foi possível ler a autorização MCP da conta.');
 return settings.data?.mcp_enabled===true&&Array.isArray(settings.data?.allowed_client_ids)
  ?settings.data.allowed_client_ids:[];
}

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
   approvedClientsForUser(db,session.user.id),
   db.auth.mfa.getAuthenticatorAssuranceLevel()
  ]).then(([authorization,clients,mfa])=>{
   if(!live)return;
   const {data,error}=authorization;
   if(mfa.error){setNotice('Verificação do segundo fator falhou. Nenhum cliente será autorizado.');return;}
   setApprovedClients(clients);
   setMfaOk(mfa.data?.currentLevel==='aal2');
   if(error)setNotice(error.message);
   else if(data?.redirect_url&&!data?.authorization_id)window.location.assign(data.redirect_url);
   else setDetails(data);
  }).catch(e=>{if(live)setNotice(String(e?.message||'Não foi possível verificar a solicitação OAuth.').slice(0,230))});
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
