import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../desktop/launcher-ui.js',import.meta.url),'utf8');

class Element {
 constructor(id){
  this.id=id;this.handlers={};this.style={};this.textContent='';this.className='';
  this.hidden=false;this.disabled=false;this.checked=false;
 }
 addEventListener(type,handler){this.handlers[type]=handler}
 async click(){return this.handlers.click?.()}
 async change(){return this.handlers.change?.()}
}

function createLauncherHarness(initial={}){
 const ids=['installed-version','state-title','state-message','state-light','progress-block',
  'progress-fill','progress-text','release-notes','release-notes-title','release-version','release-notes-text',
  'download-now','download-background','install-update','launch','check','releases',
  'admin-diagnostics','store','zapfast','auto-updates'];
 const elements=new Map(ids.map(id=>[id,new Element(id)]));
 const state={phase:'ready',version:'0.1.2',signed:false,autoCheck:true,
  message:'Aplicativo pronto.',...initial};
 const calls=[];
 const bridge={
  onState(listener){this.listener=listener},
  getState:async()=>state,
  check:async()=>state,
  download:async options=>{calls.push(options);return state},
  launch:async()=>state,
  install:async()=>state,
  releases:async()=>state,
  openAdmin:async()=>state,
  openStore:async()=>state,
  openZapFast:async()=>({opened:true}),
  setAutoUpdate:async()=>state
 };
 vm.runInNewContext(source,{
  document:{getElementById:id=>elements.get(id)},
  window:{killaLauncher:bridge}
 });
 return {elements,state,bridge,calls};
}

test('opening ZapFast does not replace the launcher snapshot with {opened:true}',async()=>{
 const {elements}=createLauncherHarness();
 await new Promise(resolve=>setImmediate(resolve));
 const installed=elements.get('installed-version');
 const title=elements.get('state-title');
 const message=elements.get('state-message');
 assert.equal(installed.textContent,'Versão instalada: 0.1.2');
 assert.equal(title.textContent,'Aplicativo atualizado');

 await elements.get('zapfast').click();

 assert.equal(installed.textContent,'Versão instalada: 0.1.2');
 assert.equal(title.textContent,'Aplicativo atualizado');
 assert.equal(message.textContent,'Aplicativo pronto.');
});

test('launcher shows signed release notes and keeps download choice with the operator',async()=>{
 const {elements,calls}=createLauncherHarness({
  phase:'available',signed:true,updateVersion:'0.2.1',
  releaseNotes:'- Correção de acesso à loja\n- Atualizador GitHub sem Vercel'
 });
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(elements.get('release-notes').hidden,false);
 assert.equal(elements.get('release-version').textContent,'v0.2.1');
 assert.match(elements.get('release-notes-text').textContent,/Atualizador GitHub/);
 assert.equal(elements.get('download-now').hidden,false);
 assert.equal(elements.get('download-background').hidden,false);
 await elements.get('download-background').click();
 assert.deepEqual(calls,[{installAfterDownload:false}]);
});
