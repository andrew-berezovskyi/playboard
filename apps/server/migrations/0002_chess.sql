CREATE TABLE chess_matches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 state jsonb NOT NULL,
 version integer NOT NULL DEFAULT 0 CHECK(version >= 0),
 status text NOT NULL CHECK(status IN ('waiting','active','finished')),
 mode text NOT NULL CHECK(mode IN ('private','bot')),
 difficulty text NOT NULL,
 time_control text NOT NULL,
 white_ms bigint NOT NULL,
 black_ms bigint NOT NULL,
 turn_started_at timestamptz,
 invite_hash text UNIQUE,
 result jsonb,
 draw_offer text CHECK(draw_offer IN ('w','b')),
 rematch_id uuid REFERENCES chess_matches(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chess_active_idx ON chess_matches(status,turn_started_at);
CREATE TABLE chess_participants (
 match_id uuid NOT NULL REFERENCES chess_matches(id) ON DELETE CASCADE,
 side text NOT NULL CHECK(side IN ('w','b')),
 identity text NOT NULL,
 display_name text NOT NULL,
 user_id uuid REFERENCES users(id) ON DELETE SET NULL,
 PRIMARY KEY(match_id,side),
 UNIQUE(match_id,identity)
);
CREATE INDEX chess_identity_idx ON chess_participants(identity,match_id);
CREATE TABLE chess_events (
 match_id uuid NOT NULL REFERENCES chess_matches(id) ON DELETE CASCADE,
 action_id uuid NOT NULL,
 actor text NOT NULL,
 sequence integer NOT NULL,
 payload jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(match_id,action_id),
 UNIQUE(match_id,sequence)
);
CREATE TABLE chess_queue (
 identity text PRIMARY KEY,
 display_name text NOT NULL,
 user_id uuid REFERENCES users(id) ON DELETE CASCADE,
 time_control text NOT NULL,
 queued_at timestamptz NOT NULL DEFAULT now(),
 heartbeat_at timestamptz NOT NULL DEFAULT now(),
 matched_id uuid REFERENCES chess_matches(id)
);
CREATE INDEX chess_queue_wait_idx ON chess_queue(time_control,queued_at) WHERE matched_id IS NULL;
