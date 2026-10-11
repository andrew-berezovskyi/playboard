ALTER TABLE chess_matches ADD COLUMN rematch_requested_side text CHECK(rematch_requested_side IN ('w','b'));
