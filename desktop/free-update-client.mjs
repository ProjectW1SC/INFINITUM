import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,open,rename,rm,stat} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {spawn} from 'node:child_process';
import {
 LATEST_SIGNED_MANIFEST,verifyUpdateManifest,trustedHttpsUrl,pinnedKeyMatches
} from './release-trust.mjs';

const MANIFEST_LIMIT=12000;
const TIMEOUT=18000;
const REDIRECT_LIMIT=7;
const HEADERS={'User-Agent':'W1-Capital-Killa-Launcher/1.0',
 Accept:'application/octet-stream, application/json'};
export async function fetchTrustedResponse(start,fetchImpl=fetch){
 let url=start;
 for(let i=0;i<=REDIRECT_LIMIT;i++){
  if(!trustedHttpsUrl(url))throw Error('Redirecionamento fora das origens oficiais do GitHub.');
  const response=await fetchImpl(url,{method:'GET',redirect:'manual',
   headers:HEADERS,signal:AbortSignal.timeout(TIMEOUT)});
  if([301,302,303,307,308].includes(response.status)){
   const location=response.headers.get('location');
   if(!location)throw Error('Redirecionamento sem destino verificado.');
   url=new URL(location,url).href;
   continue;
  }
  if(response.status===404)return null;
  if(!response.ok)throw Error('Servidor de releases indisponível ('+response.status+').');
  return response;
 }
 throw Error('Cadeia de redirecionamentos excessiva.');
}
async function readBounded(response,maxBytes=MANIFEST_LIMIT){
 if(!response?.body)throw Error('Resposta de atualização vazia.');
 let size=0;
 const chunks=[];
 for await(const chunk of response.body){
  const part=Buffer.from(chunk);
  size+=part.length;
  if(size>maxBytes)throw Error('Manifesto de atualização muito grande.');
  chunks.push(part);
 }
 return Buffer.concat(chunks).toString('utf8');
}
async function fileHash(path){
 const sha=createHash('sha512');
 for await(const chunk of createReadStream(path))sha.update(chunk);
 return sha.digest();
}
function verifiedHash(computed,expected){
 const reference=Buffer.from(expected,'base64');
 return reference.length===64&&computed.length===64&&timingSafeEqual(reference,computed);
}
export async function downloadVerifiedInstaller({app,manifest,onProgress=()=>{},fetchImpl=fetch}){
 if(!app||!manifest?.asset?.name)throw Error('Manifesto verificado obrigatório.');
 const dir=join(app.getPath('userData'),'signed-updates');
 await mkdir(dir,{recursive:true,mode:0o700});
 const filename=manifest.asset.name;
 if(!/^INFINITUM-KillaAI-Setup-\d+\.\d+\.\d+-x64\.exe$/.test(filename))
  throw Error('Nome de instalador não autorizado.');
 const target=join(dir,filename);
 // Reuse a previous download only if the current, signed SHA512 still matches.
 try{
  const size=await stat(target);
  if(size.isFile()&&size.size===manifest.asset.size&&
   verifiedHash(await fileHash(target),manifest.asset.sha512)){
   onProgress(100);
   return target;
  }
 }catch{}
 const temp=join(dir,filename+'.partial-'+randomBytes(8).toString('hex'));
 let handle=null,count=0;
 const sha=createHash('sha512');
 try{
  const response=await fetchTrustedResponse(manifest.asset.url,fetchImpl);
  if(!response?.body)throw Error('Instalador oficial não disponível.');
  handle=await open(temp,'wx',0o600);
  for await(const chunk of response.body){
   const data=Buffer.from(chunk);
   count+=data.length;
   if(count>manifest.asset.size)throw Error('Tamanho ultrapassou o manifesto assinado.');
   sha.update(data);
   let offset=0;
   while(offset<data.length){
    const result=await handle.write(data,offset,data.length-offset);
    if(!result?.bytesWritten)throw Error('Falha na escrita de atualização.');
    offset+=result.bytesWritten;
   }
   onProgress(Math.floor(count/manifest.asset.size*100));
  }
  await handle.sync();
  await handle.close();handle=null;
  if(count!==manifest.asset.size||!verifiedHash(sha.digest(),manifest.asset.sha512))
   throw Error('Hash SHA-512 não corresponde ao manifesto da W1 Capital.');
  await rm(target,{force:true});
  await rename(temp,target);
  onProgress(100);
  return target;
 }catch(error){
  if(handle)await handle.close().catch(()=>{});
  await rm(temp,{force:true}).catch(()=>{});
  throw error;
 }
}
export async function verifyLocalInstaller(path,manifest){
 const size=await stat(path);
 if(!size.isFile()||size.size!==manifest.asset.size)
  throw Error('Arquivo de atualização foi modificado.');
 if(!verifiedHash(await fileHash(path),manifest.asset.sha512))
  throw Error('Assinatura de integridade do instalador inválida.');
 return true;
}
export async function launchVerifiedInstaller({path,manifest,spawnImpl=spawn}){
 await verifyLocalInstaller(path,manifest);
 // NSIS per-user install (/S). The app is quit only AFTER Windows launches
 // this exact EXE whose bytes were authenticated with pinned Ed25519 metadata.
 const child=spawnImpl(path,['/S'],{
  cwd:dirname(path),windowsHide:true,detached:true,
  shell:false,stdio:'ignore'
 });
 if(!child||typeof child.unref!=='function')throw Error('Não foi possível executar instalador verificado.');
 await new Promise((resolve,reject)=>{
  child.once('error',reject);
  child.once('spawn',resolve);
 });
 child.unref();
 return {started:true};
}
export function createFreeUpdater({app,publicKey,onState=()=>{},fetchImpl=fetch}){
 if(!app||!publicKey||!pinnedKeyMatches(publicKey))throw Error('Chave pública W1 Capital inválida; atualizações bloqueadas.');
 let lastManifest=null,lastPath=null,downloading=false;
 const tell=state=>onState(state);
 return Object.freeze({
  async check(){
   if(downloading)return {status:'downloading'};
   tell({phase:'checking',signed:true,downloaded:false,
    message:'Consultando as versões oficiais publicadas na main do GitHub.'});
   const response=await fetchTrustedResponse(LATEST_SIGNED_MANIFEST,fetchImpl);
   if(!response){
    lastManifest=null;lastPath=null;
    tell({phase:'ready',signed:true,downloaded:false,releaseNotes:'',
     message:'Nenhuma atualização oficial publicada. Continue com a versão instalada.'});
    return {status:'ready'};
   }
   const raw=await readBounded(response);
   let doc;
   try{doc=JSON.parse(raw)}catch{throw Error('Manifesto oficial não contém JSON válido.')}
   let manifest;
   try{manifest=verifyUpdateManifest(doc,publicKey,app.getVersion())}
   catch(error){
    if(String(error?.message||'').includes('Não há nova versão')){
     lastManifest=null;lastPath=null;
     tell({phase:'ready',signed:true,downloaded:false,releaseNotes:'',
      message:'Você já possui a versão oficial mais recente.'});
     return {status:'ready'};
    }
    throw error;
   }
   if(lastManifest?.version===manifest.version&&lastPath){
    try{
     await verifyLocalInstaller(lastPath,manifest);
     lastManifest=manifest;
     tell({phase:'downloaded',signed:true,downloaded:true,percent:100,
      updateVersion:manifest.version,releaseNotes:manifest.releaseNotes,
      message:'Atualização já baixada e verificada. Instale quando for conveniente.'});
     return {status:'downloaded',version:manifest.version,releaseNotes:manifest.releaseNotes};
    }catch{lastPath=null}
   }
   lastManifest=manifest;
   lastPath=null;
   tell({phase:'available',signed:true,downloaded:false,percent:0,
    updateVersion:manifest.version,releaseNotes:manifest.releaseNotes,
    message:'Nova versão disponível. Confira as alterações e escolha quando baixar.'});
   return {status:'available',version:manifest.version,releaseNotes:manifest.releaseNotes};
  },
  async download(){
   if(!lastManifest)throw Error('Nenhuma versão nova foi autenticada para download.');
   if(downloading)throw Error('O download da atualização já está em andamento.');
   downloading=true;
   const manifest=lastManifest;
   try{
    tell({phase:'downloading',signed:true,downloaded:false,updateVersion:manifest.version,
     releaseNotes:manifest.releaseNotes,percent:0,
     message:'Baixando em segundo plano. O INFINITUM continuará disponível.'});
    lastPath=await downloadVerifiedInstaller({app,manifest,fetchImpl,
     onProgress:percent=>tell({phase:'downloading',signed:true,downloaded:false,
      percent,updateVersion:manifest.version,releaseNotes:manifest.releaseNotes,
      message:'Baixando e verificando SHA-512 do pacote oficial.'})});
    tell({phase:'downloaded',signed:true,downloaded:true,percent:100,
     updateVersion:manifest.version,releaseNotes:manifest.releaseNotes,
     message:'Atualização baixada e verificada. A instalação aguarda sua confirmação.'});
    return {status:'downloaded',version:manifest.version,releaseNotes:manifest.releaseNotes};
   }finally{downloading=false}
  },
  async install(){
   if(!lastManifest||!lastPath)throw Error('Nenhuma atualização oficial autenticada.');
   const result=await launchVerifiedInstaller({path:lastPath,manifest:lastManifest});
   return result;
  }
 });
}
