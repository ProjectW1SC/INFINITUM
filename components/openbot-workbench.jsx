'use client';
import {useEffect,useMemo,useState} from 'react';
import {OPENBOT_COWORKERS,planAgentTask,ZAPFAST_SINGLE_SESSION_URL} from '../lib/openbot-workspace-policy.mjs';
import {runBlackholeQwen,stopBlackholeQwen,checkBlackholeQwenSupport} from '../lib/blackhole-local-llm.mjs';
import {offlineBlackholeReply} from '../lib/blackhole-chat.mjs';

export default function OpenBotWorkbench({db,session}){
 const [prompt,setPrompt]=useState('');
 const [draft,setDraft]=useState('');
 const [source,setSource]=useState('');
 const [engine,setEngine]=useState('deterministico');
 const [consent,setConsent]=useState(false),[externalAiConsent,setExternalAiConsent]=useState(false);
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const [approved,setApproved]=useState(false),[reviewNote,setReviewNote]=useState('');
 const plan=useMemo(()=>planAgentTask(prompt),[prompt]);
 useEffect(()=>()=>stopBlackholeQwen(),[]);
 async function generate(){
  if(!prompt.trim()||busy)return;
  const userText=prompt.trim().slice(0,1500);
  setBusy(true);setDraft('');setApproved(false);setSource('');setNotice('');
  try{
   let answer,model;
   if(engine==='qwen'){
    if(!consent)throw Error('Autorize o Qwen 0,5B no navegador. O modelo não roda automaticamente.');
    const profile=await checkBlackholeQwenSupport();
    if(!profile.ok)throw Error(profile.reason);
    const out=await runBlackholeQwen(userText,[],p=>setNotice(p.message||p.status),{consent:true});
    answer=out.reply;model=out.model;
   }else if(engine==='colibri'){
    if(!externalAiConsent)throw Error('Autorize expressamente o envio desta pergunta para o Colibri externo.');
    const {data:{session:current}}=await db.auth.getSession();
    if(!current?.access_token)throw Error('Sessão do INFINITUM expirada. Entre novamente.');
    const response=await fetch('/api/superagente',{method:'POST',headers:{
     'Content-Type':'application/json',Authorization:'Bearer '+current.access_token
    },body:JSON.stringify({prompt:userText,externalAiConsent:true,allowEngineFallback:true,
       preferredMotor:'colibri',messages:[]}),cache:'no-store'});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||!payload.ok)throw Error(payload.error||'Colibri indisponível');
    if(payload.engine!=='colibri')throw Error('Colibri não respondeu. Nenhum outro provedor foi aceito como substituto.');
    answer=payload.reply;model='Colibri / '+payload.model;
   }else{
    answer=offlineBlackholeReply(userText);model='Regras e evidências locais';
   }
   if(typeof answer!=='string'||!answer.trim())throw Error('Motor não retornou texto verificável.');
   setDraft(answer.slice(0,2600));
   setSource(model);
   setNotice('Rascunho pronto. A origem do motor é exibida; nenhuma consulta judicial ou envio WhatsApp foi realizado.');
  }catch(error){setNotice('Não foi possível gerar: '+String(error.message||error).slice(0,240))}
  finally{setBusy(false)}
 }
 async function review(decision){
  if(!draft||!session?.user?.id||!reviewNote.trim())return setNotice('Registre o motivo da decisão antes de salvar.');
  setBusy(true);
  try{
   const {error}=await db.from('office_agent_runs').insert({
    owner_id:session.user.id,agent:'openbot-workspace',task:prompt.slice(0,300),
    mode:'manual',status:'review',external_actions:0,sources:[],
    result:{answer:draft.slice(0,2600),engine:source,decision,
       human_review:true,scope:'somente este rascunho',review_note:reviewNote.slice(0,450),
       whatsapp_sent:false,official_lookup_performed:false}
   });
   if(error)throw error;
   setApproved(decision==='approved');
   setNotice(decision==='approved'
    ?'Aprovado para uso manual e registrado. Não houve envio nem confirmação judicial.'
    :'Rejeitado e registrado. Nenhum envio foi realizado.');
  }catch(error){setNotice('Não foi possível registrar a revisão: '+String(error.message||error).slice(0,180))}
  finally{setBusy(false)}
 }
 return <section className="inf-panel" aria-label="OpenBot · laboratório de agentes sob revisão" style={{marginTop:18}}>
  <div className="blackhole-agents-header">
   <div><small>INFINITUM • OPENBOT · ADAPTAÇÃO</small><h2>Central dos agentes e IA local</h2>
    <p>Seis papéis do escritório, modelos do LexisPredict e análise do SheetsPredict. Esta versão é uma adaptação: não executa o servidor completo do OpenBot.</p>
   </div>
  </div>
  <div className="office-agent-grid">{OPENBOT_COWORKERS.map(x=><article key={x.id} className="office-agent-card">
   <span className="inf-badge">Apenas revisão</span><strong>{x.label}</strong><p>{x.role}</p>
  </article>)}</div>
  <div className="inf-note" style={{marginTop:15}}>
   <strong>WhatsApp com um único QR Code.</strong> Acesse a sessão atual pelo
   {' '}<a href={ZAPFAST_SINGLE_SESSION_URL} target="_blank" rel="noopener noreferrer">ZapFast Web (Cloudflare)</a>
   {' '}ou utilize o WA.Auto já configurado no INFINITUM. Não vincule o mesmo número a dois motores ao mesmo tempo.
  </div>
  <div className="office-form-col" style={{marginTop:15}}>
   <label>Pedido para os agentes (somente texto que você decidir informar)
    <textarea rows={3} maxLength={1500} value={prompt} onChange={e=>setPrompt(e.target.value)}
      placeholder="Ex.: prepare um resumo simples do andamento que já foi confirmado, sem inventar fatos."/>
   </label>
   <p className="office-hint">Roteamento: {OPENBOT_COWORKERS.find(x=>x.id===plan.role)?.label} · revisão humana obrigatória.
    A IA não consulta nem envia automaticamente dados confidenciais da carteira.</p>
   <label>Motor de inteligência
    <select value={engine} onChange={e=>{setEngine(e.target.value);setDraft('');setApproved(false)}}>
     <option value="deterministico">Superagente determinístico · sem download</option>
     <option value="qwen">Qwen2.5 0,5B · local no navegador (WebGPU)</option>
     <option value="colibri">Colibri · servidor HTTPS configurado</option>
    </select>
   </label>
   {engine==='qwen'&&<label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>
    Autorizo o download e execução local do Qwen. Exige WebGPU e pelo menos 8 GB de RAM detectável; sem fallback CPU.
   </label>}
   {engine==='colibri'&&<label><input type="checkbox" checked={externalAiConsent}
     onChange={e=>setExternalAiConsent(e.target.checked)}/>
    Autorizo enviar somente o texto acima ao servidor Colibri, se estiver configurado. Não usar outro provedor.
   </label>}
   <div className="office-action-row"><button type="button" className="inf-btn primary" onClick={generate}
     disabled={busy||!prompt.trim()||(engine==='qwen'&&!consent)||(engine==='colibri'&&!externalAiConsent)}>
     {busy?'Executando...':'Gerar rascunho para revisão'}
   </button>
   {busy&&engine==='qwen'&&<button type="button" className="inf-btn" onClick={()=>{stopBlackholeQwen();setBusy(false)}}>Parar Qwen</button>}
   </div>
   {draft&&<div className="inf-note"><strong>Rascunho · {source}</strong><p style={{whiteSpace:'pre-wrap'}}>{draft}</p>
    <p>NÃO é uma atualização oficial do tribunal. Não pode ser enviada automaticamente.</p>
    <label>Motivo e responsável pela revisão<textarea rows={2} value={reviewNote} maxLength={450}
      onChange={e=>setReviewNote(e.target.value)} placeholder="Descreva o que foi conferido nos autos e a decisão do operador."/></label>
    <div className="office-action-row">
     <button type="button" className="inf-btn primary" disabled={busy||!reviewNote.trim()} onClick={()=>review('approved')}>Aprovar para uso manual</button>
     <button type="button" className="inf-btn" disabled={busy||!reviewNote.trim()} onClick={()=>review('rejected')}>Rejeitar e registrar</button>
     {approved&&<button type="button" className="inf-btn" onClick={()=>navigator.clipboard?.writeText(draft).then(()=>setNotice('Copiado para revisão manual; nenhum envio realizado.')).catch(()=>setNotice('Não foi possível copiar.'))}>Copiar rascunho</button>}
    </div>
   </div>}
   {notice&&<p className="inf-note" role="status">{notice}</p>}
  </div>
 </section>;
}
