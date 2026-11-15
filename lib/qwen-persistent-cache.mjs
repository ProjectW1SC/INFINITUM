// Stable origin-local browser cache. Reuse Transformers.js DEFAULT cache key
// to preserve older Qwen model files after updates. Cache persists across F5,
// logouts and restarts unless browser/site-data settings evict or clear it.
export const MODEL_CACHE_KEY='transformers-cache';
export const MODEL_ID='onnx-community/Qwen2.5-0.5B-Instruct';
const bytes=x=>Number.isFinite(Number(x))?Math.max(0,Math.round(Number(x))):null;
const storageDefault=()=>typeof navigator==='undefined'?null:navigator.storage||null;
const cachesDefault=()=>typeof caches==='undefined'?null:caches;
export async function inspectQwenModelCache({storage=storageDefault(),cacheStorage=cachesDefault()}={}){
 let persisted=false,quotaBytes=null,usageBytes=null,cachedFiles=0;
 if(storage){
  try{persisted=typeof storage.persisted==='function'&&await storage.persisted()===true;}catch{}
  try{const estimate=await storage.estimate?.();quotaBytes=bytes(estimate?.quota);usageBytes=bytes(estimate?.usage);}catch{}
 }
 if(cacheStorage){
  try{
   if(await cacheStorage.has(MODEL_CACHE_KEY)){
    const cache=await cacheStorage.open(MODEL_CACHE_KEY);
    const keys=await cache.keys();
    cachedFiles=keys.filter(k=>String(k.url||'').includes('Qwen2.5-0.5B-Instruct')).length;
   }
  }catch{}
 }
 return {supported:!!storage&&!!cacheStorage,persisted,cacheKey:MODEL_CACHE_KEY,
  cachedFiles,complete:false,quotaBytes,usageBytes,
  note:cachedFiles>0?'Arquivos do Qwen encontrados no disco. Não é possível garantir que todos os pesos estejam completos até carregar o modelo.':
   'Nenhum arquivo do Qwen identificado neste domínio. O primeiro uso poderá baixar os pesos.'};
}
export async function requestPersistentQwenCache({storage=storageDefault()}={}){
 if(!storage)return {supported:false,persisted:false,reason:'storage_api_unavailable'};
 let persisted=false;
 try{persisted=typeof storage.persisted==='function'&&await storage.persisted()===true;}catch{}
 if(!persisted&&typeof storage.persist==='function'){
  try{persisted=await storage.persist()===true;}catch{}
 }
 let quotaBytes=null,usageBytes=null;
 try{
  const estimate=await storage.estimate?.();
  quotaBytes=bytes(estimate?.quota);usageBytes=bytes(estimate?.usage);
 }catch{}
 return {supported:true,persisted,quotaBytes,usageBytes,
  reason:persisted?'persistent_storage_granted':'browser_may_evict',
  note:persisted
   ?'Cache do Qwen com armazenamento persistente autorizado pelo navegador.'
   :'Cache do Qwen ativado. O navegador pode remover dados sob pressão de espaço ou ao limpar dados do site.'};
}
