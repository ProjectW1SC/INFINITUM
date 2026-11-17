import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('the /agentes route renders the authenticated operations dashboard',()=>{
 const page=load('app/agentes/page.jsx');
 assert.match(page,/AgentsCommandCenter/);
 assert.match(page,/SecuredWorkspace/);
});

test('the previous OpenBot chat workspace remains available at /agentes/chat',()=>{
 const page=load('app/agentes/chat/page.jsx');
 assert.match(page,/OpenBotStudio/);
 assert.match(page,/SecuredWorkspace/);
});

test('the dashboard uses the requested six agent portraits and a live-data three-column layout',()=>{
 const ui=load('components/agents-command-center.jsx');
 const css=load('components/agents-command-center.module.css');
 for(const key of ['hermes','atlas','nox','vega','lyra','oraculo-juridico']){
  assert.match(ui,new RegExp(`/agents/${key}\\.webp`));
  assert.ok(existsSync(new URL(`../public/agents/${key}.webp`,import.meta.url)));
 }
 assert.match(ui,/Equipe de OperaÃ§Ãµes/);
 assert.match(ui,/Atividade ao vivo/);
 assert.match(ui,/office_agent_runs/);
 assert.match(ui,/openbot_threads/);
 assert.match(css,/grid-template-columns/);
});

test('OpenBot supports the six named profiles and dashboard-selected conversations',()=>{
 const config=load('lib/openbot-studio-config.mjs');
 const studio=load('components/openbot-studio.jsx');
 for(const name of ['Hermes','Atlas','¶»§q«^