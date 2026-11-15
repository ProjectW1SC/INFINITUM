// Lightweight Qwen runtime planning. CPU/WebAssembly works without a server,
// although this does not make CPU inference fast or low-memory by itself.
export const LOCAL_QWEN_RUNTIME=Object.freeze({
 model:'onnx-community/Qwen2.5-0.5B-Instruct',quantization:'q4',
 defaultTokens:384,maxTokens:2048,dailyTokenLimit:null,dailyRequestLimit:null,minKnownCpuMemoryGb:4,concurrentModels:1,
 externalInference:false
});
export function normalizeLocalTokenBudget(input){
 const n=Number(input);
 return Number.isFinite(n)?Math.max(32,Math.min(LOCAL_QWEN_RUNTIME.maxTokens,Math.round(n))):LOCAL_QWEN_RUNTIME.defaultTokens;
}
export function selectLocalQwenBackend({webgpu=false,memoryGb=0,preferCpu=false}={}){
 const known=Number(memoryGb),gpu=webgpu===true&&!preferCpu;
 // A missing hardware report is not a low-memory report.
 if(known>0&&known<4&&!gpu)return {
  ok:false,device:'none',reason:'O navegador informa menos de 4 GB de memória. Este modelo pode travar a CPU; mantenha o motor leve ou utilize um aparelho com mais RAM.'
 };
 return {ok:true,device:gpu?'webgpu':'wasm',reason:gpu?
  'Qwen executado na GPU do navegador.':'Qwen executado na CPU via WebAssembly; pode ser lento em PCs fracos.'};
}
