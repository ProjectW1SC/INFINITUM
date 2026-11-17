import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {OPENBOT_CONNECTORS,GOOGLE_OAUTH_SCOPES,authorizationUrl} from '../lib/openbot-connectors.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Google Workspace catalog exposes Drive, Sheets, Gmail, Calendar, Meet, Chat and YouTube as OAuth services',()=>{
 const ids=['drive','sheets','gmail','calendar','meet','chat','youtube'];
 for(const id of ids){
  const c=OPENBOT_CONNECTORS.find(x=>x.id===id);
  assert.ok(c,'missing '+id);
  assert.equal(c.provider,'google');
  assert.equal(c.mode,'oauth');
  assert.equal(c.category,'Google Workspace');
 }
});
test('Google OAuth requests the minimal read-only scopes for every supported service',()=>{
 const required=[
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/meetings.space.readonly',
  'https://www.googleapis.com/auth/chat.spaces.readonly',
  'https://www.googleapis.com/auth/chat.messages.readonly',
  'https://www.googleapis.com/auth/youtube.readonly'
 ];
 for(const scope of required)assert.ok(GOOGLE_OAUTH_SCOPES.includes(scope),'missing '+scope);
 const url=new URL(authorizationUrl('google',{
  clientId:'test.apps.googleusercontent.com',
  redirectUri:'https://agentinfinitum.vercel.app/api/openbot/integrations/oauth/callback',
  state:'sealed',challenge:'pkce'
 }));
 const requested=url.searchParams.get('scope').split(' ');
 for(const scope of required)assert.ok(requested.includes(scope));
 assert.doesNotMatch(requested.join(' '),/(?:gmail\.send|calendar\.events(?:\s|$)|chat\.messages(?:\s|$)|youtube\.upload|drive\.file)/);
});
test('Google service reader exposes real read-only Gmail messages, Calendar events, Meet spaces, Chat spaces/messages and YouTube uploads',()=>{
 const route=read('app/api/openbot/integrations/data/route.js');
 for(const service of ['calendar','meet','chat','chat_messages','youtube'])
  assert.ok(route.includes("service==='"+service+"'"),'missing service '+service);
 assert.match(route,/gmail\.googleapis\.com\/gmail\/v1\/users\/me\/messages/);
 assert.match(route,/calendar\.googleapis\.com\/calendar\/v3\/calendars\/primary\/events/);
 assert.match(route,/meet\.googleapis\.com\/v2\/spaces/);
 assert.match(route,/chat\.googleapis\.com\/v1\/spaces/);
 assert.match(route,/youtube\/v3\/channels/);
 assert.match(route,/youtube\/v3\/playlistItems/);
 assert.match(route,/space_id/);
 assert.match(route,/format:'metadata'/);
 assert.doesNotMatch(route,/gmail\.send|messages\.send|videos\.insert|events\.insert/);
});
test('Connected-app interface lets the user open Google Chat messages after listing spaces',()=>{
 const ui=read('components/openbot-connected-apps.jsx');
 assert.match(ui,/previewChatMessages/);
 assert.match(ui,/Ler mensagens/);
 assert.match(ui,/SERVICE_LABELS/);
});
