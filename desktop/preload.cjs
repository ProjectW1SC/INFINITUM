const {contextBridge,ipcRenderer}=require('electron');
// Synchronous at startup: no arbitrary filesystem, commands, network access or tokens.
const publicConfig=ipcRenderer.sendSync('killa:public-config');
contextBridge.exposeInMainWorld('killaDesktopPublicConfig',
 Object.freeze(publicConfig&&typeof publicConfig==='object'?{
  supabaseUrl:publicConfig.supabaseUrl,publishableKey:publicConfig.publishableKey
 }:{}));

// Only the trusted local CRM renderer can open the dedicated ZapFast window.
contextBridge.exposeInMainWorld('killaDesktop',Object.freeze({
 openZapFast:()=>ipcRenderer.invoke('killa:open-zapfast'),
 getUpdateState:()=>ipcRenderer.invoke('killa:get-update-state'),
 downloadUpdate:options=>ipcRenderer.invoke('killa:download-update',{installAfterDownload:options?.installAfterDownload===true}),
 installUpdate:()=>ipcRenderer.invoke('killa:install-update'),
 onUpdateState:listener=>{
  if(typeof listener!=='function')return ()=>{};
  const fn=(_event,state)=>listener(state);
  ipcRenderer.on('killa:update-state',fn);
  return ()=>ipcRenderer.removeListener('killa:update-state',fn);
 }
}));
