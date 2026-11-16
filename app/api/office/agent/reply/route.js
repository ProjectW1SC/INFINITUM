import {officeAuth,officeJson,safeOfficeError} from '../../../../../lib/office-server.mjs';
import {isDemoUserCompany} from '../../../../../lib/demo-tenant.mjs';
import {waAutoOperation} from '../../../../../lib/wa-auto-bridge.mjs';
import {routeInboundQuestion,buildVerifiedReply,prepareConversationMemory,validateReplyTarget,canReleaseLegalReply} from '../../../../../lib/office-legal-reply.mjs';
import {assessQwenReview} from '../../../../../lib/qwen-review-guard.mjs';
import {selectOfficeAgentSkills} from '../../../../../lib/office-agent-skills.mjs';
import {planPredictLmLegalCores,classifyPredictLmFailure,predictLmCoreCatalog} from '../../../../../lib/predictlm-office-cores.mjs';
import {predictLmConfig} from '../../../../../lib/predictlm-gateway.mjs';
import {normalizeOpenBotPolicy,contactNameVariants,rankProcessCandidates,evaluateOpenBotInbound,planNextOpenBotReturn,composeOpenBotCaseReply} from '../../../../../lib/openbot-company-agent.mjs';
import {GET as consultOfficialProcess} from '../../../processos/consulta/route.js';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=90;

