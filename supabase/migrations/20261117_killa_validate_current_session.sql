-- Safe session liveness check for a first-party desktop token in this project.
-- auth.uid() binds the check to the caller; no caller can inspect another user.
CREATE OR REPLACE FUNCTION public.killa_validate_current_session(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
 SELECT EXISTS(
  SELECT 1 FROM auth.sessions s
  WHERE s.user_id=auth.uid()
    AND s.id=p_session_id
    AND (s.not_after IS NULL OR s.not_after>now())
 )
$$;
REVOKE ALL ON FUNCTION public.killa_validate_current_session(uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.killa_validate_current_session(uuid)
 TO authenticated;
