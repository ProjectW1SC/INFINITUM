import {app,BrowserWindow,ipcMain,dialog,shell,Menu} from 'electron';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {join} from 'node:path';
import {existsSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import {validateDesktopConfig,safeStandaloneEnvironment,isLocalAppNavigation,
 isSafeExternalNavigation,shouldRunSignedUpdater} from './runtime-policy.mjs';

const CONFIG_ENDPOINT='https://ulkuhiibeoibbzhqrfya.supabase.co/functions/v1/killa-mcp/desktop-config';
let nextProcess=null,port=0,desktopConfig=null,window=null,shuttingDown=false,localNonce='';
if(!app.requestSingleInstanceLock())app.quit();
else app.on('second-instance',()=>{if(window){window.show();window.focus()}});
app.setAppUserModelId('br.com.w1capital.infinitum.killa');

async function loadPublicConfiguration(){
 const response=await fetch(CONFIG_ENDPOINT,{
  headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000),redirect:'error',
  cache:'no-store'
 });
 if(!response.ok)throw Error('Supabase Edge não retornou configuração pública ('+response.status+').');
 const raw=await response.text();
 if(raw.length>2500)throw Error('Configuração pública excede tamanho permitido.');
 return validateDesktopConfig(JSON.parse(raw));
}
// A stable loopback origin keeps Supabase sessions and Qwen caches across restarts.
// Never silently switch ports on an existing installation.
async function stablePrivatePort(){
 const folder=app.getPath('userData');
 mkdirSync(folder,{recursive:true});
 const file=join(folder,'killa-loopback-port.json');
 let saved=null;
 try{
  const value=JSON.parse(readFileSync(file,'utf8'));
  if(Number.isInteger(value.port)&&value.port>=1024&&value.port<=65535)saved=value.port;
 }catch{}
 const chosen=await new Promise((resolve,reject)=>{
  const server=createServer();
  server.once('error',error=>reject(saved?
   Error('Porta da sessão local está em uso. Feche outro INFINITUM ou aplicativo que use essa porta.'):error));
  server.listen(saved||0,'127.0.0.1',()=>{
   const address=server.address();
   server.close(error=>error?reject(error):resolve(address.port));
  });
 });
 if(!saved)writeFileSync(file,JSON.stringify({port:chosen})+'\n',{mode:0o600,flag:'wx'});
 return chosen;
}
function serverEntrypoint(){
 const dir=app.isPackaged?join(process.resourcesPath,'app-server'):join(process.cwd(),'desktop','app-server');
 const path=join(dir,'server.js');
 if(!existsSync(path))throw Error('Servidor Next.js não encontrado no pacote. Instalação incompleta.');
 return {dir,path};
}
async function startLocalNext(){
 port=await stablePrivatePort();
 localNonce=randomBytes(24).toString('hex');
 const {dir,path}=serverEntrypoint();
 const env={...safeStandaloneEnvironment(desktopConfig,port),KILLA_LOCAL_NONCE:localNonce};
 nextProcess=spawn(process.execPath,[path],{
  cwd:dir,env,windowsHide:true,stdio:['ignore','ignore','pipe'],shell:false
 });
 let processFailed=false;
 nextProcess.once('error',()=>{processFailed=true});
 nextProcess.once('exit',()=>{processFailed=true});
 // Never forward the child's environment, JWTs, personal data or logs to a remote telemetry endpoint.
 nextProcess.stderr?.resume();
 for(let attempt=0;attempt<80;attempt++){
  if(processFailed)throw Error('O servidor local foi encerrado inesperadamente.');
  try{
   const response=await fetch('http://127.0.0.1:'+port+'/api/desktop/health',{
    signal:AbortSignal.timeout(700),redirect:'error',cache:'no-store'
   });
   if(response.ok){
    const answer=await response.json();
    if(answer?.ready===true&&answer?.nonce===localNonce)return;
    throw Error('Servidor local não corresponde ao aplicativo autenticado.');
   }
  }catch{}
  await sleep(300);
 }
 throw Error('O servidor local não ficou disponível na porta privada.');
}
async function setupSignedUpdater(){
 if(!app.isPackaged||process.platform!=='win32')return;
 const marker=join(process.resourcesPath,'signed-updates.json');
 let enabled=false;
 try{enabled=JSON.parse(readFileSync(marker,'utf8')).enabled===true}catch{}
 if(!shouldRunSignedUpdater({packaged:app.isPackaged,win32:true,signedMarker:enabled}))return;
 try{
  const updaterModule=await import('electron-updater');
  const updater=updaterModule.autoUpdater||updaterModule.default?.autoUpdater;
  if(!updater)return;
  updater.autoDownload=true;
  updater.autoInstallOnAppQuit=true;
  // Updates are only enabled for builds signed with a verified Windows
  // publisher certificate; unsigned pilot builds retain manual installs.
  await updater.checkForUpdatesAndNotify();
  // Signed releases check periodically without requiring the user to reopen the app.
  const interval=setInterval(()=>void updater.checkForUpdatesAndNotify().catch(()=>{}),
   6*60*60*1000);
  interval.unref?.();
 }catch{}
}
async function openAppWindow(){
 window=new BrowserWindow({
  width:1300,height:840,minWidth:880,minHeight:600,
  show:false,backgroundColor:'#120c15',autoHideMenuBar:true,
  title:'INFINITUM · Killa AI',
  webPreferences:{
   preload:join(app.getAppPath(),'preload.cjs'),
   contextIsolation:true,nodeIntegration:false,sandbox:true,
   webSecurity:true,webviewTag:false,allowRunningInsecureContent:false
  }
 });
 window.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
 window.webContents.setWindowOpenHandler(({url})=>{
  if(isSafeExternalNavigation(url))void shell.openExternal(url);
  return {action:'deny'};
 });
 window.webContents.on('will-navigate',(event,target)=>{
  if(isLocalAppNavigation(target,port))return;
  event.preventDefault();
  if(isSafeExternalNavigation(target))void shell.openExternal(target);
 });
 window.on('closed',()=>{window=null});
 await window.loadURL('http://127.0.0.1:'+port+'/login');
 window.show();
}
function cleanup(){
 if(shuttingDown)return;
 shuttingDown=true;
 if(nextProcess&&!nextProcess.killed){
  try{nextProcess.kill()}catch{}
 }
}
ipcMain.on('killa:public-config',event=>{
 // The exposed value is only the public Supabase URL / anon key.
 event.returnValue=desktopConfig?
  {supabaseUrl:desktopConfig.supabaseUrl,publishableKey:desktopConfig.publishableKey}:null;
});
app.on('before-quit',cleanup);
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
app.whenReady().then(async()=>{
 Menu.setApplicationMenu(null);
 try{
  desktopConfig=await loadPublicConfiguration();
  await startLocalNext();
  await openAppWindow();
  void setupSignedUpdater();
 }catch(error){
  dialog.showErrorBox('INFINITUM · inicialização segura',
   String(error?.message||'Falha ao iniciar o servidor local.').slice(0,350)+'\n\nO aplicativo não utiliza Vercel. Precisa de internet para validar login no Supabase.');
  app.quit();
 }
}).catch(()=>app.quit());
