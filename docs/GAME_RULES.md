# Implemented game rules

Every action is checked by a transport-independent server-authoritative engine. Snapshot replay and tamper rejection are tested.

## Chess

chess.js provides king safety, checkmate, stalemate, castling, en passant and four promotion choices. Threefold repetition and fifty moves need a claim (also with an intended move); fivefold repetition and seventy-five moves terminate automatically with checkmate precedence. Agreement, resignation and clocks are supported. FEN, PGN and replay derive from legal saved moves.

Rare blocked dead positions and side-specific mating possibility at timeout remain an adjudication gap; do not claim complete FIDE certification. See CHESS_IMPLEMENTATION.md. Stockfish is not integrated.

Primary reference: [FIDE Laws](https://handbook.fide.com/chapter/E012023).

## Draughts-64 — draughts64-online-v1

8×8, twelve men each on dark squares, white first. Men move one diagonal step forward and capture in all four directions. Kings fly diagonally and may land on any clear square beyond a captured enemy. Capture is mandatory. The full series is required; there is no majority-capture priority. A man reaching the back rank mid-capture becomes a king immediately and continues as one. Captured pieces remain blockers until the complete series ends and cannot be captured twice.

No pieces or no legal moves loses. Three identical board/turn positions draw. Fifteen moves by each side with kings only and no capture draw. With kings on both sides and unchanged material, four/five pieces draw after thirty moves each, six/seven after sixty. Strong-side counters: three or more kings versus a lone king get fifteen moves; up to two pieces including a king versus a lone king get five; three pieces including a king versus a lone king on the long diagonal get five. Applicable counters reset on capture/promotion or changed endgame class.

The online variant uses these counters for every time control. IDF's immediate small-material draw for finite controls without increment, with an exception for an evident win, is not yet implemented. Do not advertise exact IDF tournament compliance until that adapter is independently tested.

Primary sources: [IDF official rules, section 7](https://idf64.org/wp-content/uploads/2016/09/Official-Rules-of-the-game.pdf), [rapid/blitz rules](https://idf64.org/wp-content/uploads/2016/09/Rules-of-the-Rapid-and-Blitz-games.pdf). Opening ballot tables are not draw adjudication rules.

## Wayline — wayline-v1

Original 5×5 tactical variant. Each player starts with a navigator in the central back-rank square and four scouts. Five distinct cards are selected from ten original patterns: two per player and one open. White starts. Card vectors face forward relative to their owner; black rotates them 180 degrees. Choose one card, move a friendly piece to a listed destination and exchange that card with the open card. Jumps are legal. Friendly destinations are illegal; enemy destinations capture.

Win by capturing the enemy navigator or visiting both relay squares with your navigator in order: white b3 then d3, black d3 then b3. Progress is retained when leaving the first relay. If neither card offers any legal move, pass and exchange one card. Voluntary passes are illegal. Two forced passes, a third repetition of the full position (board, turn, hands, open card, relay) or 200 half-moves draw. Clocks, resignation and agreed draws apply separately.

Names, patterns and figures are original code assets. No Onitama publisher artwork, trademark or rulebook text is shipped. This does not assert comprehensive IP clearance or mature competitive balance; long-term playtesting remains open.

Chess update: side-specific material checks apply to timeout and resignation. A proof for permanently locked pawn-only barriers supplements standard insufficient material: no pawn can move/capture, and even over-approximated king mobility cannot capture a pawn. Other arbitrary dead positions remain outside this proof.
