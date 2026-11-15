// Downloads ONLY public model weights into the browser's IndexedDB, not RAM
// inference. 8MiB byte-range requests are independently committed, so F5,
// logout, a failed network or PC restart resumes instead of restarting at zero.
import {
 getQwenManifest,setQwenManifest,listQwenChunkIndexes,saveQwenChunk,
 clearQwenModelChunks,getQwenPreinstallStatus
} from './qwen-preinstall-store.mjs';
const ORIGIN='https://huggingface.co/onnx-community/Qwen2.5-0.5B-Instruct/resolve/main/';
const MODEL_URL=ORIGIN+'onnx/model_quantized.onnx';
const CHUNK_BYTES=8*1024*1024;
const cacheKey='transformers-cache';
const smallFiles=['config.json','generation_config.json','tokenizer.json',
 'tokenizer_config.json','special_tokens_map.json','merges.txt','vocab.json'];
let running=false,paused=false,controller=null;
let bc=null;
try{bc=new BroadcastChannel('infinitum-qwen-preinstall');
 bc.onmessage=event=>{
  if(event.data?.type==='pause'){paused=true;controller?.abort()}
  if(event.data?.type==='resume')paused=false;
 }}catch{}
const emit=(status,extra={})=>{
 const value={type:'qwen-preinstall',status,...extra};
 self.postMessage(value);
 try{bc?.postMessage(value)}catch{}
};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// Some model CDNs do not expose Content-Range or respond with 200 to a range.
// This safe fallback streams the complete ONNX into CacheStorage IN A WORKER,
// never into JS RAM or into a Vercel function. Resume requires range support.
async function cacheWholeModel(response){
 if(!response?.ok)throw Error('O servidor não ofereceu os pesos do Qwen.');
 const size=Number(response.headers.get('content-length')||0);
 if(size>1024*1024*1024)throw Error('O arquivo do modelo excedeu o limite seguro.');
 const cache=await caches.open(cacheKey);
 emit('preparing',{message:'O fornecedor não disponibilizou retomada por partes. Salvando os pesos diretamente no disco, em segundo plano.'});
 await cache.put(MODEL_URL,response);
 emit('complete',{cached:true,message:'Qwen salvo no cache do navegador e pronto para ser carregado.'});
 return {nativeCached:true};
}
const fetchRange=async(start,end)=>{
 controller=new AbortController();
 try{
  const resp=await fetch(MODEL_URL,{
   mode:'cors',credentials:'omit',redirect:'follow',cache:'no-store',
   headers:{Range:'bytes='+start+'-'+end},signal:controller.signal
  });
  if(resp.status!==206){
   try{await resp.body?.cancel()}catch{}
   throw Error('O fornecedor não ofereceu downloads parciais (HTTP '+resp.status+').');
  }
  const header=resp.headers.get('content-range')||'';
  const m=header.match(/^bytes (\d+)-(\d+)\/(\d+)$/i);
  if(!m||Number(m[1])!==start||Number(m[2])!==end)
   throw Error('Resposta parcial sem intervalo verificável; não armazenada.');
  const total=Number(m[3]);
  if(!Number.isSafeInteger(total)||total<128*1024*1024||total>1024*1024*1024)
   throw Error('Tamanho do modelo Qwen inválido.');
  const bytes=new Uint8Array(await resp.arrayBuffer());
  if(bytes.byteLength!==end-start+1)throw Error('O bloco transferido está incompleto.');
  return {bytes,total,etag:resp.headers.get('etag')||''};
 }finally{controller=null}
};
async function probeModel(){
 controller=new AbortController();
 try{
  const r=await fetch(MODEL_URL,{mode:'cors',credentials:'omit',redirect:'follow',
   cache:'no-store',headers:{Range:'bytes=0-0'},signal:controller.signal});
  if(r.status===200)return await cacheWholeModel(r);
  if(r.status!==206){try{await r.body?.cancel()}catch{}
   throw Error('O servidor do modelo recusou a transferência.')}
  const m=String(r.headers.get('content-range')||'').match(/^bytes 0-0\/(\d+)$/);
  if(!m){
   // A partial response with hidden Content-Range cannot be resumed safely.
   // Fetch without Range so CacheStorage can stream directly to disk.
   try{await r.body?.cancel()}catch{}
   const whole=await fetch(MODEL_URL,{mode:'cors',credentials:'omit',
    redirect:'follow',cache:'no-store',signal:controller.signal});
   return await cacheWholeModel(whole);
  }
  const total=Number(m[1]);
  if(!Number.isSafeInteger(total)||total<128*1024*1024||total>1024*1024*1024)
   throw Error('Tamanho remoto do Qwen não foi validado.');
  await r.body?.cancel();
  return {total,etag:r.headers.get('etag')||''};
 }finally{controller=null}
}
async function prepareSmallFiles(){
 if(typeof caches==='undefined')return;
 const cache=await caches.open(cacheKey);
 for(const file of smallFiles){
  if(paused)return;
  const url=ORIGIN+file;
  try{
   if(await cache.match(url))continue;
   controller=new AbortController();
   const resp=await fetch(url,{mode:'cors',credentials:'omit',cache:'force-cache',
    signal:controller.signal});
   if(resp.ok&&Number(resp.headers.get('content-length')||0)<16*1024*1024){
    await cache.put(url,resp.clone());
   }
  }catch{}finally{controller=null}
  await delay(120);
 }
}
async function runInstaller(){
 if(running)return;
 running=true;paused=false;
 try{
  emit('preparing',{message:'Preparando arquivos pequenos do Qwen em segundo plano...'});
  await prepareSmallFiles();
  if(paused)return;
  // If Transformers.js has already cached a complete Q8 ONNX file, reuse it.
  try{
   const browser=await caches.open(cacheKey);
   if(await browser.match(MODEL_URL)){
    emit('complete',{message:'Qwen já encontrado no cache do navegador.',cached:true});
    return;
   }
  }catch{}
  const remote=await probeModel();
  if(remote.nativeCached)return;
  const old=await getQwenManifest();
  if(old&&(old.url!==MODEL_URL||old.totalBytes!==remote.total||
    (old.etag&&remote.etag&&old.etag!==remote.etag))){
   await clearQwenModelChunks();
  }
  const chunkCount=Math.ceil(remote.total/CHUNK_BYTES);
  await setQwenManifest({url:MODEL_URL,totalBytes:remote.total,chunkBytes:CHUNK_BYTES,
   etag:remote.etag,complete:false});
  const completed=new Set(await listQwenChunkIndexes());
  emit('progress',{downloadedChunks:completed.size,totalChunks:chunkCount,
   message:'Qwen sendo preparado no disco. Você pode continuar usando o CRM.'});
  for(let index=0;index<chunkCount;index++){
   if(paused)break;
   if(completed.has(index))continue;
   const start=index*CHUNK_BYTES,end=Math.min(remote.total-1,start+CHUNK_BYTES-1);
   const {bytes,total}=await fetchRange(start,end);
   if(total!==remote.total)throw Error('Versão do modelo alterada durante a transferência.');
   await saveQwenChunk(index,bytes);
   completed.add(index);
   emit('progress',{downloadedChunks:completed.size,totalChunks:chunkCount,
    progress:Math.round(100*completed.size/chunkCount),
    message:'Preparação Qwen: '+completed.size+' de '+chunkCount+' blocos salvos no disco.'});
   // Yield between downloads to reduce contention with browser/CRM.
   await delay(350);
  }
  if(!paused&&completed.size===chunkCount){
   const status=await getQwenPreinstallStatus();
   if(status.downloadedChunks!==chunkCount)throw Error('Blocos do modelo não persistiram.');
   await setQwenManifest({url:MODEL_URL,totalBytes:remote.total,chunkBytes:CHUNK_BYTES,
    etag:remote.etag,complete:true});
   emit('complete',{downloadedChunks:chunkCount,totalChunks:chunkCount,
    message:'Qwen preparado no disco. Agora pode ser carregado sem baixar os pesos novamente.'});
  }else{
   emit('paused',{downloadedChunks:completed.size,totalChunks:chunkCount,
    message:'Preparação pausada. A transferência poderá continuar do último bloco salvo.'});
  }
 }catch(error){
  emit(paused?'paused':'error',{message:String(error?.message||error).slice(0,200)});
 }finally{running=false;controller=null}
}
self.onmessage=event=>{
 if(event.data?.type==='start'){if(!running)runInstaller()}
 if(event.data?.type==='pause'){paused=true;controller?.abort()}
};
