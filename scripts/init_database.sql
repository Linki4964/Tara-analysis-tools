CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_name text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'draft',
    document_filename text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS step_results (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    step_number int NOT NULL,
    step_name text NOT NULL DEFAULT '',
    result_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (run_id, step_number)
);

CREATE INDEX IF NOT EXISTS idx_runs_created_at
    ON runs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_runs_project_name
    ON runs (project_name);

CREATE INDEX IF NOT EXISTS idx_step_results_run_id
    ON step_results (run_id);

CREATE OR REPLACE FUNCTION set_runs_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_runs_updated_at ON runs;

CREATE TRIGGER trg_runs_updated_at
BEFORE UPDATE ON runs
FOR EACH ROW
EXECUTE FUNCTION set_runs_updated_at();