const validJid=value=>typeof value==='string'&&/^[1-9][0-9]{9,14}@s\.whatsapp\.net$/.test(value);
const invalid=(text,status=400)=>{throw Object.assign(Error(text),{status})};
const parseNumber=value=>{const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:null;};
const date=()=>new Date().toISOString();
const tokenFrom=request=>(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'').trim();
async function companyFor(db,user){
 const r=await db.from('usuarios').select('empresa_id').eq('auth_user_id',user.id).limit(2);
 if(r.error||r.data?.length!==1||!r.data[0]?.empresa_id)invalid('Não foi possível confirmar a empresa deste login.',403);
 return r.data[0].empresa_id;
}
async function processFor(db,company,caseId){
 const id=parseNumber(caseId);
 if(!id)invalid('Selecione um processo válido.',400);
 const r=await db.from('processos').select('id,empresa_id,cliente,protocolo_ref,datajud_last_ok,datajud_consultado_em,datajud_ultimo_movimento,datajud_ultimo_nome,observacoes,telefone,ultimo_retorno,proximo_retorno,ultima_movimentacao')
  .eq('empresa_id',company).eq('id',id).limit(1).maybeSingle();
 if(r.error)invalid('Cadastro processual temporariamente indisponível.',503);
 if(!r.data||r.data.empresa_id!==company)invalid('Processo fora da carteira da empresa.',403);
 return r.data;
}
async function granted(db,user,company,jid){
 const r=await db.from('office_agent_reply_grants').select('id,owner_id,empresa_id,jid,processo_id,expires_at,revoked_at')
  .eq('owner_id',user.id).eq('empresa_id',company).eq('jid',jid).limit(1).maybeSingle();
 if(r.error)invalid('Autorizações do agente indisponíveis.',503);
 if(!r.data||r.data.revoked_at||Date.parse(r.data.expires_at)<=Date.now())
   invalid('Contato não autorizado. Confirme a identidade e o processo antes de responder.',403);
 return r.data;
}
async function conversation(db,user,company,jid,providerId){
 const r=await db.from('office_wa_message_archive')
   .select('provider_message_id,content,is_from_me,jid,timestamp,media_type')
   .eq('owner_id',user.id).eq('empresa_id',company).eq('jid',jid)
   .order('timestamp',{ascending:false}).limit(20);
 if(r.error)invalid('Histórico do WhatsApp indisponível. Nenhuma resposta foi enviada.',503);
 const rows=r.data||[];
 const chosen=rows.find(x=>x.provider_message_id===providerId&&!x.is_from_me);
 if(!chosen||(!chosen.content&&!/audio|ptt|voice/i.test(chosen.media_type||''))||Date.parse(chosen.timestamp)<Date.now()-24*3600000)
   invalid('A mensagem recebida não está confirmada no histórico recente.',409);
 return {chosen,rows,history:prepareConversationMemory(rows.slice(0,8).reverse(),jid)};
}
async function companyAgentPolicy(db,company,jid){
 const [config,exception,contact]=await Promise.all([
  db.from('office_agent_company_policies').select('config').eq('empresa_id',company).limit(1).maybeSingle(),
  db.from('office_agent_contact_rules').select('mode,suppress_until,assigned_staff')
   .eq('empresa_id',company).eq('jid',jid).limit(1).maybeSingle(),
  db.from('office_wa_chat_archive').select('name,phone,is_group')
   .eq('empresa_id',company).eq('jid',jid).limit(1).maybeSingle()
 ]);
 if(config.error||exception.error||contact.error)invalid('Regras da empresa ou histórico do contato indisponíveis.',503);
 const rule=exception.data&&Date.parse(exception.data.suppress_until)>Date.now()?exception.data:null;
 return {policy:normalizeOpenBotPolicy(config.data?.config||{}),rule,contact:contact.data};
}
function hearingLinkAllowed(raw){
 try{
  const u=new URL(raw);
  if(u.protocol!=='https:'||u.username||u.password||u.port)return false;
  return /(^|\.)(jus\.br|zoom\.us|webex\.com|meet\.google\.com|teams\.microsoft\.com)$/.test(u.hostname.toLowerCase());
 }catch{return false}
}
async function nextConciliationHearing(db,company,caseId){
 const today=new Date().toISOString().slice(0,10);
 const r=await db.from('audiencias_monitoradas').select('tipo,data_evento,hora_local,meeting_url,situacao,verificado_em')
  .eq('empresa_id',company).eq('processo_id',caseId).gte('data_evento',today)
  .order('data_evento',{ascending:true}).limit(10);
 if(r.error)invalid('Não foi possível conferir a agenda de audiências; não envie link sem validação.',503);
 const match=(r.data||[]).find(x=>/concilia/i.test(x.tipo||'')&&!/cancelad|suspens|remarcad/i.test(x.situacao||'')
  &&hearingLinkAllowed(x.meeting_url)&&x.verificado_em);
 return match?{date:match.data_evento,time:match.hora_local||null,url:match.meeting_url,verifiedAt:match.verificado_em}:null;
}
async function verifyPrepared(db,user,company,jid,providerId){
 if(!validJid(jid))invalid('Contato privado não reconhecido. IDs LID e grupos exigem conferência manual.',422);
 if(typeof providerId!=='string'||providerId.length<4||providerId.length>128)invalid('Mensagem recebida não identificada.',400);
 const grant=await granted(db,user,company,jid);
 const p=await processFor(db,company,grant.processo_id);
 const chat=await conversation(db,user,company,jid,providerId);
 const rules=await companyAgentPolicy(db,company,jid);
 const manual=rules.rule?.mode||'';
 const staffRepliedAfter=chat.rows.some(x=>x.is_from_me&&Date.parse(x.timestamp)>=Date.parse(chat.chosen.timestamp));
 const routed=evaluateOpenBotInbound({
  policy:rules.policy,jid,contactName:rules.contact?.name||'',authorized:true,
  administrativeContact:manual==='administrative',
  staffRepliedAfter,otherStaffActive:manual==='staff_active'||manual==='silence'||manual==='review',
  text:chat.chosen.content||'',mediaType:chat.chosen.media_type||'',history:chat.rows
 });
 if(routed.decision==='ignore')invalid('Regra da empresa: não responder ('+routed.reason+').',409);
 if(routed.decision==='review')invalid('Este atendimento precisa de revisão humana ('+routed.reason+').',409);
 const type=routeInboundQuestion(chat.chosen.content,{jid,fromMe:false});
 if(type==='human_review')invalid('Assunto sensível ou administrativo: encaminhe para atendimento humano.',409);
 if(type==='ignore'&&routed.decision!=='research'&&routed.decision!=='draft')
  invalid('Mensagem fora do assunto processual; o agente não responderá.',422);
 const predictLmReview=planPredictLmLegalCores({
   prompt:chat.chosen.content||'Qual é o andamento do processo?',movement:p.datajud_ultimo_nome,source:'DataJud',
   officialConfirmed:p.datajud_last_ok,checkedAt:p.datajud_consultado_em
 });
 if(predictLmReview.requiresHumanReview)invalid('PredictLM identificou revisão necessária: '+predictLmReview.reason,409);
 const source=buildVerifiedReply({caseRow:p});
 if(!source.ok)invalid('Movimentação oficial não está recente ou exige leitura humana: '+source.reason,409);
 const sentAfter=staffRepliedAfter;
 const hearing=await nextConciliationHearing(db,company,p.id);
 const reply=composeOpenBotCaseReply({
  sourceText:source.text,sourceAt:source.sourceAt,movementAt:p.datajud_ultimo_movimento,
  lastReturnAt:p.ultimo_retorno,history:chat.rows,policy:rules.policy
 });
 return {grant,p,chat,source:{...source,text:reply.text},sentAfter,predictLmReview,
   hearing,policy:rules.policy,replyMeta:reply,
   skills:selectOfficeAgentSkills({question:chat.chosen.content||'andamento do processo',action:'preview'})};
}
export async function POST(request){
 try{
  const {user,db}=await officeAuth(request);
  if(await isDemoUserCompany(db,user.id))invalid('A demonstração não permite atendimento jurídico real.',403);
  const company=await companyFor(db,user);
  const data=await request.json().catch(()=>null);
  if(!data||typeof data!=='object'||Array.isArray(data))invalid('Dados inválidos.',400);
  const action=String(data.action||'');
  const jid=String(data.jid||'').trim();
  const jwt=tokenFrom(request);
  if(action==='diagnostics'){
   return officeJson({
     ok:true,engine:'PredictLM · controles determinísticos',
     modelRunning:false,externalPredictLmConfigured:Boolean(predictLmConfig(process.env)),
     cores:predictLmCoreCatalog().map(x=>({id:x.id,name:x.name,mode:x.mode})),
     transport:'WA.Auto existente',sendsAutomatically:false,
     notice:'Os cores verificam risco, evidência e erros. Não são modelos carregados nem confirmam acesso judicial.'
   });
  }
  if(action==='cases'){
   const query=String(data.q||'').trim().replace(/[^\p{L}\p{N} .-]/gu,'').slice(0,60);
   if(query.length<3)invalid('Informe ao menos três caracteres para pesquisar.',400);
   const search=await db.from('processos').select('id,cliente,protocolo_ref,status')
     .eq('empresa_id',company).ilike('cliente','%'+query+'%').limit(12);
   if(search.error)invalid('Pesquisa na carteira indisponível.',503);
   return officeJson({ok:true,cases:search.data||[],source:'LexisPredict',limit:12});
  }
  if(action==='authorize'){
   if(!validJid(jid))invalid('Confirme um número WhatsApp privado (não LID ou grupo).',422);
   const p=await processFor(db,company,data.processo_id);
   const evidence=String(data.evidence||'').trim().slice(0,600);
   if(evidence.length<15)invalid('Registre como verificou a identidade e a autorização do cliente.',400);
   const authorizedAt=date();
   const entry={owner_id:user.id,empresa_id:company,jid,processo_id:p.id,verified_evidence:evidence,
     authorized_at:authorizedAt,expires_at:new Date(Date.now()+60*86400000).toISOString(),revoked_at:null};
   const up=await db.from('office_agent_reply_grants').upsert(entry,{onConflict:'owner_id,jid'}).select('id').maybeSingle();
   if(up.error||!up.data)invalid('Não foi possível registrar a autorização.',503);
   return officeJson({ok:true,authorized:true,notice:'Vínculo confirmado para este contato e processo. Nenhuma mensagem foi enviada.'});
  }
  if(action==='revoke'){
   if(!validJid(jid))invalid('Contato inválido.',400);
   const rev=await db.from('office_agent_reply_grants').update({revoked_at:date()})
     .eq('owner_id',user.id).eq('empresa_id',company).eq('jid',jid);
   if(rev.error)invalid('Não foi possível revogar a autorização.',503);
   return officeJson({ok:true,notice:'Autorização do agente revogada; nenhuma mensagem foi enviada.'});
  }
  if(action==='memory'){
   if(!validJid(jid))invalid('Selecione uma conversa privada.',422);
   await granted(db,user,company,jid);
   if(data.summary===undefined){
    const r=await db.from('office_agent_chat_memory').select('summary,updated_at,expires_at')
      .eq('owner_id',user.id).eq('empresa_id',company).eq('jid',jid).limit(1).maybeSingle();
    if(r.error)invalid('Memória indisponível.',503);
    return officeJson({ok:true,summary:r.data?.summary||'',updatedAt:r.data?.updated_at||null});
   }
   if(typeof data.summary!=='string'||data.summary.length>1000)invalid('A memória deve ter no máximo 1.000 caracteres.',400);
   const memory={owner_id:user.id,empresa_id:company,jid,summary:data.summary.trim(),
     updated_at:date(),expires_at:new Date(Date.now()+60*86400000).toISOString()};
   const saved=await db.from('office_agent_chat_memory').upsert(memory,{onConflict:'owner_id,jid'});
   if(saved.error)invalid('Memória não foi salva; confira o limite de 200 conversas.',503);
   return officeJson({ok:true,notice:'Memória curta registrada, com limite de 1.000 caracteres e prazo de 60 dias.'});
  }
  if(action==='research'){
   if(!validJid(jid))invalid('A pesquisa exige contato privado autorizado.',422);
   const grant=await granted(db,user,company,jid);
   const p=await processFor(db,company,grant.processo_id);
   const number=String(p.protocolo_ref||'');
   if(number.replace(/\D/g,'').length!==20)invalid('Número CNJ incompleto. Consulte o escritório.',409);
   const src=String(data.source||'auto').toLowerCase();
   if(!['auto','datajud','djen'].includes(src))invalid('Fonte judicial inválida.',400);
   const endpoint=new URL('/api/processos/consulta',request.url);
   endpoint.searchParams.set('numero',number);
   endpoint.searchParams.set('fonte',src);
   const query=new Request(endpoint,{method:'GET',headers:{Authorization:'Bearer '+jwt}});
   const resp=await consultOfficialProcess(query);
   const result=await resp.json().catch(()=>null);
   if(!resp.ok||!result?.ok){
     const recovery=classifyPredictLmFailure({status:resp.status,message:result?.error||''});
     invalid('Fonte oficial não confirmada: '+recovery.userMessage,
       [400,401,403,404,409,429].includes(resp.status)?resp.status:503);
   }
   return officeJson({ok:true,notice:'Consulta oficial concluída. Confira fonte, data e conteúdo antes do atendimento.',
     processNumber:number,official:{source:result.source||null,checkedAt:result.checkedAt||null,notice:result.notice||null,fromCache:result.fromCache===true,stale:result.stale===true,items:Array.isArray(result.items)?result.items.slice(0,8).map(item=>({codigo:item.codigo||null,nome:String(item.nome||item.descricao||'').slice(0,250),dataHora:item.dataHora||item.data||null})):[]},skills:['judicial-research']});
  }
  if(action!=='preview'&&action!=='send')invalid('Ação do agente não permitida.',400);
  const messageId=String(data.inbound_message_id||'');
  const checked=await verifyPrepared(db,user,company,jid,messageId);
  if(action==='preview'){
    const memo=await db.from('office_agent_chat_memory').select('summary,updated_at')
      .eq('owner_id',user.id).eq('empresa_id',company).eq('jid',jid).limit(1).maybeSingle();
    return officeJson({ok:true,allowedToSend:!checked.sentAfter,processoId:checked.p.id,
      caseNumber:checked.p.protocolo_ref,source:checked.source.source,
      sourceAt:checked.source.sourceAt,reply:checked.source.text,
      history:checked.chat.history,contextNote:memo.error?'':(memo.data?.summary||''),
      skills:checked.skills.map(x=>({id:x.id,title:x.title})),
      predictLmReview:{
        tier:checked.predictLmReview.tier,route:checked.predictLmReview.route,
        verification:checked.predictLmReview.verification,
        signals:checked.predictLmReview.signals,
        reason:checked.predictLmReview.reason,
        requiresHumanReview:checked.predictLmReview.requiresHumanReview
      },
      notice:checked.sentAfter?'Alguém respondeu após essa mensagem; não envie novamente.':'Prévia com fonte verificada. O envio exige confirmação e limites de segurança.'});
  }
  if(data.confirm_send!==true)invalid('O envio depende de confirmação individual do operador.',400);
  if(checked.sentAfter)invalid('Outro atendimento foi enviado após a pergunta. Não repetir.',409);
  const proposed=data.reviewed_text===undefined?checked.source.text:String(data.reviewed_text||'').trim();
  if(proposed!==checked.source.text){
   if(data.human_reviewed!==true)invalid('Texto alterado pelo Qwen exige revisão humana antes do envio.',403);
   const tested=assessQwenReview(checked.source.text,proposed);
   if(!tested.ok)invalid('Qwen alterou dado importante: '+tested.reason+'. Envio bloqueado.',409);
  }
  const to=validateReplyTarget({jid,approvedJid:checked.grant.jid});
  if(!to)invalid('Destino não coincide com a autorização do cadastro.',403);
  const daily=await db.from('office_agent_reply_events').select('jid,created_at,status')
    .eq('owner_id',user.id).eq('empresa_id',company).gte('created_at',
      new Date(Date.now()-86400000).toISOString()).order('created_at',{ascending:false}).limit(50);
  if(daily.error)invalid('Não foi possível conferir os limites de envio.',503);
  const now=new Date();
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const day=x=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(x.created_at));
  const todaySent=(daily.data||[]).filter(x=>day(x)===today);
  const gate=canReleaseLegalReply({now,privateJid:jid,inbound:true,authorized:true,official:true,
    humanAlreadyReplied:checked.sentAfter,globalDailyCount:todaySent.length,
    contactDailyCount:todaySent.filter(x=>x.jid===jid).length,
    lastOutboundAt:daily.data?.[0]?.created_at||null});
  if(!gate.ok)invalid('Limite de segurança: '+gate.reason,429);
  // One transactional reservation per inbound message. A timeout is uncertain,
  // NOT a reason to retry or to claim a delivered WhatsApp message.
  const reservation=await db.rpc('reserve_office_agent_reply',{
    p_jid:jid,p_inbound_message_id:messageId,p_processo_id:checked.p.id,p_reply:proposed.slice(0,700)});
  if(reservation.error||reservation.data?.ok!==true)
   invalid('Envio não reservado: '+String(reservation.data?.reason||reservation.error?.message||'restrição'),409);
  const reservationId=reservation.data.reservation_id;
  let transport=null,status='uncertain';
  try{
   transport=await waAutoOperation('send',user.id,{to,message:proposed,approved:true},process.env,fetch,jwt);
   if(transport?.ok===true&&transport.accepted===true)status='accepted';
  }catch(error){
   // Delivery can be accepted by WhatsApp even when the response times out.
   // Keep reserved/uncertain and NEVER retry automatically.
   try{await db.rpc('finalize_office_agent_reply',{p_id:reservationId,p_status:'uncertain',p_provider_message_id:null});}catch{}
   return officeJson({ok:false,uncertain:true,notice:'Envio sem confirmação. Não tente repetir automaticamente. Confira a conversa no WhatsApp.',
     reason:String(error?.message||'Falha da conexão').slice(0,150),reservationId},503);
  }
  if(status!=='accepted'){
   try{await db.rpc('finalize_office_agent_reply',{p_id:reservationId,p_status:'uncertain',p_provider_message_id:null});}catch{}
   invalid('Transportador não confirmou aceitação. Não reenviar automaticamente.',503);
  }
  const finish=await db.rpc('finalize_office_agent_reply',{
    p_id:reservationId,p_status:'accepted',p_provider_message_id:transport.messageId||null});
  // Keep the operator's handwritten note intact. Do not overwrite the
  // customer's conversation memory with auto-generated content on every send.
  let memory={error:true};
  try{
    const prior=await db.from('office_agent_chat_memory').select('summary')
      .eq('owner_id',user.id).eq('empresa_id',company).eq('jid',jid).limit(1).maybeSingle();
    if(!prior.error){
      const summary=prior.data?.summary||('Última resposta processual aceita pelo transporte em '+
        new Date().toLocaleDateString('pt-BR')+'. Fonte: DataJud.').slice(0,1000);
      memory=await db.from('office_agent_chat_memory').upsert({
        owner_id:user.id,empresa_id:company,jid,summary,
        last_inbound_message_id:messageId,updated_at:date(),
        expires_at:new Date(Date.now()+60*86400000).toISOString()
      },{onConflict:'owner_id,jid'});
    }
  }catch{}
  return officeJson({ok:true,accepted:true,delivered:false,read:false,messageId:transport.messageId||null,
    reservationId,recorded:!finish.error&&finish.data===true,
    memorySaved:!memory.error,notice:'WA.Auto aceitou a resposta ao cliente autorizado. Isso não confirma entrega ou leitura.'});
 }catch(error){return safeOfficeError(error)}
}
