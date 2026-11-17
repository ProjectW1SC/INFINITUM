import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('store console accepts only the explicitly mapped W1 Capital desktop identity, not every CRM admin',()=>{
 const migration=read('supabase/migrations/20261117_killa_store_external_superadmins.sql');
 assert.match(migration,/killa_store_external_superadmins/);
 assert.match(migration,/segjskjlbeydlljnefai/);
 assert.match(migration,/4581d2fe-c358-45f9-a1bd-f90f93dce0fc/);
 assert.match(migration,/1c7085b8-d15b-404b-97cf-89038ce1a428/);
 assert.match(migration,/killa_store_external_admin_access/);
 assert.match(migration,/REVOKE ALL/i);
 const edge=read('supabase/functions/killa-store-admin/index.ts');
 assert.match(edge,/AUTH_SOURCE_URL/);
 assert.match(edge,/auth\.getUser\(token\)/);
 assert.match(edge,/from\('usuarios'\)/);
 assert.match(edge,/killa_validate_current_session/);
 assert.match(edge,/killa_store_external_admin_access/);
 assert.match(edge,/storeUserId/);
 assert.match(edge,/empresa_id/);
 assert.match(edge,/d37fd4bb-1c71-4dca-b97e-292355918d39/);
});

test('the source CRM session is checked server-side and cannot self-assign store superadmin',()=>{
 const migration=read('supabase/migrations/20261117_killa_validate_current_session.sql');
 assert.match(migration,/auth\.uid\(\)/);
 assert.match(migration,/auth\.sessions/);
 assert.match(migration,/REVOKE ALL/i);
 assert.match(migration,/GRANT EXECUTE[\s\S]*authenticated/i);
 const edge=read('supabase/functions/killa-store-admin/index.ts');
 assert.match(edge,/sourceDb\.rpc\('killa_validate_current_session'/);
 assert.doesNotMatch(edge,/user_metadata.*superadmin/i);
});

test('store page displays the real authorization failure instead of collapsing every error into a false superadmin denial',()=>{
 const page=read('app/app-store/admin/page.jsx');
 assert.match(page,/reason:/);
 assert.match(page,/access\.reason/);
 assert.match(page,/needsMfa/);
});
