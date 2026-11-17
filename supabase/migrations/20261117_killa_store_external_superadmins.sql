-- Explicit SSO alias for the W1 Capital owner account used by the desktop CRM.
-- This does NOT grant store access to every CRM administrator. The source
-- account must also pass Supabase Auth, its own usuarios RLS row, W1 company
-- scope, AAL2 for sensitive actions, and a live-session check.
CREATE TABLE IF NOT EXISTS killa_private.killa_store_external_superadmins (
 source_project_ref text NOT NULL CHECK (source_project_ref='segjskjlbeydlljnefai'),
 source_user_id uuid NOT NULL,
 store_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(source_project_ref,source_user_id)
);
ALTER TABLE killa_private.killa_store_external_superadmins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON killa_private.killa_store_external_superadmins FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA killa_private TO service_role;
GRANT SELECT,INSERT,UPDATE ON killa_private.killa_store_external_superadmins TO service_role;

CREATE OR REPLACE FUNCTION public.killa_store_external_admin_access(
 p_source_project_ref text,p_source_user_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare a record;
begin
 select x.store_user_id,s.store_mcp_enabled,s.diagnostics_enabled
 into a
 from killa_private.killa_store_external_superadmins x
 join killa_private.killa_store_superadmins s
   on s.user_id=x.store_user_id and s.enabled is true
 join public.crm_memberships m
   on m.user_id=s.user_id and m.role='admin' and m.enabled is true
 where x.source_project_ref=p_source_project_ref
   and x.source_user_id=p_source_user_id and x.enabled is true;
 if not found then return jsonb_build_object('allowed',false); end if;
 return jsonb_build_object(
  'allowed',true,'storeUserId',a.store_user_id,
  'storeMcpEnabled',a.store_mcp_enabled,
  'diagnosticsEnabled',a.diagnostics_enabled
 );
end $function$;

REVOKE ALL ON FUNCTION public.killa_store_external_admin_access(text,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.killa_store_external_admin_access(text,uuid)
 TO service_role;

-- One exact identity mapping: Davi's W1 Capital CRM account -> the existing
-- canonical store superadmin record. No role or membership is broadened.
INSERT INTO killa_private.killa_store_external_superadmins
 (source_project_ref,source_user_id,store_user_id,enabled)
VALUES
 ('segjskjlbeydlljnefai','4581d2fe-c358-45f9-a1bd-f90f93dce0fc',
  '1c7085b8-d15b-404b-97cf-89038ce1a428',true)
ON CONFLICT(source_project_ref,source_user_id) DO UPDATE
 SET store_user_id=EXCLUDED.store_user_id,enabled=true;
