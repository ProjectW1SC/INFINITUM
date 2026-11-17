'use client';
import {useEffect,useState} from 'react';
import styles from './desktop-update-toast.module.css';

export default function DesktopUpdateToast(){
 const [state,setState]=useState(null);
 const [dismissedVersion,setDismissedVersion]=useState('');
 const [busy,setBusy]=useState(false);
 useEffect(()=>{
  const bridge=typeof window!=='undefined'?window.killaDesktop:null;
  if(!bridge?.getUpdateState)return undefined;
  let live=true;
  bridge.getUpdateState().then(value=>{if(live)setState(value)}).catch(()=>{});
  const unsubscribe=bridge.onUpdateState(value=>{if(live)setState(value)});
  return()=>{live=false;unsubscribe?.()};
 },[]);
 if(!state)return null;
 const phase=state.phase;
 const version=String(state.updateVersion||'');
 if(!version||!['available','downloading','downloaded'].includes(phase))return null;
 if(dismissedVersion===version&&phase!=='downloaded')return null;
 const notes=String(state.releaseNotes||'').trim();
 const percent=Math.max(0,Math.min(100,Number(state.percent)||0));
 async function download(installAfterDownload){
  setBusy(true);
  try{await window.killaDesktop.downloadUpdate({installAfterDownload})}
  catch{}
  finally{setBusy(false)}
 }
 async function install(){
  setBusy(true);
  try{await window.killaDesktop.installUpdate()}
  catch{}
  finally{setBusy(false)}
 }
 return <aside className={styles.notice} role="status" aria-live="polite">
  <div className={styles.topline}>
   <span className={styles.eyebrow}>W1 CAPITAL · ATUALIZAÇÃO OFICIAL</span>
   <button className={styles.dismiss} type="button" aria-label="Ocultar aviso"
    onClick={()=>setDismissedVersion(version)}>×</button>
  </div>
  <div className={styles.heading}>
   <span className={styles.icon} aria-hidden="true">↻</span>
   <div>
    <h2>{phase==='downloaded'?'Atualização pronta':phase==='downloading'?'Baixando em segundo plano':'Nova versão do INFINITUM disponível'}</h2>
    <p>Versão {version} · assinatura W1 verificada</p>
   </div>
  </div>
  {notes&&<div className={styles.notes}>
   <strong>O que foi atualizado</strong>
   <pre>{notes}</pre>
  </div>}
  {phase==='downloading'&&<div className={styles.progressArea}>
   <div className={styles.progressTrack}><span style={{width:percent+'%'}}/></div>
   <div className={styles.progressLabel}><span>Download em andamento</span><strong>{percent}%</strong></div>
   <p>Você pode continuar trabalhando. O INFINITUM não será fechado durante o download.</p>
  </div>}
  {phase==='downloaded'&&<p className={styles.readyText}>O pacote foi baixado e conferido. A instalação só começa quando você confirmar; o programa será reiniciado.</p>}
  {phase==='available'&&<p className={styles.readyText}>Escolha quando baixar. A instalação nunca interrompe seu trabalho sem confirmação.</p>}
  <div className={styles.actions}>
   {phase==='available'&&<>
    <button type="button" className={styles.primary} disabled={busy} onClick={()=>download(true)}>
     {busy?'Preparando...':'Atualizar agora'}
    </button>
    <button type="button" className={styles.secondary} disabled={busy} onClick={()=>download(false)}>
     Baixar em segundo plano
    </button>
   </>}
   {phase==='downloading'&&<button type="button" className={styles.secondary} onClick={()=>setDismissedVersion(version)}>Continuar trabalhando</button>}
   {phase==='downloaded'&&<>
    <button type="button" className={styles.primary} disabled={busy} onClick={install}>
     {busy?'Aguardando...':'Instalar e reiniciar'}
    </button>
    <button type="button" className={styles.secondary} onClick={()=>setDismissedVersion(version)}>Depois</button>
   </>}
  </div>
 </aside>;
}
