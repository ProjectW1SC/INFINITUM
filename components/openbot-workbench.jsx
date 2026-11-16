'use client';
import {useEffect,useMemo,useState} from 'react';
import ui from './killa-workbench.module.css';
import {OPENBOT_COWORKERS,planAgentTask,ZAPFAST_SINGLE_SESSION_URL} from '../lib/openbot-workspace-policy.mjs';
import {runBlackholeQwen,stopBlackholeQwen,checkBlackholeQwenSupport,getQwenCacheStatus} from '../lib/blackhole-local-llm.mjs';
import {offlineBlackholeReply} from '../lib/blackhole-chat.mjs';
import {planColibriLocal} from '../lib/colibri-local.mjs';
import {resolveLocalQwenModel} from '../lib/local-qwen-runtime.mjs';
import {buildQwenReviewPrompt,assessQwenReview} from '../lib/qwen-review-guard.mjs';
import {buildPredictLmPetition,buildPredictLmLegalSectionPrompt,createLegalDocumentHtml,createLegalTimelineSvg} from '../lib/predictlm-legal-studio.mjs';

export default function OpenBotWorkbench({db,session}){
 const [prompt,setPrompt]=useState('');
 const [draft,setDraft]=useState('');
 const [source,setSource]=useState('');
 const [engine,setEngine]=useState('colibri-local');
 const [consent,setConsent]=useState(true);
 const [preferCpu,setPreferCpu]=useState(true),[tokenBudget,setTokenBudget]=useState(384);
 const [mode,setMode]=useState('texto'),[kind,setKind]=useState('manifestacao');
 const [timelineEvents,setTimelineEvents]=useState(''),[timelineSvg,setTimelineSvg]=useState('');
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const [approved,setApproved]=useState(false),[reviewNote,setReviewNote]=useState('');
 const [cacheInfo,setCacheInfo]=useState(null);
 const plan=useMemo(()=>planAgentTask(prompt),[prompt]);
 const localSelected=['colibri-local','qwen','qwen17','qwen4'].includes(engine);
 const modelId=resolveLocalQwenModel(engine);
 useEffect(()=>()=>stopBlackholeQwen(),[]);
 useEffect(()=>{
  let present=true;
  getQwenCacheStatus().then(info=>{if(present)setCacheInfo(info)}).catch(()=>{});
  return()=>{present=false};
 },[]); 
 useEffect(()=>{
  if(typeof BroadcastChannel==='undefined')return;
  const channel=new BroadcastChannel('infinitum-qwen-preinstall');
  let lastRead=0;
  channel.onmessage=event=>{
   if(event.data?.type!=='qwen-preinstall')return;
   const now=Date.now();
   if(event.data.status==='complete'||now-lastRead>5000){
    lastRead=now;
    getQwenCacheStatus().then(setCacheInfo).catch(()=>{});
   }
  };
  return()=>channel.close();
 },[]);
 async function generate(){
  if(!prompt.trim()||busy)return;
  const userText=prompt.trim().slice(0,6000);
  setBusy(true);setDraft('');setApproved(false);setSource('');setNotice('');
  try{
   let answer,model;
   if(localSelected){
    const isPetition=mode==='peca';
    const authoritative=isPetition
      ?buildPredictLmPetition({kind,instructions:userText}).body
      :offlineBlackholeReply(userText);
    answer=authoritative;
    model=isPetition?'Minuta determinística PredictLM/LexisPredict · não protocolada':
      'Motor determinístico · sem consulta judicial';
    let profile={ok:false,reason:'Qwen não autorizado',device:'none'};
    if(consent)profile=await checkBlackholeQwenSupport({preferCpu,modelId});
    const route=planColibriLocal({prompt:userText,allowLocalModel:consent,
      device:{webgpu:profile.device==='webgpu',memoryGb:Number(navigator?.deviceMemory||0),preferCpu},modelId});
    if(route.engine==='qwen'){
      try{
        const generatorPrompt=isPetition
          ?buildPredictLmLegalSectionPrompt({kind,instructions:userText})
          :buildQwenReviewPrompt(authoritative);
        const out=await runBlackholeQwen(generatorPrompt,[],p=>setNotice(p.message||p.status),
          {consent:true,maxTokens:tokenBudget,timeoutMs:600000,preferCpu,modelId});
        getQwenCacheStatus().then(setCacheInfo).catch(()=>{});
        if(isPetition){
          answer=authoritative+'\n\n--- SUGESTÃO DO QWEN (NÃO VERIFICADA — ADVOGADO DEVE CONFERIR) ---\n'+out.reply;
          model='Minuta estruturada + '+out.model+' ('+out.device+') · revisão obrigatória';
          setNotice('Trecho redigido no navegador. A IA não verificou decisões, leis ou documentos; confira tudo antes de usar.');
        }else{
          const checked=assessQwenReview(authoritative,out.reply);
          if(checked.ok){
            answer=checked.text;model=out.model+' ('+out.device+') revisou a redação · fatos determinísticos';
            setNotice('Revisão feita no navegador, sem consulta judicial ou envio externo.');
          }else{
            model='Motor determinístico · revisão do Qwen rejeitada';
            setNotice('O Qwen alterou elementos protegidos ('+checked.reason+'). Rascunho original mantido.');
          }
        }
      }catch(error){
        setNotice('IA local não concluiu: '+String(error.message||error).slice(0,180)+'. O rascunho estruturado foi preservado.');
      }
    }else{
      setNotice(!consent?'Rascunho disponível sem IA generativa. Autorize o Qwen para geração local.':
        'Qwen não carregado: '+(profile.reason||route.notice)+'. Rascunho determinístico mantido.');
    }
   }else{
    answer=mode==='peca'?buildPredictLmPetition({kind,instructions:userText}).body:offlineBlackholeReply(userText);
    model=mode==='peca'?'Minuta estruturada determinística · não protocolada':'Regras e evidências locais';
   }
   if(typeof answer!=='string'||!answer.trim())throw Error('Motor não retornou texto verificável.');
   setDraft(answer.slice(0,18000));
   setSource(model);
   if(engine==='deterministico')setNotice('Rascunho determinístico pronto. Nenhuma consulta judicial ou mensagem WhatsApp foi enviada.');
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
    result:{answer:draft.slice(0,18000),engine:source,decision,
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
 return <section className="inf-panel" aria-label="Killa AI · laboratório de agentes sob revisão" style={{marginTop:18}}>
  <div className={ui.shell}>
   <div className={ui.top}><span className={ui.brand}><span className={ui.dot}/>KILLA <b>AI</b></span>
    <span className={ui.status}>IA local · protegida</span></div>
   <div className={ui.center}>
    <div className={ui.orb} aria-hidden="true"/>
    <h2>Como posso ajudar?</h2>
    <p>Uma central de inteligência para atendimento e jurídico, sem perder o controle dos dados.</p>
   </div>
   <div className={ui.composer}>
    <label htmlFor="killa-input" className={ui.srOnly}>Mensagem para Killa AI</label>
    <textarea id="killa-input" rows={3} maxLength={6000} value={prompt} onChange={e=>setPrompt(e.target.value)}
     placeholder="Peça uma análise, um resumo ou uma resposta baseada em fatos confirmados…"/>
    <div className={ui.actions}><span>{mode==='peca'?'Peça jurídica':'Assistente local'}</span>
     <button onClick={generate} type="button" disabled={busy||!prompt.trim()}>{busy?'Processando…':'Enviar para revisão →'}</button>
    </div>
   </div>
   <nav className={ui.links}><a href="/mcp/setup">Conectar assistentes</a><a href="/whatsapp">Meu WhatsApp</a>
    <a href="/report">Atendimentos confirmados</a></nav>
   {draft&&<article className={ui.answer}><small>Resposta proposta · revisão obrigatória</small>
    <p>{draft}</p><small>{source}</small></article>}
  </div>
  <div className="blackhole-agents-header">
   <div><small>INFINITUM • KILLA AI · ADAPTAÇÃO</small><h2>Central dos agentes e IA local</h2>
    <p>Motores LexisPredict, PredictLM e modelos locais, com ferramentas MCP autenticadas e revisão humana para assuntos jurídicos.</p>
   </div>
  </div>
  <div className="office-agent-grid">{OPENBOT_COWORKERS.map(x=><article key={x.id} className="office-agent-card">
   <span className="inf-badge">Apenas revisão</span><strong>{x.label}</strong><p>{x.role}</p>
  </article>)}</div>
  <div className="inf-note" style={{marginTop:15}}>
   <a href="/mcp/setup" className="inf-btn" style={{display:'inline-block',marginBottom:10}}>Configurar MCP do Killa AI</a>
   <p>Conecte assistentes externos por OAuth para ler conversas autorizadas e preparar rascunhos. Nenhuma ferramenta MCP envia WhatsApp.</p>
   <strong>WhatsApp com um único QR Code.</strong> Acesse a sessão atual pelo
   {' '}<a href={ZAPFAST_SINGLE_SESSION_URL} target="_blank" rel="noopener noreferrer">ZapFast Web (Cloudflare)</a>
   {' '}ou utilize o WA.Auto já configurado no INFINITUM. Não vincule o mesmo número a dois motores ao mesmo tempo.
  </div>
  <div className="office-form-col" style={{marginTop:15}}>
   <label>Tipo de trabalho
    <select value={mode} onChange={e=>{setMode(e.target.value);setDraft('');setApproved(false)}}>
     <option value="texto">Respostas e tarefas de IA</option>
     <option value="peca">Peças jurídicas · PredictLM + Qwen local</option>
    </select>
   </label>
   {mode==='peca'&&<label>Modelo de peça
    <select value={kind} onChange={e=>setKind(e.target.value)}>
     <option value="manifestacao">Manifestação</option><option value="peticao_inicial">Petição inicial</option>
     <option value="contestacao">Contestação</option><option value="recurso">Recurso (modalidade a confirmar)</option>
     <option value="relatorio">Relatório jurídico</option><option value="outro">Outra peça</option>
    </select>
   </label>}
   <label>{mode==='peca'?'Objetivo e fatos fornecidos pelo advogado':'Pedido para os agentes'}
    <textarea rows={5} maxLength={6000} value={prompt} onChange={e=>setPrompt(e.target.value)}
      placeholder={mode==='peca'?'Descreva a finalidade e os fatos confirmados. A IA não inventará número CNJ, jurisprudência ou decisão.':'Ex.: prepare um resumo em linguagem simples do andamento confirmado.'}/>
   </label>
   <p className="office-hint">Roteamento: {OPENBOT_COWORKERS.find(x=>x.id===plan.role)?.label} · revisão humana obrigatória.
    A IA não consulta nem envia automaticamente dados confidenciais da carteira.
    A Vercel hospeda o aplicativo; Qwen roda na CPU/WebAssembly por padrão, sem WebGPU. O uso de GPU é opcional.
    Nenhum servidor PredictLM pago é necessário. Os pesos ficam salvos no cache deste domínio após o primeiro download;
    quando o navegador autoriza armazenamento persistente, evita exclusão automática dos arquivos. A CPU usa uma thread. Qwen3 4B exige WebGPU; Qwen3 1,7B exige mais memória.
    Os templates de peças e diagramas são gerados por código; nenhum documento é protocolado automaticamente.
    {' '}Cache: {cacheInfo?.complete?'Qwen já preparado no disco':
    cacheInfo?.preinstallChunks>0?cacheInfo.preinstallChunks+' de '+cacheInfo.preinstallTotalChunks+' partes salvas; a preparação continuará após F5':
    cacheInfo?.cachedFiles>0?cacheInfo.cachedFiles+' arquivos pequenos preparados':'preparação automática iniciada ao abrir o domínio fixo'}.
    {' '}{cacheInfo?.persisted?'Persistência autorizada.':'Persistência sujeita às regras do navegador.'}
    {' '}Acesse o <a href="https://agentinfinitum.vercel.app/agentes">domínio fixo do INFINITUM</a> para reutilizar os arquivos.</p>
   <label>Motor de inteligência
    <select value={engine} onChange={e=>{setEngine(e.target.value);if(e.target.value==='qwen4')setPreferCpu(false);setDraft('');setApproved(false)}}>
     <option value="colibri-local">Qwen local · CPU padrão, grátis e ativo</option>
     <option value="deterministico">Motor PredictLM/LexisPredict determinístico · sem modelo</option>
     <option value="qwen">Qwen 0,5B · CPU/WebAssembly</option>
     <option value="qwen17">Qwen3 1,7B · CPU (8 GB RAM) ou GPU</option>
     <option value="qwen4">Qwen3 4B · GPU (8 GB RAM)</option>
    </select>
   </label>
   {localSelected&&<label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>
    Modelo local opcional, sem servidor Colibri/Needle. Os modelos grandes baixam pesos apenas quando escolhidos e exigem mais RAM. Desmarque para usar somente regras leves.
   </label>}
   {localSelected&&<div className="office-action-row">
    <label><input type="checkbox" checked={!preferCpu} onChange={e=>setPreferCpu(!e.target.checked)}/>
     Usar GPU opcionalmente (CPU é o padrão)
    </label>
    <label>Tamanho da resposta por geração
     <select value={tokenBudget} onChange={e=>setTokenBudget(Number(e.target.value))}>
      {[128,256,384,512,768,1024,1536,2048].map(n=><option key={n} value={n}>{n} tokens</option>)}
     </select>
    </label>
    <p className="office-hint">Sem cota diária de tokens ou perguntas da IA local. O tamanho é por resposta e pode ser ajustado; respostas longas podem levar mais tempo na CPU.</p>
   </div>
   }
   <div className="office-action-row"><button type="button" className="inf-btn primary" onClick={generate}
     disabled={busy||!prompt.trim()}>
     {busy?'Executando...':mode==='peca'?'Gerar minuta e sugestão da IA':'Gerar rascunho para revisão'}
   </button>
   {busy&&localSelected&&<button type="button" className="inf-btn" onClick={()=>{stopBlackholeQwen();setBusy(false)}}>Parar IA local</button>}
   </div>
   {draft&&<div className="inf-note"><strong>Rascunho para revisão humana · {source}</strong><p style={{whiteSpace:'pre-wrap'}}>{draft}</p>
    {mode==='peca'&&<button type="button" className="inf-btn" onClick={()=>{
      const html=createLegalDocumentHtml({title:'Minuta '+kind.replace(/_/g,' '),body:draft});
      const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));
      const a=document.createElement('a');a.href=url;a.download='minuta-juridica-interna.html';a.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }}>Baixar minuta editável em HTML (imprimir em PDF)</button>}
    <p>NÃO é uma atualização oficial do tribunal. Não pode ser enviada automaticamente.</p>
    <label>Motivo e responsável pela revisão<textarea rows={2} value={reviewNote} maxLength={450}
      onChange={e=>setReviewNote(e.target.value)} placeholder="Descreva o que foi conferido nos autos e a decisão do operador."/></label>
    <div className="office-action-row">
     <button type="button" className="inf-btn primary" disabled={busy||!reviewNote.trim()} onClick={()=>review('approved')}>Aprovar para uso manual</button>
     <button type="button" className="inf-btn" disabled={busy||!reviewNote.trim()} onClick={()=>review('rejected')}>Rejeitar e registrar</button>
     {approved&&<button type="button" className="inf-btn" onClick={()=>navigator.clipboard?.writeText(draft).then(()=>setNotice('Copiado para revisão manual; nenhum envio realizado.')).catch(()=>setNotice('Não foi possível copiar.'))}>Copiar rascunho</button>}
    </div>
   </div>}
   <details className="inf-note" style={{marginTop:14}}>
    <summary>Diagramas para peças · PredictLM visual local (SVG)</summary>
    <p>Insira datas e fatos já conferidos, um por linha: DD/MM/AAAA | descrição. O desenho não é prova judicial nem imagem neural.</p>
    <textarea rows={4} maxLength={1900} value={timelineEvents} onChange={e=>setTimelineEvents(e.target.value)}
      placeholder={'12/11/2026 | Documento juntado\n14/11/2026 | Processo encaminhado ao juiz'}/>
    <div className="office-action-row">
     <button type="button" className="inf-btn" onClick={()=>{
      try{setTimelineSvg(createLegalTimelineSvg({events:timelineEvents}));setNotice('Linha do tempo local gerada. Confira datas e eventos.')}
      catch(error){setNotice(String(error.message||error));}
     }}>Gerar linha do tempo</button>
     {timelineSvg&&<button type="button" className="inf-btn" onClick={()=>{
      const url=URL.createObjectURL(new Blob([timelineSvg],{type:'image/svg+xml'}));
      const a=document.createElement('a');a.href=url;a.download='linha-do-tempo-nao-verificada.svg';a.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
     }}>Baixar SVG</button>}
    </div>
    {timelineSvg&&<img alt="Linha do tempo ilustrativa, sem verificação judicial" style={{maxWidth:'100%',borderRadius:8}}
      src={'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(timelineSvg)}/>}
   </details>
   {notice&&<p className="inf-note" role="status">{notice}</p>}
  </div>
 </section>;
}
