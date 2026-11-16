'use client';
import {useEffect,useState} from 'react';
import {useWorkspaceSession} from '../../../components/workspace-session-provider.jsx';
export default function KillaMcpSetup(){
 const {db,session,loading}=useWorkspaceSession();
 const [role,setRole]=useState(''),[policy,setPolicy]=useState({
  mcp_enabled:false,permission_level:'basico',mcp_group_history_enabled:false,allowed_client_ids:[],require_mfa:true
 });
 const [saving,setSaving]=useState(false),[notice,setNotice]=useState('');
 useEffect(()=>{
  if(!db||!session?.user?.id)return;
  let active=true;
  (async()=>{
   const [membership,settings]=await Promise.all([
    db.from('crm_memberships').select('role,enabled').eq('user_id',session.user.id).maybeSingle(),
    db.from('killa_mcp_settings').select('mcp_enabled,permission_level,mcp_group_history_enabled,allowed_client_ids,require_mfa')
     .eq('owner_id',session.user.id).maybeSingle()
   ]);
   if(!active)return;
   if(membership.error||settings.error)throw Error('Não foi possível conferir o perfil e as regras MCP.');
   setRole(membership.data?.enabled===true?membership.data.role||'':'');
   if(settings.data)setPolicy(settings.data);
  })().catch(error=>{if(active)setNotice(error.message||'Falha ao carregar regras.')});
  return()=>{active=false};
 },[db,session?.user?.id]);
 const canEdit=role==='admin';
 async function save(){
  if(!canEdit||!db||!session?.user?.id||saving)return;
  setSaving(true);setNotice('');
  try{
   const result=await db.from('killa_mcp_settings').upsert({
    owner_id:session.user.id,mcp_enabled:policy.mcp_enabled===true,
    permission_level:policy.permission_level,
    mcp_group_history_enabled:policy.mcp_group_history_enabled===true,
    allowed_client_ids:Array.isArray(policy.allowed_client_ids)?policy.allowed_client_ids:[],require_mfa:true,
    updated_at:new Date().toISOString()
   },{onConflict:'owner_id'});
   if(result.error)throw result.error;
   setNotice('Configuração MCP salva. Nenhuma mensagem foi enviada.');
  }catch(e){setNotice('Não foi possível salvar: '+String(e.message||e).slice(0,210))}
  finally{setSaving(false)}
 }
 return <main style={{maxWidth:650,margin:'6vh auto',padding:24}}>
  <h1>Killa AI · MCP remoto</h1>
  <p>Integração de leitura e rascunhos para ChatGPT, Grok, Claude, OpenCode e FreeBuff. Nenhum cliente MCP pode enviar mensagens WhatsApp.</p>
  <p>Endereço MCP: <code>https://agentinfinitum.vercel.app/mcp</code></p>
  {loading?<p>Carregando sessão...</p>:!session?.user?<p>Entre no INFINITUM para configurar.</p>:<>
   <p>Perfil verificado: {role||'sem permissão de gerenciamento'}. Somente administradores podem habilitar o MCP.</p>
   <label style={{display:'flex',gap:8,alignItems:'center'}}>
    <input type="checkbox" disabled={!canEdit} checked={policy.mcp_enabled}
      onChange={e=>setPolicy(v=>({...v,mcp_enabled:e.target.checked}))}/>
    Permitir MCP externo autenticado
   </label>
   <label style={{display:'block',marginTop:16}}>Nível de permissão<br/>
    <select disabled={!canEdit} value={policy.permission_level}
     onChange={e=>setPolicy(v=>({...v,permission_level:e.target.value}))}>
     <option value="basico">Básico · apenas estado</option>
     <option value="medio">Médio · histórico autorizado</option>
     <option value="alto">Alto · histórico + pesquisa autorizada</option>
     <option value="muito_alto">Muito alto · mesmas ferramentas somente leitura</option>
     <option value="maximo">Máximo · mesmas ferramentas somente leitura</option>
    </select>
   </label>
   <label style={{display:'flex',gap:8,alignItems:'center',marginTop:16}}>
    <input type="checkbox" disabled={!canEdit||!policy.mcp_enabled} checked={policy.mcp_group_history_enabled}
      onChange={e=>setPolicy(v=>({...v,mcp_group_history_enabled:e.target.checked}))}/>
    Autorizar leitura de grupos já arquivados para esta conta
   </label>
   <p>Segurança: exigimos OAuth por aplicativo com segundo fator (MFA/AAL2). Sem MFA configurado, o acesso MCP fica bloqueado.</p>
   <label style={{display:'block',marginTop:16}}>IDs dos aplicativos OAuth permitidos (um por linha)<br/>
    <textarea rows={4} disabled={!canEdit} value={(policy.allowed_client_ids||[]).join('\n')}
     onChange={e=>setPolicy(v=>({...v,allowed_client_ids:e.target.value.split(/[\n,]+/).map(x=>x.trim()).filter(x=>/^[A-Za-z0-9._:-]{5,200}$/.test(x)).slice(0,20)}))}/>
   </label>
   <p>Copie apenas o identificador público de cada aplicativo registrado no OAuth Server. Não cole segredos, tokens nem senhas. Cada funcionário tem sua própria autorização.</p>
   <p><a href="/mcp/pair">Abrir pareamento WhatsApp individual com QR atualizado</a></p>
   <p>O MCP não tem permissão para enviar mensagens, divulgar backlogs ou acessar arquivos de outros usuários. Cada cliente externo exige login OAuth e consentimento.</p>
   <button type="button" onClick={save} disabled={!canEdit||saving}>{saving?'Salvando...':'Salvar regras MCP'}</button>
  </>}
  {notice&&<p role="status">{notice}</p>}
 </main>;
}
