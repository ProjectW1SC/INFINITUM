import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('the packaged desktop loads public Supabase config locally and has no Vercel startup dependency',()=>{
 const main=read('desktop/main.mjs');
 assert.doesNotMatch(main,/CONFIG_ENDPOINT|agentinfinitum\.vercel\.app\/api\/openbot\/desktop-config/);
 assert.match(main,/public-config\.json/);
 const pkg=JSON.parse(read('desktop/package.json'));
 assert.ok(pkg.build.files.includes('public-config.json'));
 const config=JSON.parse(read('desktop/public-config.json'));
 assert.equal(config.supabaseUrl,'https://segjskjlbeydlljnefai.supabase.co');
 assert.equal(config.bridgeOrigin,'https://lexispredict-wa-auto.onrender.com');
});

test('the signed update check only announces an update; downloading is an explicit operator action',async()=>{
 const client=read('desktop/free-update-client.mjs');
 assert.match(client,/async download\(\)/);
 const check=client.slice(client.indexOf('async check(){'),client.indexOf('async download(){'));
 assert.doesNotMatch(check,/downloadVerifiedInstaller/);
 assert.match(client,/releaseNotes/);
 const main=read('desktop/main.mjs');
 assert.match(main,/launcher:download-update/);
 assert.match(main,/killa:download-update/);
 assert.match(main,/30\s*\*\s*60\s*\*\s*1000/);
 assert.match(main,/killa:update-state/);
});

test('signed release notes are authenticated and rendered as plain text in launcher and CRM toast',()=>{
 const trust=read('desktop/release-trust.mjs');
 assert.match(trust,/releaseNotes/);
 const policy=read('desktop/launcher-policy.mjs');
 assert.match(policy,/releaseNotes/);
 const sign=read('desktop/sign-free-release.mjs');
 assert.match(sign,/release-notes\.md/);
 assert.match(read('desktop/launcher.html'),/release-notes/);
 assert.match(read('desktop/launcher-ui.js'),/releaseNotes/);
 assert.match(read('app/layout.jsx'),/DesktopUpdateToast/);
 assert.match(read('components/desktop-update-toast.jsx'),/textContent|releaseNotes/);
});

test('every main push starts a protected Windows release on GitHub without a Vercel build',()=>{
 const workflow=read('.github/workflows/killa-desktop-auto-release.yml');
 assert.match(workflow,/push:/);
 assert.match(workflow,/branches:\s*\[?['"]?main/);
 assert.match(workflow,/desktop-production/);
 assert.match(workflow,/prepare-free-release\.mjs/);
 assert.match(workflow,/sign-free-release\.mjs/);
 assert.match(workflow,/gh release create/);
 assert.match(workflow,/release-notes\.md/);
 assert.doesNotMatch(workflow,/vercel\s+(deploy|build)/i);
});
