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
