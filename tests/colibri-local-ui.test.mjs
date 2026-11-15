import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('INFINITUM starts Colibri Local with zero remote connection and strict user opt-in',()=>{
 const ui=read('components/openbot-workbench.jsx');
 assert.match(ui,/useState\('colibri-local'\)/);
 assert.match(ui,/planColibriLocal/);
 assert.match(ui,/value="colibri-local"/);
 assert.match(ui,/maxTokens:tokenBudget/);
 assert.match(ui,/stopBlackholeQwen/);
 assert.match(ui,/createLegalTimelineSvg/);
 assert.match(ui,/createLegalDocumentHtml/);
 assert.match(read('lib/blackhole-local-llm.mjs'),/maxTokens\s*:/);
});
