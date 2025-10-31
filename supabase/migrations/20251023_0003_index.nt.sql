-- Non-transactional migration for concurrent index creation
CREATE INDEX CONCURRENTLY IF NOT EXISTS tasks_status_idx ON public.tasks(status);
