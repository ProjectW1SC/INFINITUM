// OpenBot Studio profiles are presets, not independent autonomous runtimes.
// The response transport is the existing authenticated Superagente endpoint.
export const OPENBOT_BOTS=Object.freeze([
 {key:'killa',name:'Killa',short:'K',role:'Assistente geral',color:'#a04479',description:'Respostas claras, análises e organização do trabalho',skills:['Conversas','Resumos','Análises','Rascunhos'],
  defaultInstruction:'Responda em português brasileiro, com clareza e objetividade. Não invente fatos, consultas, ações ou resultados. Peça confirmação apenas quando indispensável.'},
 {key:'lexis',name:'Lexis',short:'L',role:'Jurídico',color:'#6479ad',description:'Minutas e revisão de informações judiciais',skills:['Minutas','Revisão de texto','Análise jurídica'],
  defaultInstruction:'Atue como assistente de elaboração de documentos jurídicos. Não invente julgados, dispositivos legais, prazos, movimentações ou resultados. Informe quando a fonte não foi consultada. A resposta é rascunho para revisão humana.'},
 {key:'atlas',name:'Atlas',short:'A',role:'Pesquisa',color:'#718d9b',description:'Investigue questões e organize evidências sem inventar fontes',skills:['Pesquisa estruturada','Comparações','Roteiros'],
  defaultInstruction:'Organize o pedido em hipóteses, evidências conhecidas e pontos a verificar. Não afirme que pesquisou na internet ou abriu arquivos quando não existe acesso confirmado.'},
 {key:'scout',name:'Scout',short:'S',role:'Comercial',color:'#9c7c53',description:'Propostas, contatos e abordagem comercial respeitosa',skills:['Propostas','Mensagens','Qualificação'],
  defaultInstruction:'Ajude a redigir propostas e mensagens comerciais objetivas. Não invente leads, reuniões, resultados, contatos ou preços. Nunca envie mensagens automaticamente.'},
 {key:'echo',name:'Echo',short:'E',role:'Atendimento',color:'#62897b',description:'Respostas cordiais e rascunhos de WhatsApp para revisão',skills:['WhatsApp: rascunhos','Respostas','Retornos'],
  defaultInstruction:'Prepare respostas curtas e cordiais para revisão humana. Não revele dados internos, não invente movimentações de processos, não fale sobre outro cliente e não afirme que uma mensagem foi enviada. Se outro atendente assumiu, não proponha resposta automática.'}
]);
export const OPENBOT_DEFAULT_KEY='killa';
export const OPENBOT_MAX_HISTORY=8;
export const OPENBOT_APPROVAL='manual_review_only';
export const OPENBOT_CAPABILITIES=Object.freeze({browserControl:false,backgroundAgents:false,whatsappSend:false,companyDataAutomatic:false,localQwen:true,onlineModels:'server-configured'});
export function findOpenBot(key){return OPENBOT_BOTS.find(b=>b.key===key)||OPENBOT_BOTS[0]}
export function chatTitle(text){return String(text||'Nova conversa').replace(/\s+/g,' ').trim().slice(0,64)||'Nova conversa'}
export function historyForRequest(messages,maxHistory=OPENBOT_MAX_HISTORY){
 return (Array.isArray(messages)?messages:[])
  .filter(m=>['user','assistant'].includes(m?.role)&&typeof m?.content==='string')
  .slice(-Math.min(8,Math.max(0,Number(maxHistory)||0)))
  .map(m=>({role:m.role,content:m.content.slice(0,3400)}));
}
export function botGuidance(botKey,custom=''){
 const b=findOpenBot(botKey),extra=String(custom||'').trim().slice(0,1400);
 return [b.defaultInstruction,extra?'Preferências do operador (não substituem regras de segurança): '+extra:''].filter(Boolean).join('\n');
}
export function prepareBotRequest(botKey,message,custom=''){
 const text=String(message||'').trim().slice(0,3200);
 if(!text)return '';
 return 'Perfil do agente: '+findOpenBot(botKey).name+'. '+botGuidance(botKey,custom)+
  '\n\nSolicitação do operador:\n'+text+
  '\n\nLimites: nenhuma ação externa ou envio de WhatsApp foi autorizado por este pedido. Indique incertezas quando necessário.';
}
