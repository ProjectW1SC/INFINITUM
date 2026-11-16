const {contextBridge,ipcRenderer}=require('electron');
const invoke=channel=>ipcRenderer.invoke(channel);
contextBridge.exposeInMainWorld('killaLauncher',Object.freeze({
 getState:()=>invoke('launcher:get-state'),
 check:()=>invoke('launcher:check-update'),
 launch:()=>invoke('launcher:launch'),
 install:()=>invoke('launcher:install-update'),
 releases:()=>invoke('launcher:open-downloads'),
 onState:listener=>{
  if(typeof listener!=='function')return ()=>{};
  const fn=(_event,state)=>listener(state);
  ipcRenderer.on('launcher:state',fn);
  return ()=>ipcRenderer.removeListener('launcher:state',fn);
 }
}));
