-- Drop in reverse dependency order so FK constraints are satisfied
DROP TABLE IF EXISTS briefing_metrics;
DROP TABLE IF EXISTS briefing_points;
DROP TABLE IF EXISTS briefings;
