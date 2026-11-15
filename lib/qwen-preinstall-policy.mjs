// Free browser-only preparation for Qwen CPU: browser downloads during idle
// rather than blocking the first chat request. No remote inference API.
export const QWEN_CHUNK_BYTES=8*1024*1024;
export const QWEN_MAX_MODEL_BYTES=1024*1024*1024;
export const QWEN_MIN_SPARE_BYTES=750*1024*1024;
export const QWEN_PREINSTALL_ORIGIN='agentinfinitum.vercel.app';
export const QWEN_MODEL_ID='onnx-community/Qwen2.5-0.5B-Instruct';
export const QWEN_MODEL_FILE='onnx/model_quantized.onnx';
export function modelPreinstallUrl(){
 return 'https://huggingface.co/'+QWEN_MODEL_ID+'/resolve/main/'+QWEN_MODEL_FILE;
}
export function buildQwenChunkPlan(totalBytes,existing=new Set(),chunkSize=QWEN_CHUNK_BYTES){
 if(!Number.isSafeInteger(totalBytes)||totalBytes<=0||totalBytes>QWEN_MAX_MODEL_BYTES)
  throw Error('Tamanho inesperado do modelo Qwen. Instalação interrompida.');
 if(!Number.isSafeInteger(chunkSize)||chunkSize<1024||chunkSize>64*1024*1024)
  throw Error('Tamanho inválido dos blocos.');
 const out=[];
 for(let i=0;i<Math.ceil(totalBytes/chunkSize);i++){
  if(existing.has(i))continue;
  const start=i*chunkSize;
  out.push({index:i,start,end:Math.min(totalBytes-1,start+chunkSize-1)});
 }
 return out;
}
export function canPrefetchQwen({
 visible=false,memoryGb=0,freeBytes=0,saveData=false,effectiveType='4g',
 sameStableOrigin=false
}={}){
 if(!sameStableOrigin)return {ok:false,reason:'Acesse agentinfinitum.vercel.app para manter um único cache.'};
 if(!visible)return {ok:false,reason:'Preparação aguardando o retorno à aba.'};
 if(saveData||['2g','slow-2g'].includes(effectiveType))
  return {ok:false,reason:'Conexão econômica ou muito lenta; a transferência pesada foi adiada.'};
 if(Number(memoryGb)>0&&Number(memoryGb)<4)
  return {ok:false,reason:'Navegador informa menos de 4 GB RAM; preparação pesada desativada neste dispositivo.'};
 if(!Number.isFinite(Number(freeBytes))||Number(freeBytes)<QWEN_MIN_SPARE_BYTES)
  return {ok:false,reason:'Espaço insuficiente no armazenamento deste domínio para guardar o modelo.'};
 return {ok:true,reason:'Preparação gratuita permitida em segundo plano.'};
}

export function chooseQwenDownloadConcurrency({memoryGb=0,effectiveType='4g',downlink=0,saveData=false}={}){
 if(saveData||['slow-2g','2g','3g'].includes(String(effectiveType)))return 1;
 const ram=Number(memoryGb)||0;
 if(ram>0&&ram<4)return 1;
 // At most 3 x 8 MiB chunks in flight; do not overwhelm entry-level PCs.
 if(ram>=8&&Number(downlink)>=10)return 3;
 return 2;
}
export async function downloadQwenChunks({
 totalBytes,completed=new Set(),concurrency=2,
 readRange,writeChunk,isPaused=()=>false,onProgress=()=>{},onAbort=()=>{}
}={}){
 if(typeof readRange!=='function'||typeof writeChunk!=='function')
  throw Error('Leitura e escrita dos blocos precisam estar disponíveis.');
 const plan=buildQwenChunkPlan(totalBytes,completed);
 const workers=Math.max(1,Math.min(3,Math.round(Number(concurrency)||1)));
 let cursor=0,error=null,stopped=false;
 async function work(){
  while(!stopped){
   if(isPaused()){stopped=true;error=Error('Preparação Qwen pausada.');return;}
   const part=plan[cursor++];
   if(!part)return;
   try{
    const {bytes,total}=await readRange(part);
    if(stopped||isPaused()){stopped=true;error=Error('Preparação Qwen pausada.');return;}
    if(total!==undefined&&total!==totalBytes)
     throw Error('Modelo alterado durante a preparação.');
    if(!bytes||bytes.byteLength!==part.end-part.start+1)
     throw Error('Bloco do modelo incompleto ou tamanho incorreto.');
    await writeChunk(part.index,bytes);
    completed.add(part.index);
    onProgress({downloadedChunks:completed.size,totalChunks:Math.ceil(totalBytes/QWEN_CHUNK_BYTES)});
   }catch(err){
    if(!error){error=err;stopped=true;onAbort();}
    return;
   }
  }
 }
 await Promise.all(Array.from({length:Math.min(workers,plan.length)},()=>work()));
 if(error)throw error;
 if(isPaused())throw Error('Preparação Qwen pausada.');
 return {completed,totalChunks:Math.ceil(totalBytes/QWEN_CHUNK_BYTES)};
}
