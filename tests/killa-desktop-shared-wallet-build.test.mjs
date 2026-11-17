import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Windows standalone build compiles the shared Lexis wallet flag into the client bundle',()=>{
 const workflow=read('.github/workflows/killa-desktop-windows.yml');
 const build=workflow.match(/- name: Build completo standalone sem Vercel\n([\s\S]*?)(?=\n      - name:|$)/)?.[1]||'';
 assert.match(build,/NEXT_PUBLIC_LEXIS_SHARED_DB:\s*['"]?1/);
});
