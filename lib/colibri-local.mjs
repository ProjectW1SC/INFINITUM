// Colibri Local is an original, entirely browser-side *router*, not the
// LexisPredict Colibri OpenAI-compatible server. It never downloads weights
// unless the operator opts into the existing quantized Qwen WebGPU worker.
export const COLIBRI_LOCAL_POLICY=Object.freeze({
  free:true,needsServer:false,requiresWebGpu:true,minimumMemoryGb:8,
  maxNewTokens:48,cacheRole:'weights_only',maxParallelModels:1,
  writesWhatsApp:false,sharesDataWithAIProvider:false
});
export function planColibriLocal({prompt='',allowLocalModel=false,device={}}={}){
 const memory=Number(device.memoryGb);
 const compatible=device.webgpu===true && Number.isFinite(memory)&&memory>=COLIBRI_LOCAL_POLICY.minimumMemoryGb;
 // Prefer Qwen as reviewer for ANY type of task, even deterministic facts.
 // A user must authorize on-device inference; weak devices stay on rules.
 return {
  engine:allowLocalModel&&compatible?'qwen':'rules',
  offline:true,needsServer:false,autoSend:false,
  requiresReview:true,modelDownloadRequiresConsent:true,
  maxNewTokens:COLIBRI_LOCAL_POLICY.maxNewTokens,
  reason:!allowLocalModel?'model_not_authorized':!compatible?'hardware_not_safe':'qwen_review_preferred'
 };
}
