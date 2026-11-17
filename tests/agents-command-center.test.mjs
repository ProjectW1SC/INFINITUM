import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('agentes route uses authenticated dashboard',()=>{const p=load('app/agentes/page.jsx');assert.match(p,/AgentsCommandCenter/);assert.match(p,/SecuredWorkspace/);});
test('OpenBot chat stays available',()=>{const p=load('app/agentes/chat/page.jsx');assert.match(p,/OpenBotStudio/);assert.match(p,/SecuredWorkspace/);});
test('dashboard uses six portrait assets and real activity tables',()=>{const u=load('components/agents-command-center.jsx');const c=load('components/agents-command-center.module.css');for(const k of ['hermes','atlas','nox','vega','lyra','oraculo-juridico']){assert.ok(u.includes('/agents/'+k+'.webp'));assert.ok(existsSync(new URL('../public/agents/'+k+'.webp',import.meta.url)));}assert.match(u,/office_agent_runs/);assert.match(u,/openbot_threads/);assert.match(c,/grid-template-columns/);});
test('six named profiles are defined in the dashboard',()=>{const u=load('components/agents-command-center.jsx');for(const n of ['Hermes','Atlas','Nox','Vega','Lyra','Oráculo Jurídico'])assert.ok(u.includes(n));});
