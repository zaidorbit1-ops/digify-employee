CREATE TYPE public.task_status AS ENUM ('todo', 'in_progress', 'approved', 'done');
CREATE TYPE public.task_priority AS ENUM ('low', 'medium', 'high', 'urgent');

CREATE TABLE IF NOT EXISTS public.task_projects (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tasks (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  project_id BIGINT REFERENCES public.task_projects(id) ON DELETE SET NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT,
  status public.task_status NOT NULL DEFAULT 'todo',
  priority public.task_priority NOT NULL DEFAULT 'medium',
  creator_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assignee_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  start_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  reminder_at TIMESTAMPTZ,
  order_index INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.task_activity (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  task_id BIGINT NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action VARCHAR(80) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.task_comments (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  task_id BIGINT NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_owner_status
  ON public.tasks (creator_user_id, status, archived_at, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status
  ON public.tasks (assignee_user_id, status, archived_at, due_at);

CREATE INDEX IF NOT EXISTS idx_task_activity_task_created
  ON public.task_activity (task_id, created_at DESC);

ALTER TABLE public.task_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_projects_owner_access ON public.task_projects;
CREATE POLICY task_projects_owner_access
  ON public.task_projects
  FOR ALL
  TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS tasks_owner_or_assignee_access ON public.tasks;
CREATE POLICY tasks_owner_or_assignee_access
  ON public.tasks
  FOR ALL
  TO authenticated
  USING (
    creator_user_id = auth.uid()
    OR assignee_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.task_projects tp
      WHERE tp.id = tasks.project_id
        AND tp.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    creator_user_id = auth.uid()
    OR assignee_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.task_projects tp
      WHERE tp.id = tasks.project_id
        AND tp.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS task_activity_access ON public.task_activity;
CREATE POLICY task_activity_access
  ON public.task_activity
  FOR ALL
  TO authenticated
  USING (
    actor_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.tasks t
      WHERE t.id = task_activity.task_id
        AND (t.creator_user_id = auth.uid() OR t.assignee_user_id = auth.uid())
    )
  )
  WITH CHECK (
    actor_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.tasks t
      WHERE t.id = task_activity.task_id
        AND (t.creator_user_id = auth.uid() OR t.assignee_user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS task_comments_access ON public.task_comments;
CREATE POLICY task_comments_access
  ON public.task_comments
  FOR ALL
  TO authenticated
  USING (
    author_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.tasks t
      WHERE t.id = task_comments.task_id
        AND (t.creator_user_id = auth.uid() OR t.assignee_user_id = auth.uid())
    )
  )
  WITH CHECK (
    author_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.tasks t
      WHERE t.id = task_comments.task_id
        AND (t.creator_user_id = auth.uid() OR t.assignee_user_id = auth.uid())
    )
  );
