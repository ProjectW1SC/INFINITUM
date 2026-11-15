'use client';
import {selectLocalQwenBackend,normalizeLocalTokenBudget} from './local-qwen-runtime.mjs';
// Qwen is isolated in a disposable browser worker. No external inference API,
// no server, no hidden polling, and no WA.Auto transport from this module.
let worker=null,active=null,serial=0;
export function stopBlackholeQwen(){
 if(active){const job=active;active=null;job.cancel();}
 if(worker){worker.terminate();worker=null}
}
export async function checkBlackholeQwenSupport({preferCpu=true}={}){
 if(typeof window==='undefined'||typeof Worker==='undefined'||typeof navigator==='undefined')
  return {ok:false,device:'none',reason:'Este navegador não suporta Web Workers para a execução isolada do Qwen.'};
 const memory=Number(navigator.deviceMemory||0);
 let webgpu=false;
 if(!preferCpu&&navigator.gpu?.requestAdapter){
  try{webgpu=Boolean(await navigator.gpu.requestAdapter({powerPreference:'low-power'}));}
  catch{/* CPU fallback if safe */}
 }
 return selectLocalQwenBackend({webgpu,memoryGb:memory,preferCpu});
}
export async function runBlackholeQwen(
 prompt,history=[],onProgress=()=>{},
 {consent=false,timeoutMs=480000,maxTokens=384,preferCpu=true}={}
){
 if(!consent)throw Error('Autorize o carregamento do modelo Qwen no navegador antes de iniciar.');
 if(active)throw Error('Já existe uma geração em andamento neste navegador.');
 const support=await checkBlackholeQwenSupport({preferCpu});
 if(!support.ok)throw Error(support.reason);
 if(typeof document!=='undefined'&&document.visibilityState==='hidden')
  throw Error('Mantenha a aba aberta durante a geração local.');
 if(!worker)worker=new Worker('/workers/blackhole-qwen-0.5b.worker.mjs',{type:'module',name:'infinitum-qwen'});
 const current=worker,id=++serial;
 const tokens=normalizeLocalTokenBudget(maxTokens);
 return new Promise((resolve,reject)=>{
  let deadline;
  const cleanup=()=>{
   if(active?.id===id)active=null;
   current.removeEventListener('message',receive);
   current.removeEventListener('error',error);
   clearTimeout(deadline);
  };
  const receive=e=>{
   if(e.data?.requestId!==id)return;
   const d=e.data;
   onProgress({status:d.status,message:d.message,progress:d.progress,file:d.file,device:d.device});
   if(d.status==='complete'){cleanup();resolve({reply:String(d.text||''),model:d.model||'Qwen 0.5B',
      device:d.device||support.device,local:true});}
   if(d.status==='error'){cleanup();if(worker===current){worker.terminate();worker=null}
      reject(Error(d.error||'Modelo local indisponível.'));}
  };
  const error=()=>{cleanup();if(worker===current){worker.terminate();worker=null}
    reject(Error('A geração local falhou. Use o motor determinístico ou tente com menos tokens.'));};
  deadline=setTimeout(()=>{cleanup();if(worker===current){worker.terminate();worker=null}
    reject(Error('A execução local excedeu o tempo configurado. O worker foi interrompido sem comprometer o CRM.'));},
    Math.max(30000,Math.min(900000,Number(timeoutMs)||480000)));
  active={id,cancel:()=>{cleanup();reject(Error('Geração local cancelada.'))}};
  current.addEventListener('message',receive);current.addEventListener('error',error);
  current.postMessage({requestId:id,prompt:String(prompt||'').slice(0,6000),
    history:Array.isArray(history)?history.slice(-4):[],
    maxTokens:tokens,device:support.device,allowCpuFallback:!preferCpu});
 });
}
