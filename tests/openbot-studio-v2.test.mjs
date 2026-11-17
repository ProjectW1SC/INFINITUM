import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('OpenBot has a proper standalone chat workspace, not the CRM card dashboard',()=>{
 const page=load('app/agentes/chat/page.jsx');
 const studio=load('components/openbot-studio.jsx');
 assert.match(page,/OpenBotStudio|OpenBotPage/);
 assert.match(studio,/Conversa|conversa/);
 assert.match(studio,/Nova conversa/);
 assert.match(studio,/Motor/);
 assert.match(studio,/HistÃ³rico|HistÃ³rico de/);
 assert.match(studio,/AprovaÃ§|RevisÃ£o/);
 assert.match(studio,/Computador|Ferramentas/);
 assert.doesNotMatch(studio,/enviar WhatsApp automaticamente/i);
});
test('OpenBot reads bots and message histories from per-user Supabase tables',()=>{
 const studio=load('components/openbot-studio.jsx');
 assert.match(studio,/from\('openbot_threads'\)/);
 assert.match(studio,/from\('openbot_messages'\)/);
 assert.match(studio,/const owner=session\?\.user\?\.id/);
 assert.match(studio,/eq\('owner_id',owner\)/);
 assert.match(studio,/\/api\/superagente/);
 assert.match(studio,/externalAiConsent:true/);
 assert.match(studio,/isGenerativeModel/);
});
test('Model list comes from authenticated server configuration, not invented availability',()=>{
 const api=load('app/api/openbot/models/route.js');
 assert.match(api,/officeAuth/);
 assert.match(api,/configuredLexisMotors/);
 assert.doesNotMatch(api,/secret_key|API_KE¶»§q«^