'use client';
import {useEffect,useMemo,useState} from 'react';
import {OPENBOT_COWORKERS,planAgentTask,ZAPFAST_SINGLE_SESSION_URL} from '../lib/openbot-workspace-policy.mjs';
import {runBlackholeQwen,stopBlackholeQwen,checkBlackholeQwenSupport} from '../lib/blackhole-local-llm.mjs';
import {offlineBlackholeReply} from '../lib/blackhole-chat.mjs';
import {planColibriLocal} from '../lib/colibri-local.mjs';
import {buildQwenReviewPrompt,assessQwenReview} from '../lib/qwen-review-guard.mjs';
import {buildPredictLmPetition,buildPredictLmLegalSectionPrompt,createLegalDocumentHtml,createLegalTimelineSvg} from '../lib/predictlm-legal-studio.mjs';

export default function OpenBotWorkbench({db,session}){
 const [prompt,setPrompt]=useState('');
 const [draft,setDraft]=useState('');
 const [source,setSource]=useState('');
 const [engine,setEngine]=useState('colibri-local');
 const [consent,setConsent]=useState(false);
 const [preferCpu,setPreferCpu]=useState(false),[tokenBudget,setTokenBudget]=useState(384);
 const [mode,setMode]=useState('texto'),[kind,setKind]=useState('manifestacao');
 const [timelineEvents,setTimelineEvents]=useState(''),[timelineSvg,setTimelineSvg]=useState('');
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const [approved,setApproved]=useState(false),[reviewNote,setReviewNote]=useState('');
 const plan=useMemo(()=>planAgentTask(prompt),[prompt]);
 useEffect(()=>()=>stopBlackholeQwen(),[]);
 async function generate(){
  if(!prompt.trim()||busy)return;
  const userText=prompt.trim().slice(0,6000);
  setBusy(true);setDraft('');setApproved(false);setSource('');setNotice('');
  try{
   let answer,model;
   if(engine==='colibri-local'||engine==='qwen'){
    const isPetition=mode==='peca';
    const authoritative=isPetition
      ?buildPredictLmPetition({kind,instructions:userText}).body
      :offlineBlackholeReply(userText);
    answer=authoritative;
    model=isPetition?'Minuta determinística PredictLM/LexisPredict · não protocolada':
      'Motor determinístico · sem consulta judicial';
    let profile={ok:false,reason:'Qwen não autorizado',device:'none'};
    if(consent)profile=await checkBlackholeQwenSupport({preferCpu});
    const route=planColibriLocal({prompt:userText,allowLocalModel:consent,
      device:{webgpu:profile.device==='webgpu',memoryGb:Number(navigator?.deviceMemory||0),preferCpu}});
    if(route.engine==='qwen'){
      try{
        const generatorPrompt=isPetition
          ?buildPredictLmLegalSectionPrompt({kind,instructions:userText})
          :buildQwenReviewPrompt(authoritative);
        const out=await runBlackholeQwen(generatorPrompt,[],p=>setNotice(p.message||p.status),
          {consent:true,maxTokens:tokenBudget,timeoutMs:600000,preferCpu});
        if(isPetition){
          answer=authoritative+'\n\n--- SUGESTÃO DO QWEN (NÃO VERIFICADA — ADVOGADO DEVE CONFERIR) ---\n'+out.reply;
          model='Minuta estruturada + Qwen '+out.device+' · revisão obrigatória';
          setNotice('Trecho redigido no navegador. A IA não verificou decisões, leis ou documentos; confira tudo antes de usar.');
        }else{
          const checked=assessQwenReview(authoritative,out.reply);
          if(checked.ok){
            answer=checked.text;model='Qwen 0,5B ('+out.device+') revisou a redação · fatos determinísticos';
            setNotice('Revisão feita no navegador, sem consulta judicial ou envio externo.');
          }else{
            model='Motor determinístico · revisão do Qwen rejeitada';
            setNotice('O Qwen alterou elementos protegidos ('+checked.reason+'). Rascunho original mantido.');
          }
        }
      }catch(error){
        setNotice('IA local não concluiu: '+String(error.message||error).slice(0,180)+'. O rascunho estruturado foi preservado.');
      }finally{stopBlackholeQwen();}
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
    A Vercel hospeda o aplicativo; a inferência Qwen usa WebGPU quando disponível ou CPU/WebAssembly.
    Nenhum servidor PredictLM pago é necessário. O modelo é baixado no primeiro uso e pode ser lento na CPU.
    Os templates de peças e diagramas são gerados por código; nenhum documento é protocolado automaticamente.</p>
   <label>Motor de inteligência
    <select value={engine} onChange={e=>{setEngine(e.target.value);setDraft('');setApproved(false)}}>
     <option value="colibri-local">Qwen preferencial · GPU ou CPU (sem servidor)</option>
     <option value="deterministico">Motor PredictLM/LexisPredict determinístico · sem modelo</option>
     <option value="qwen">Qwen 0,5B · CPU/WebAssembly também disponível</option>
    </select>
   </label>
   {(engine==='qwen'||engine==='colibri-local')&&<label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>
    Autorizar carregamento do Qwen 0,5B neste navegador. Não exige WebGPU; pode funcionar pela CPU com WebAssembly.
    O primeiro uso baixa os pesos quantizados. Desmarcado: usar apenas regras locais.
   </label>}
   {(engine==='qwen'||engine==='colibri-local')&&<div className="office-action-row">
    <label><input type="checkbox" checked={preferCpu} onChange={e=>setPreferCpu(e.target.checked)}/>
     Forçar CPU/WebAssembly (mais lento, sem exigir WebGPU)
    </label>
    <label>Tamanho da resposta por geração
     <select value={tokenBudget} onChange={e=>setTokenBudget(Number(e.target.value))}>
      {[128,256,384,512,768,1024].map(n=><option key={n} value={n}>{n} tokens</option>)}
     </select>
    </label>
   </div>
   }
   <div className="office-action-row"><button type="button" className="inf-btn primary" onClick={generate}
     disabled={busy||!prompt.trim()}>
     {busy?'Executando...':mode==='peca'?'Gerar minuta e sugestão da IA':'Gerar rascunho para revisão'}
   </button>
   {busy&&(engine==='qwen'||engine==='colibri-local')&&<button type="button" className="inf-btn" onClick={()=>{stopBlackholeQwen();setBusy(false)}}>Parar IA local</button>}
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
   {notice&&<p className="inf-note" role="status">{notice}</p>
  </div>
 </section>;
}
