ALTER TABLE chess_matches ADD COLUMN rules_version text NOT NULL DEFAULT 'standard-v1';
ALTER TABLE board_matches ADD COLUMN rules_version text NOT NULL DEFAULT 'wayline-v1';
UPDATE board_matches SET rules_version='draughts64-online-v1' WHERE game='checkers';
