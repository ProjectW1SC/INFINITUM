'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {Activity,AlertTriangle,ArrowRight,Bell,BriefcaseBusiness,CalendarDays,CheckCircle2,ChevronDown,Clock3,Copy,FileText,Filter,Gavel,Grid2X2,Headset,Home,Layers,Link2,List,MessageSquare,MoreHorizontal,Plus,RefreshCw,Search,Settings,ShieldCheck,Sparkles,Users,Workflow,Zap,BarChart3,Plug,Star,X,Play,Scale} from 'lucide-react';
import {OPENBOT_BOTS} from '../lib/openbot-studio-config.mjs';
import styles from './agents-command-center.module.css';

const AGENTS=[
 {id:'hermes',botKey:'killa',name:'Hermes',role:'Comercial · Coordenação e produtividade',area:'Operações',avatar:'/agents/hermes.webp',description:'Organiza solicitações, resume informações e prepara rascunhos para revisão.',skills:['Conversas','Resumos','Rascunhos']},
 {id:'atlas',botKey:'atlas',name:'Atlas',role:'Pesquisa · Evidências e comparações',area:'Operações',avatar:'/agents/atlas.webp',description:'Estrutura pesquisas, compara informações e organiza evidências sem inventar fontes.',skills:['Pesquisa','Comparações','Evidências']},
 {id:'nox',botKey:'nox',name:'Nox',role:'Inteligência · Análise e risco',area:'Inteligência',avatar:'/agents/nox.webp',description:'Ajuda a identificar padrões, riscos e prioridades a partir dos dados fornecidos.',skills:['Análise','Riscos','Prioridades']},
 {id:'vega',botKey:'scout',name:'Vega',role:'Comercial · Prospecção e conversão',area:'Com���q�^