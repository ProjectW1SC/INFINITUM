'use client';
import {useEffect,useState} from 'react';
import {useWorkspaceSession} from '../../../components/workspace-session-provider.jsx';
import {withAuthDeadline} from '../../../lib/auth-deadline.mjs';
import ui from '../../../components/killa-workbench.module.css';

const MCP_URL='https://ulkuhiibeoibbzhqrfya.supabase.co/functions/v1/killa-mcp';
const DEFAULT_POLICY={mcp_enabled:false,permission_level:'basico',mcp_group_history_enabled:false,
 allowed_client_ids:[],require_mfa:true,mcp_pairing_enabled:false,mcp_send_enabled:false};

export default function KillaMcpSetup(){
 const {db,session,loading,authFault}=useWorkspaceSession();
 const [role,setRole]=useState(''),[policy,setPolicy]=useState(DEFAULT_POLICY);
 const [clientIdsText,setClientIdsText]=useState('');
 const [checking,setChecking]=useState(false),[saving,setSaving]=useState(false);
 const [mfaStatus,setMfaStatus]=useState('desconhecido'),[notice,setNotice]=useState(''),[error,setError]=useState('');
 useEffect(()=>{
  if(!db||!session?.user?.id)return;
  let active=true;setChecking(true);setError('');setNotice('');
  (async()=>{
   const [membership,settings]=await withAuthDeadline(Promise.all([
    db.from('crm_memberships').select('role,enabled').eq('user_id',session.user.id).maybeSingle(),
    db.from('killa_mcp_settings').select('mcp_enabled,permission_level,mcp_group_history_enabled,allowed_client_ids,require_mfa,mcp_pairing_enabled,mcp_send_enabled')
     .eq('owner_id',session.user.id).maybeSingle()
   ]),12000);
   if(membership.error)throw Error('Não foi possível verificar o perfil: '+membership.error.message);
   if(settings.error)throw Error('Não foi possível ler as regras MCP: '+settings.error.message);
   if(!active)return;
   setRole(membership.data?.enabled===true?membership.data.role||'':'');
   const saved={...DEFAULT_POLICY,...(settings.data||{})};
   setPolicy(saved);setClientIdsText((saved.allowed_client_ids||[]).join('\n'));
   try{
    const mfa=await withAuthDeadline(db.auth.mfa.getAuthenticatorAssuranceLevel(),9000);
    if(active)setMfaStatus(mfa.error?'desconhecido':mfa.data?.currentLevel==='aal2'?'ativo':'pendente');
   }catch{if(active)setMfaStatus('desconhecido')}
  })().catch(e=>{if(active)setError(String(e.message||e))}).finally(()=>{if(active)setChecking(false)});
  return()=>{active=false};
 },[db,session?.user?.id]);
 const canEdit=role==='admin'&&!checking&&!error;
 async function save(){
  if(!canEdit||!db||!session?.user?.id||saving)return;
  const ids=clientIdsText.split(/[\n,]+/).map(x=>x.trim()).filter(Boolean);
  if(ids.length>20||ids.some(x=>!/^[A-Za-z0-9._:-]{5,200}$/.test(x))){
   setError('Informe no máximo 20 IDs OAuth válidos, um por linha, sem senhas ou tokens.');return;
  }
  setSaving(true);setNotice('');setError('');
  try{
   const payload={...policy,owner_id:session.user.id,allowed_client_ids:[...new Set(ids)],
    require_mfa:true,mcp_enabled:policy.mcp_enabled===true,
    mcp_group_history_enabled:policy.mcp_enabled&&policy.mcp_group_history_enabled===true,
    mcp_pairing_enabled:policy.mcp_enabled&&policy.mcp_pairing_enabled===true,
    mcp_send_enabled:policy.mcp_enabled&&policy.mcp_send_enabled===true,updated_at:new Date().toISOString()};
   const result=await withAuthDeadline(db.from('killa_mcp_settings').upsert(payload,{onConflict:'owner_id'})
    .select('mcp_enabled,permission_level,mcp_group_history_enabled,allowed_client_ids,require_mfa,mcp_pairing_enabled,mcp_send_enabled')
    .single(),12000);
   if(result.error||!result.data)throw Error(result.error?.message||'O banco não confirmou a gravação.');
   setPolicy({...DEFAULT_POLICY,...result.data});
   setClientIdsText((result.data.allowed_client_ids||[]).join('\n'));
   setNotice('Regras salvas e confirmadas no Supabase. O aplicativo externo ainda precisa concluir OAuth e MFA.');
  }catch(e){setError('Não foi possível salvar: '+String(e.message||e).slice(0,210))}
  finally{setSaving(false)}
 }
 return <main className={ui.mcpSetup}>
  <header className={ui.mcpHeading}><a href="/agentes">Voltar aos agentes</a><h1>Conectar assistentes externos</h1>
   <p>Configure o Killa AI por MCP. Isso permite acesso autorizado a leitura e rascunhos; não conecta o WhatsApp e não envia mensagens automaticamente.</p></header>
  {loading||checking?<p role="status">Verificando sessão e permissões…</p>:!session?.user?
   <div role="alert" className={ui.mcpCard}><strong>Entre no INFINITUM</strong><p>{authFault||'Você precisa estar autenticado para configurar o MCP.'}</p>
    <a href="/">Ir para o login</a></div>:
   <>
    <section className={ui.mcpCard}>
     <h2>1. Permissões da sua conta</h2>
     <p><strong>Perfil:</strong> {role||'sem acesso de administrador'} · <strong>MFA:</strong> {mfaStatus==='ativo'?'ativo':mfaStatus==='pendente'?'ainda não validado':'não verificado'}</p>
     {!canEdit&&<p role="alert">Esta configuração exige perfil administrador ativo em crm_memberships. Um usuário comum não pode ativar o MCP. Peça ao administrador do CRM para habilitar sua conta.</p>}
     {mfaStatus!=='ativo'&&<p>O login de segundo fator (MFA/AAL2) é obrigatório para conectar apps externos. Ative e confirme o segundo fator no Supabase Auth antes do primeiro acesso MCP.</p>}
    </section>
    <section className={ui.mcpCard}>
     <h2>2. Ativação do MCP</h2>
     <label className={ui.mcpCheck}><input type="checkbox" disabled={!canEdit} checked={policy.mcp_enabled}
      onChange={e=>setPolicy(p=>({...p,mcp_enabled:e.target.checked}))}/>Permitir conexão de aplicativos externos aprovados</label>
     <label className={ui.field}>Permissões do aplicativo
      <select disabled={!canEdit||!policy.mcp_enabled} value={policy.permission_level}
       onChange={e=>setPolicy(p=>({...p,permission_level:e.target.value}))}>
       <option value="basico">Básico · verificar estado</option>
       <option value="medio">Médio · ler histórico autorizado</option>
       <option value="alto">Alto · consultar fontes autorizadas</option>
       <option value="muito_alto">Muito alto · revisão ampliada, sem envio automático</option>
       <option value="maximo">Máximo · revisão ampliada, sem envio automático</option>
      </select></label>
    </section>
    <section className={ui.mcpCard}>
     <h2>3. Aplicativos autorizados</h2>
     <p>No painel de autenticação do Supabase, ative o <strong>OAuth Server</strong> e o consentimento do usuário. Quando o aplicativo externo registrar seu cliente OAuth, copie apenas o ID público para o campo abaixo.</p>
     <label className={ui.field}>IDs OAuth (um por linha)
      <textarea rows={3} disabled={!canEdit} spellCheck={false} value={clientIdsText} onChange={e=>setClientIdsText(e.target.value)}
       placeholder="ID público do aplicativo externo"/></label>
     <p>Para usar em um cliente MCP que aceite OAuth, informe este endereço:</p>
     <div className={ui.mcpEndpoint}><code>{MCP_URL}</code>
      <button type="button" onClick={()=>navigator.clipboard?.writeText(MCP_URL)
       .then(()=>setNotice('Endereço MCP copiado.')).catch(()=>setError('Copie o endereço manualmente.'))}>Copiar URL</button></div>
     <p>O link acima é do serviço MCP instalado no Supabase, independente da hospedagem do site na Vercel.</p>
    </section>
    <details className={ui.mcpCard}><summary>Permissões adicionais (avançado)</summary>
     <label className={ui.mcpCheck}><input type="checkbox" disabled={!canEdit||!policy.mcp_enabled}
      checked={policy.mcp_group_history_enabled} onChange={e=>setPolicy(p=>({...p,mcp_group_history_enabled:e.target.checked}))}/>
      Leitura de grupos previamente arquivados</label>
     <label className={ui.mcpCheck}><input type="checkbox" disabled={!canEdit||!policy.mcp_enabled}
      checked={policy.mcp_pairing_enabled} onChange={e=>setPolicy(p=>({...p,mcp_pairing_enabled:e.target.checked}))}/>
      Autorizar recursos sensíveis de pareamento a aplicativos aprovados</label>
     <label className={ui.mcpCheck}><input type="checkbox" disabled={!canEdit||!policy.mcp_enabled}
      checked={policy.mcp_send_enabled} onChange={e=>setPolicy(p=>({...p,mcp_send_enabled:e.target.checked}))}/>
      Permitir solicitações de envio com aprovação humana individual (nunca envio direto)</label>
     <a href="/mcp/pair">Vincular WhatsApp individual</a>
    </details>
    <div className={ui.mcpFooter}><button type="button" disabled={!canEdit||saving} onClick={save}>
     {saving?'Salvando…':'Salvar regras MCP'}</button>
     <p>Ao salvar, nenhuma mensagem é enviada e nenhum aplicativo é automaticamente conectado.</p></div>
   </>}
  {error&&<p role="alert" className={ui.mcpError}>{error}</p>}
  {notice&&<p role="status" className={ui.mcpSuccess}>{notice}</p>}
 </main>;
}
