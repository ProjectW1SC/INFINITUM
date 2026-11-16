import {officeAuth,officeJson,safeOfficeError} from '../../../../../lib/office-server.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request){
 try{
  const {user,db}=await officeAuth(request);
  const start=new Date(Date.now()-30*86400000).toISOString();
  // This is a provider-confirmed OpenBot KPI only; previews, manual sends and
  // external MCP tools without a delivery receipt must never be counted.
  const row=await db.from('office_agent_reply_events')
   .select('owner_id,empresa_id,status,provider_message_id,created_at')
   .eq('owner_id',user.id).eq('status','accepted')
   .not('provider_message_id','is',null)
   .gte('created_at',start).order('created_at',{ascending:false}).limit(1000);
  if(row.error){
   if(['42P01','PGRST205'].includes(row.error.code)||/office_agent_reply_events.*(not found|does not exist)/i.test(String(row.error.message||'')))
    return officeJson({ok:true,available:false,source:'OpenBot',periodDays:30,
      total:0,mcp:0,byOperator:[],notice:'O banco nativo ainda não registra confirmações OpenBot; prévias MCP não contam como atendimento.'});
   throw Object.assign(Error('Não foi possível conferir atendimentos confirmados.'),{status:503});
  }
  const accepted=new Map();
  for(const event of row.data||[]){
   if(event.owner_id!==user.id||event.status!=='accepted'||!event.provider_message_id)continue;
   const id=event.provider_message_id;
   if(!accepted.has(id))accepted.set(id,event);
  }
  return officeJson({ok:true,available:true,source:'OpenBot',periodDays:30,
   total:accepted.size,mcp:0,byOperator:[{userId:user.id,displayName:user.email||'Operador autenticado',
     accepted:accepted.size}],truncated:(row.data||[]).length>=1000,
   notice:'Somente mensagens aceitas pelo WA.Auto e registradas no OpenBot; sem estimar entrega ou leitura.'});
 }catch(e){return safeOfficeError(e)}
}
