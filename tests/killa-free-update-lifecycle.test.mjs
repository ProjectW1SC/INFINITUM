import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('a downloaded Ed25519 update never installs or restarts without operator confirmation',()=>{
 const main=read('desktop/main.mjs');
 assert.match(main,/window-all-closed/);
 assert.match(main,/Never install or restart automatically when the operator closes the CRM/);
 assert.doesNotMatch(main,/applyVerifiedUpdate\(\)\.finally\(\(\)=>app\.quit\(\)\)/);
 assert.match(main,/dialog\.showMessageBox/);
 assert.match(main,/launcher:install-update/);
 assert.match(main,/killa:install-update/);
 const free=read('desktop/free-update-client.mjs');
 assert.match(free,/child\.once\('spawn',resolve\)/);
 assert.match(free,/child\.once\('error',reject\)/);
});
