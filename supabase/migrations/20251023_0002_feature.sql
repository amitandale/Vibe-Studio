-- Additional feature table
CREATE TABLE IF NOT EXISTS public.tasks (
  id bigserial PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  inserted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tasks_profile_id_idx ON public.tasks(profile_id);

REVOKE ALL ON TABLE public.tasks FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tasks TO authenticated;
