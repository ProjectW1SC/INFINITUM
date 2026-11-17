'use strict';
const ids={installed:document.getElementById('installed-version'),title:document.getElementById('state-title'),
 message:document.getElementById('state-message'),light:document.getElementById('state-light'),
 bar:document.getElementById('progress-block'),fill:document.getElementById('progress-fill'),
 progress:document.getElementById('progress-text'),notes:document.getElementById('release-notes'),
 notesTitle:document.getElementById('release-notes-title'),notesVersion:document.getElementById('release-version'),
 notesText:document.getElementById('release-notes-text'),
 downloadNow:document.getElementById('download-now'),downloadBackground:document.getElementById('download-background'),
 install:document.getElementById('install-update'),launch:document.getElementById('launch'),
 check:document.getElementById('check'),releases:document.getElementById('releases'),
 admin:document.getElementById('admin-diagnostics'),store:document.getElementById('store'),
 zapfast:document.getElementById('zapfast'),auto:document.getElementById('auto-updates')};
const TITLES={loading:'Iniciando launcher',checking:'Verificando atualizações no GitHub',
 ready:'Aplicativo atualizado',available:'Nova versão disponível',
 downloading:'Download em segundo plano',downloaded:'Atualização pronta para instalar',
 installing:'Instalando e reiniciando',opening:'Iniciando o INFINITUM',
 unsigned:'Canal seguro indisponível',offline:'Sem conexão para atualizar',
 error:'Não foi possível verificar a atualização'};
function render(value){
 if(!value||typeof value!=='object')return;
 const phase=String(value.phase||'error'),percent=Number(value.percent)||0;
 ids.installed.textContent='Versão instalada: '+String(value.version||'0.0.0');
 if(ids.auto)ids.auto.checked=value.autoCheck!==false;
 ids.title.textContent=TITLES[phase]||TITLES.error;
 ids.message.textContent=String(value.message||'');
 ids.light.className='state-indicator'+(['ready','downloaded'].includes(phase)?' ok':phase==='error'?' fail':'');
 ids.bar.hidden=phase!=='downloading';
 ids.fill.style.width=Math.max(0,Math.min(100,percent))+'%';
 ids.progress.textContent=Math.floor(Math.max(0,Math.min(100,percent)))+'%';
 const hasUpdate=['available','downloading','downloaded'].includes(phase);
 ids.notes.hidden=!hasUpdate;
 ids.notesTitle.textContent=phase==='downloaded'?'Atualização verificada':('O que mudou na versão');
 ids.notesVersion.textContent=value.updateVersion?'v'+value.updateVersion:'';
 ids.notesText.textContent=String(value.releaseNotes||'As alterações desta versão serão exibidas aqui.');
 ids.downloadNow.hidden=phase!=='available';
 ids.downloadBackground.hidden=phase!=='available';
 ids.install.hidden=phase!=='downloaded'||value.signed!==true||value.downloaded!==true;
 ids.install.disabled=phase==='installing';
 ids.launch.disabled=['installing','opening'].includes(phase);
 ids.check.disabled=['checking','downloading','installing','opening'].includes(phase)||value.signed!==true;
}
function connect(id,api,{renderResult=true}={}){
 ids[id].addEventListener('click',async()=>{
  ids[id].disabled=true;
  try{const result=await api();if(renderResult&&result&&typeof result==='object')render(result)}
  catch{ids.message.textContent='Operação não concluída. Confira a conexão e tente novamente.'}
  finally{ids[id].disabled=false}
 });
}
const bridge=window.killaLauncher;
if(bridge){
 bridge.onState(render);
 bridge.getState().then(render).catch(()=>{ids.title.textContent='Falha ao inicializar'});
 connect('check',bridge.check);
 connect('downloadNow',()=>bridge.download({installAfterDownload:true}));
 connect('downloadBackground',()=>bridge.download({installAfterDownload:false}));
 connect('launch',bridge.launch);
 connect('install',bridge.install);
 connect('releases',bridge.releases);
 connect('admin',bridge.openAdmin);
 connect('store',bridge.openStore);
 connect('zapfast',bridge.openZapFast,{renderResult:false});
 if(ids.auto)ids.auto.addEventListener('change',()=>bridge.setAutoUpdate(ids.auto.checked).then(render).catch(()=>{ids.auto.checked=!ids.auto.checked}));
}else{ids.message.textContent='Instalação inválida: ponte segura indisponível.'}
