-- Create the briefings table to store analyst briefing reports
CREATE TABLE IF NOT EXISTS briefings (
  id              SERIAL PRIMARY KEY,
  company_name    VARCHAR(200) NOT NULL,
  ticker          VARCHAR(10)  NOT NULL,             -- always stored uppercase
  sector          VARCHAR(100),
  analyst_name    VARCHAR(120),
  summary         TEXT         NOT NULL,
  recommendation  TEXT         NOT NULL,
  generated_at    TIMESTAMPTZ,                       -- NULL until report is generated
  html_content    TEXT,                              -- rendered HTML stored after generation
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Store key points and risks as typed rows, ordered by display_order within each type
CREATE TABLE IF NOT EXISTS briefing_points (
  id            SERIAL PRIMARY KEY,
  briefing_id   INTEGER      NOT NULL REFERENCES briefings(id) ON DELETE CASCADE,
  type          VARCHAR(20)  NOT NULL CHECK (type IN ('key_point', 'risk')),
  content       TEXT         NOT NULL,
  display_order INTEGER      NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_briefing_points_briefing_id ON briefing_points(briefing_id);

-- Optional metrics per briefing; name must be unique within a briefing (enforced at DB level)
CREATE TABLE IF NOT EXISTS briefing_metrics (
  id           SERIAL PRIMARY KEY,
  briefing_id  INTEGER      NOT NULL REFERENCES briefings(id) ON DELETE CASCADE,
  name         VARCHAR(120) NOT NULL,
  value        VARCHAR(120) NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (briefing_id, name)
);

CREATE INDEX idx_briefing_metrics_briefing_id ON briefing_metrics(briefing_id);
