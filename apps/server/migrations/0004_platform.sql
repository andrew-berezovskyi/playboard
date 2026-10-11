CREATE TABLE user_profiles (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 display_name text NOT NULL DEFAULT '', bio text NOT NULL DEFAULT '', avatar text NOT NULL DEFAULT 'navy',
 public_profile boolean NOT NULL DEFAULT true, show_online boolean NOT NULL DEFAULT false,
 invitations text NOT NULL DEFAULT 'friends' CHECK(invitations IN ('everyone','friends','none')),
 timezone text NOT NULL DEFAULT 'Europe/Kyiv', preferences jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE ratings (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, pool text NOT NULL,
 rating double precision NOT NULL DEFAULT 1500, deviation double precision NOT NULL DEFAULT 350,
 volatility double precision NOT NULL DEFAULT 0.06, games integer NOT NULL DEFAULT 0,
 PRIMARY KEY(user_id,pool)
);
CREATE TABLE match_results (
 match_id uuid NOT NULL, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 game text NOT NULL, opponent_id uuid REFERENCES users(id) ON DELETE SET NULL,
 score double precision NOT NULL CHECK(score IN (0,0.5,1)), rated boolean NOT NULL,
 bot boolean NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(match_id,user_id)
);
CREATE INDEX results_user_idx ON match_results(user_id,created_at DESC);
CREATE TABLE rating_history (
 match_id uuid NOT NULL, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 pool text NOT NULL, before_rating double precision NOT NULL, after_rating double precision NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(match_id,user_id)
);
CREATE TABLE experience (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, source text NOT NULL, amount integer NOT NULL CHECK(amount>=0),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,source)
);
CREATE TABLE daily_activity (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, day date NOT NULL,
 PRIMARY KEY(user_id,day)
);
CREATE TABLE tutorial_progress (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, lesson text NOT NULL,
 completed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,lesson)
);
CREATE TABLE achievements (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, code text NOT NULL,
 unlocked_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,code)
);
CREATE TABLE friendships (
 sender uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, receiver uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 status text NOT NULL CHECK(status IN ('pending','accepted')), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(sender,receiver), CHECK(sender<>receiver)
);
CREATE UNIQUE INDEX friendship_pair_idx ON friendships(LEAST(sender,receiver),GREATEST(sender,receiver));
CREATE TABLE blocks (
 owner uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, target uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 PRIMARY KEY(owner,target), CHECK(owner<>target)
);
CREATE TABLE notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind text NOT NULL, sender uuid REFERENCES users(id) ON DELETE CASCADE, payload jsonb NOT NULL DEFAULT '{}',
 read boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications(user_id,created_at DESC);
ALTER TABLE chess_matches ADD COLUMN ranked boolean NOT NULL DEFAULT false;
ALTER TABLE chess_queue ADD COLUMN ranked boolean NOT NULL DEFAULT false;
CREATE TABLE board_matches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), game text NOT NULL CHECK(game IN ('checkers','wayline')),
 state jsonb NOT NULL, version integer NOT NULL DEFAULT 0, status text NOT NULL CHECK(status IN ('waiting','active','finished')),
 mode text NOT NULL CHECK(mode IN ('private','bot')), difficulty text NOT NULL, time_control text NOT NULL,
 white_ms bigint NOT NULL, black_ms bigint NOT NULL, turn_started_at timestamptz, invite_hash text UNIQUE,
 result jsonb, draw_offer text, rematch_id uuid REFERENCES board_matches(id), rematch_requested_side text,
 ranked boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX board_active_idx ON board_matches(status,turn_started_at);
CREATE TABLE board_participants (
 match_id uuid NOT NULL REFERENCES board_matches(id) ON DELETE CASCADE, side text NOT NULL CHECK(side IN ('w','b')),
 identity text NOT NULL, display_name text NOT NULL, user_id uuid REFERENCES users(id) ON DELETE SET NULL,
 PRIMARY KEY(match_id,side), UNIQUE(match_id,identity)
);
CREATE INDEX board_identity_idx ON board_participants(identity,match_id);
CREATE TABLE board_events (
 match_id uuid NOT NULL REFERENCES board_matches(id) ON DELETE CASCADE, action_id uuid NOT NULL, actor text NOT NULL,
 sequence integer NOT NULL, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(match_id,action_id), UNIQUE(match_id,sequence)
);
CREATE TABLE board_queue (
 identity text PRIMARY KEY, game text NOT NULL, display_name text NOT NULL, user_id uuid REFERENCES users(id) ON DELETE CASCADE,
 time_control text NOT NULL, ranked boolean NOT NULL DEFAULT false,
 queued_at timestamptz NOT NULL DEFAULT now(), heartbeat_at timestamptz NOT NULL DEFAULT now(), matched_id uuid REFERENCES board_matches(id)
);
