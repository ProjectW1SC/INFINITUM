import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDesktopConfig,safeStandaloneEnvironment,isLocalAppNavigation,shouldRunSignedUpdater} from '../desktop/runtime-policy.mjs';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const config={supabaseUrl:'https://ulkuhiibeoibbzhqrfya.supabase.co',
  publishableKey:'sb_publishable_sample-not-a-real-token',bridgeOrigin:'https://lexispredict-wa-auto.onrender.com'};
test('desktop accepts only a pinned Supabase project and public key',()=>{
 assert.equal(validateDesktopConfig(config).supabaseUrl,config.supabaseUrl);
 assert.throws(()=>validateDesktopConfig({...config,supabaseUrl:'https://attacker.invalid'}),/Supabase/i);
 assert.throws(()=>validateDesktopConfig({...config,publishableKey:'sb_secret_anything'}),/pública|publishable|public/i);
 assert.throws(()=>validateDesktopConfig({...config,bridgeOrigin:'http://localhost:3000'}),/WA.Auto|HTTPS/i);
});
test('local Next process never inherits a service role or other private env keys',()=>{
 const env=safeStandaloneEnvironment(config,54193,{
  PATH:'C:\\Windows\\System32',SystemRoot:'C:\\Windows',
  SUPABASE_SERVICE_ROLE_KEY:'super-privileged',
  WA_AUTO_SECRET:'secret',OPENAI_API_KEY:'private'
 });
 assert.equal(env.ELECTRON_RUN_AS_NODE,'1');
 assert.equal(env.HOSTNAME,'127.0.0.1');
 assert.equal(env.PORT,'54193');
 assert.equal(env.WA_AUTO_URL,config.bridgeOrigin);
 assert.equal(env.SUPABASE_SERVICE_ROLE_KEY,undefined);
 assert.equal(env.OPENAI_API_KEY,undefined);
 assert.equal(env.WA_AUTO_SECRET,undefined);
 assert.throws(()=>safeStandaloneEnvironment(config,80,{}),/porta|port/i);
});
test('renderer may navigate only to its own random loopback origin',()=>{
 assert.equal(isLocalAppNavigation('http://127.0.0.1:54193/agentes',54193),true);
 assert.equal(isLocalAppNavigation('https://agentinfinitum.vercel.app/agentes',54193),false);
 assert.equal(isLocalAppNavigation('http://localhost:54193/agentes',54193),false);
 assert.equal(isLocalAppNavigation('file:///C:/Windows/system.ini',54193),false);
 assert.equal(isLocalAppNavigation('http://127.0.0.1:54194/agentes',54193),false);
});
test('automatic installer updates are disabled unless signing is verified',()=>{
 assert.equal(shouldRunSignedUpdater({packaged:true,win32:true,signedMarker:false}),false);
 assert.equal(shouldRunSignedUpdater({packaged:false,win32:true,signedMarker:true}),false);
 assert.equal(shouldRunSignedUpdater({packaged:true,win32:true,signedMarker:true}),true);
});
test('Next standalone desktop build and user-scoped Supabase Realtime are wired',()=>{
 const next=read('next.config.mjs');
 assert.match(next,/KILLA_DESKTOP_STANDALONE/);
 assert.match(next,/output:'standalone'/);
 const stage=read('desktop/stage-standalone.mjs');
 assert.match(stage,/standalone/);
 assert.match(stage,/static/);
 const main=read('desktop/main.mjs');
 assert.ok(main.includes('contextIsolation:true'));
 assert.ok(main.includes('nodeIntegration:false'));
 assert.ok(main.includes('sandbox:true'));
 assert.match(main,/safeStandaloneEnvironment/);
 const realtime=read('lib/killa-realtime.mjs');
 assert.match(realtime,/postgres_changes/);
 assert.match(realtime,/owner_id=eq/);
 assert.match(realtime,/unsubscribe|removeChannel/);
 const ui=read('components/workspace-session-provider.jsx');
 assert.match(ui,/subscribeKillaRealtime/);
});
test('EXE release is built on Windows and supports audited GitHub updates',()=>{
 const ci=read('.github/workflows/killa-desktop-windows.yml');
 assert.match(ci,/windows-latest/);
 assert.match(ci,/npm run build/);
 assert.match(ci,/upload-artifact/);
 const pkg=read('desktop/package.json');
 assert.match(pkg,/electron-builder/);
 assert.match(pkg,/nsis/);
});
