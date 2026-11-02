-- Albatross schema (golf_backend)
-- Run with:  psql -U <user> -d golf_backend -f golf_backend/src/db/schema.sql
--        or open it in pgAdmin's Query Tool (connected to golf_backend) and press F5.
--
-- users + targets are unchanged from the original auth setup.
-- They use IF NOT EXISTS, so running this against your existing DB leaves them alone.

CREATE TABLE IF NOT EXISTS users (
  id        SERIAL PRIMARY KEY,
  username  TEXT NOT NULL UNIQUE,
  password  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS targets (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  score_goal    INTEGER,
  putt_goal     INTEGER,
  fairway_goal  INTEGER,
  green_goal    INTEGER
);

-- ---------------------------------------------------------------------------
-- CREATE TABLE IF NOT EXISTS silently skips tables that already exist, even
-- if their columns are out of date. To rebuild everything except users/targets,
-- uncomment the line below.
-- WARNING: this deletes every round you've logged.
-- DROP TABLE IF EXISTS round_holes, rounds, course_lookups, courses CASCADE;
-- ---------------------------------------------------------------------------

-- Public-facing player info. One row per user, created at registration.
-- handicap_index is a CACHE: recalculated by the backend every time a round is
-- saved, edited or deleted. Never write to it by hand.
CREATE TABLE IF NOT EXISTS profiles (
  user_id           INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name      TEXT,
  handicap_index    NUMERIC(3,1),      -- NULL until 3 eligible rounds
  rounds_counted    SMALLINT NOT NULL DEFAULT 0,
  handicap_updated  TIMESTAMPTZ
);

-- Course cache. One row per real course, filled the first time anyone looks it
-- up, so later lookups skip the ryzegolf API entirely.
-- data holds the raw ryzegolf response (scorecard, teeBoxes, ...) exactly as the
-- frontend already uses it.
CREATE TABLE IF NOT EXISTS courses (
  id             SERIAL PRIMARY KEY,
  ryze_id        TEXT UNIQUE,                 -- ryzegolf's own id for the course
  name           TEXT NOT NULL,               -- ryzegolf's name for it
  city           TEXT,
  state          TEXT,
  data           JSONB NOT NULL,
  match_quality  TEXT NOT NULL DEFAULT 'exact'
                 CHECK (match_quality IN ('exact', 'loose', 'closest')),  -- review 'closest' by hand
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT now()  -- refresh when ~6-12 months old
);

-- One row per OpenStreetMap course the search bar has sent to the lookup route.
-- osm_id is the "id" from public/courses-search.json, e.g. 'way/29357224'.
-- Several OSM entries can point at the same course.
-- course_id NULL = ryzegolf had no match; the route retries after ~a week.
CREATE TABLE IF NOT EXISTS course_lookups (
  osm_id        TEXT PRIMARY KEY,
  osm_name      TEXT NOT NULL,                -- the name users see and rounds are saved with
  course_id     INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  looked_up_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rounds (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id           INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  course_name         TEXT NOT NULL,           -- the OSM name the user picked
  tee_name            TEXT,
  course_rating       NUMERIC(4,1),            -- snapshot of the tee's rating on the day
  slope_rating        SMALLINT CHECK (slope_rating BETWEEN 55 AND 155),
  course_par          SMALLINT,
  holes_played        SMALLINT NOT NULL DEFAULT 18 CHECK (holes_played IN (9, 18)),
  date_played         DATE NOT NULL,
  total_score         SMALLINT NOT NULL,
  total_putts         SMALLINT,
  fairways_hit        SMALLINT,
  fairways_possible   SMALLINT,
  greens_in_reg       SMALLINT,
  penalties           SMALLINT,
  score_differential  NUMERIC(4,1),            -- NULL if no rating/slope or 9 holes
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rounds_user_date_idx ON rounds (user_id, date_played DESC);

-- Only filled for hole-by-hole rounds. Quick-log rounds have totals only.
CREATE TABLE IF NOT EXISTS round_holes (
  round_id     INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  hole_number  SMALLINT NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  par          SMALLINT NOT NULL CHECK (par BETWEEN 3 AND 6),
  strokes      SMALLINT NOT NULL CHECK (strokes BETWEEN 1 AND 20),
  putts        SMALLINT CHECK (putts BETWEEN 0 AND 10),
  fairway_hit  BOOLEAN,                        -- NULL on par 3s or when not tracked
  gir          BOOLEAN,
  penalties    SMALLINT,
  PRIMARY KEY (round_id, hole_number)
);

-- Give any existing users a profile row (safe to re-run).
INSERT INTO profiles (user_id)
SELECT id FROM users
ON CONFLICT (user_id) DO NOTHING;
