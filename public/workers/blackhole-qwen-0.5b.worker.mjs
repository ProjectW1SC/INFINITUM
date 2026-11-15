/* Qwen2.5 0.5B (q4) in a dedicated Web Worker. Browser inference only.
 * GPU is optional; when unavailable we use ONNX WebAssembly on one CPU
 * thread. This is NOT JustVugg Colibri's native disk/RAM weight streaming.
 */
const MODEL='onnx-community/Qwen2.5-0.5B-Instruct';
let generator=null,deviceUsed=null,loading=null,running=false;
const emit=(requestId,status,extra={})=>self.postMessage({requestId,status,...extra});
async function loadLibrary(requestId){
 emit(requestId,'loading',{message:'Iniciando Transformers.js local...'});
 try{return await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1')}
 catch(e){throw Error('Carregador Transformers.js inacessível. Verifique a rede ou CSP: '+String(e?.message||e).slice(0,120))}
}
async function initialize(requestId,device='wasm',allowCpuFallback=true){
 if(generator&&deviceUsed===device)return generator;
 if(generator&&deviceUsed!==device){
  try{await generator.dispose?.()}catch{}
  generator=null;deviceUsed=null;
 }
 if(loading)return loading;
 loading=(async()=>{
  emit(requestId,'loading',{message:'Carregando Qwen 0,5B quantizado (q4) em '+(device==='wasm'?'CPU/WebAssembly':'WebGPU')+'...'});
  const memory=Number(self.navigator?.deviceMemory||0);
  if(device==='wasm'&&memory>0&&memory<4)throw Error('Pouca RAM disponível para carregar o modelo em CPU. Use o modo determinístico.');
  const lib=await loadLibrary(requestId);
  // CacheStorage belongs to the stable INFINITUM origin, not the login session.
  // Keep the library's historical cache key to reuse weights downloaded before
  // this release. WASM binary caching avoids extra startup downloads.
  lib.env.useBrowserCache=true;
  lib.env.useWasmCache=true;
  lib.env.cacheKey='transformers-cache';
  if(lib.env?.backends?.onnx?.wasm){
   lib.env.backends.onnx.wasm.numThreads=1;
  }
  let lastProgress=0,lastPercent=-1;
  const progress_callback=p=>{
   if(p?.status==='progress'){
    const percent=Math.max(0,Math.min(100,Math.round(p.progress||0)));
    const now=Date.now();
    if(percent===100||now-lastProgress>=600&&percent!==lastPercent){
     lastProgress=now;lastPercent=percent;
     emit(requestId,'progress',{progress:percent,file:String(p.file||'').slice(0,200)});
    }
   }else if(p?.status==='initiate')emit(requestId,'loading',{
    message:'Abrindo o modelo do cache local ou baixando apenas os arquivos que estiverem faltando...'
   });
  };
  const chooseDtype=async chosen=>{
   if(chosen!=='wasm')return 'q4';
   // On this model the CPU q8 ONNX file is approximately 512MB versus
   // approximately 786MB for q4. Reuse any previously cached q4 weights
   // instead of downloading a different quantization.
   try{
    const cached=await caches.open('transformers-cache');
    const keys=(await cached.keys()).map(x=>x.url);
    if(keys.some(x=>x.includes('/onnx/model_quantized.onnx')))return 'q8';
    if(keys.some(x=>x.includes('/onnx/model_q4.onnx')))return 'q4';
   }catch{}
   return 'q8';
  };
  const create=async chosen=>{
   const dtype=await chooseDtype(chosen);
   emit(requestId,'loading',{message:chosen==='wasm'?
    'Qwen CPU: carregando a versão quantizada mais leve disponível no cache ('+dtype+').':
    'Qwen GPU: carregando pesos quantizados do cache.'});
   const model=await lib.pipeline('text-generation',MODEL,{dtype,device:chosen,progress_callback});
   generator=model;deviceUsed=chosen;
   return model;
  };
  try{return await create(device)}
  catch(error){
   if(device==='webgpu'&&allowCpuFallback&&!(memory>0&&memory<4)){
    emit(requestId,'loading',{message:'GPU não inicializou. Tentando CPU/WebAssembly sem perder o rascunho...'});
    try{return await create('wasm')}
    catch(cpuError){throw Error('Qwen não inicializou na CPU: '+String(cpuError?.message||cpuError).slice(0,140));}
   }
   throw Error('Qwen não inicializou em '+device+': '+String(error?.message||error).slice(0,140));
  }
 })();
 try{return await loading}finally{loading=null}
}
self.onmessage=async event=>{
 const {requestId,prompt,history,maxTokens,device,allowCpuFallback}=event.data||{};
 if(!Number.isSafeInteger(requestId)||requestId<1||typeof prompt!=='string')return;
 if(running){emit(requestId,'error',{error:'Há outra geração de IA local em andamento.'});return;}
 running=true;
 try{
  const backend=device==='webgpu'?'webgpu':'wasm';
  const model=await initialize(requestId,backend,allowCpuFallback===true);
  emit(requestId,'generating',{message:'Gerando texto com Qwen no próprio navegador...',device:deviceUsed});
  const recent=Array.isArray(history)?history
   .filter(x=>x?.role==='user'||x?.role==='assistant').slice(-4)
   .map(x=>({role:x.role,content:String(x.content||'').slice(0,550)})):[];
  const messages=[
   {role:'system',content:'Você redige minutas e explica textos em português brasileiro. Nunca invente sentenças, datas, valores, provas, citações, leis ou jurisprudência. Não afirme consultar tribunais. Em peças jurídicas use apenas fatos fornecidos. Toda minuta exige revisão profissional.'},
   ...recent,
   {role:'user',content:prompt.slice(0,6000)}
  ];
  const generated=await model(messages,{
   max_new_tokens:Math.max(32,Math.min(2048,Math.round(Number(maxTokens)||384))),
   do_sample:false,return_full_text:false
  });
  const raw=generated?.[0]?.generated_text;
  const text=(typeof raw==='string'?raw:Array.isArray(raw)?String(raw.at(-1)?.content||''):'')
   .replace(/<\|im_end\|>|<\|eot_id\|>/g,'').trim();
  if(!text)throw Error('Modelo não produziu resposta.');
  emit(requestId,'complete',{text,model:MODEL,device:deviceUsed});
 }catch(error){emit(requestId,'error',{error:String(error?.message||error).slice(0,300)})}
 finally{running=false}
};
