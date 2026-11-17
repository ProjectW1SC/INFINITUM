'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import {Bot,Plus,PanelLeftClose,PanelLeftOpen,PanelRightClose,PanelRightOpen,MessageSquare,Search,Send,
 ShieldCheck,SlidersHorizontal,Activity,Clock3,Plug,Monitor,ArrowLeft,Trash2,CheckCircle2,AlertTriangle,
 ExternalLink,LoaderCircle,FileText,RefreshCw,Copy,RotateCcw} from 'lucide-react';
import {OPENBOT_BOTS,OPENBOT_CAPABILITIES,OPENBOT_APPROVAL,findOpenBot,chatTitle,
 historyForRequest,prepareBotRequest} from '../lib/openbot-studio-config.mjs';
import {ZAPFAST_SINGLE_SESSION_URL} from '../lib/openbot-workspace-policy.mjs';
import styles from './openbot-studio.module.css';
import OpenBotConnectedApps from './openbot-connected-apps.jsx';

const starterModels=[{id:'rules',label:'Rascunho rÃ¡pido (sem IA generativa)',mode:'rules'}];
const timeLabel=value=>{
 const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
};
const dateLabel=value=>{
 const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'});
};
const safeError=e=>String(e?.message||e||'OperaÃ§Ã£o nÃ£o concluÃ­da').slice(0,260);
const validTitle=t=>chatTitle(t).slice(0,120);
const openbotLabel=id=>OPENBOT_BOTS.find(b=>b.key===id)?.name||'Killa';

export default function OpenBotStudio({db,session}){
 const owner=session?.user?.id;
 const [models,setModels]=useState(starterModels);¶»§q«^