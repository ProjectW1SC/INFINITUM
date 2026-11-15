// Colibri Local is an original, entirely browser-side *router*, not the
// LexisPredict Colibri OpenAI-compatible server. It never downloads weights
// unless the operator opts into the existing quantized Qwen WebGPU worker.
export const COLIBRI_LOCAL_POLICY=Object.freeze({
  free:true,needsServer:false,requiresWebGpu:true,minimumMemoryGb:8,
  maxNewTokens:48,cacheRole:'weights_only',maxParallelModels:1,
  writesWhatsApp:false,sharesDataWithAIProvider:false
});
const writing=/reescrev|redig|reformul|simplifi|melhor(e|ar) (o |a )?(texto|mensagem)|linguagem simples|tom (mais )?(claro|respeitoso)|transform(e|ar) (o |a )?(texto|mensagem)/i;
export function planColibriLocal({prompt='',allowLocalModel=false,device={}}={}){
 const memory=Number(device.memoryGb);
 const compatible=device.webgpu===true && Number.isFinite(memory)&&memory>=COLIBRI_LOCAL_POLICY.minimumMemoryGb;
 const wantsModel=writing.test(String(prompt).slice(0,1500));
 return {
  engine:allowLocalModel&&compatible&&wantsModel?'qwen':'rules',
  offline:true,needsServer:false,autoSend:false,
  requiresReview:true,modelDownloadRequiresConsent:true,
  maxNewTokens:COLIBRI_LOCAL_POLICY.maxNewTokens,
  reason:!wantsModel?'deterministic_legal_check':!allowLocalModel?'model_not_authorized':!compatible?'hardware_not_safe':'local_qwen_optional'
 };
}
