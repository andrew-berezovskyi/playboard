# API — Playboard local beta

All browser requests use relative /api URLs. Vite proxies to the loopback API and preserves Origin. No wildcard CORS: the browser sees one origin. Mutations require exact Origin from ALLOWED_ORIGINS, Content-Type application/json, and X-Plyvra-Client: web. HttpOnly cookie is sent automatically; client code does not access it.

- GET /api/health: process liveness {status:"ok"}.
- GET /api/ready: checks the actual database; 503 DATABASE_UNAVAILABLE if unavailable.
- GET /api/games: server catalog, all three games have beta status.
- GET /api/auth/me: private UserView or user:null (expired/missing cookie). Server outage is 503, not a guest response.
- POST /api/auth/register: {email,username,password}; 201 {user,mailDelivered}, session cookie. Conflicting identity: 409 ACCOUNT_UNAVAILABLE. Failed email delivery still leaves a usable account and is explicitly reported.
- POST /api/auth/login: {email,password}; {user} and rotated session cookie. 401 INVALID_CREDENTIALS.
- POST /api/auth/logout: {}; revokes current session and clears cookie; safe to repeat.
- POST /api/auth/verify-email: {token}; consumes token and confirms email. Invalid/expired/reused: 400 INVALID_TOKEN.
- POST /api/auth/resend-verification: {}; authenticated, sends another verification link. Already verified is a no-op.
- POST /api/auth/forgot-password: {email}; always {ok:true}, independent of account existence. Transport failures are logged without recipient/token details.
- POST /api/auth/reset-password: {token,password}; consumes token, changes hash and invalidates all sessions; {ok:true}.

UserView fields: id, username, email, emailVerified, createdAt. It is never a public profile response. Password/hash/tokens never enter browser JSON responses. Verification TTL 24 hours, reset TTL 1 hour, session TTL 7 days. Auth endpoints limit ten requests per minute per connection IP; other endpoints 120/minute. Malformed inputs return 400 INVALID_INPUT. CSRF returns 403 FORBIDDEN_ORIGIN, unsupported body type 415 JSON_REQUIRED, exhausted limits 429 TOO_MANY_REQUESTS. Other failures return 503 SERVICE_UNAVAILABLE without internal exception detail.

Chess REST/Socket.IO contracts are documented in CHESS_IMPLEMENTATION.md. Socket.IO is available through WebSocket on /socket.io; Vite forwards upgrades.

## Board games

- POST /api/chess/player {}: create/resolve guest or account identity; automatic frontend bootstrap.
- POST /api/board/matches {game,mode,timeControl,side,difficulty}: create checkers/wayline private or bot match; returns {match,invite}.
- GET /api/board/matches/:id: participant-only snapshot, elapsed clock and persisted timeout.
- POST /api/board/join {invite}: join the waiting private room.
- POST /api/board/matches/:id/actions {actionId,expectedVersion,action}: UUID idempotency, CAS, authorized legal move, resign or draw offer/accept/decline. Move action is {type:"move",payload:{path:[...]}} for draughts or {type:"move",payload:{card,from,to}} for Wayline.
- POST /api/board/matches/:id/rematch {}: request/accept both-player rematch.
- POST /api/board/queue {game,timeControl,ranked}: heartbeat, match real players with block/rating filters; {waiting:true} or {match}. POST /queue/cancel {} removes queue entry. Chess queue likewise accepts ranked.
- Socket.IO board:join {matchId}, board:action {matchId,command}, board:changed {matchId}; auth, Origin and participant checks for every action. No invitation secret enters broadcast.

## Profiles and community

- GET /api/platform/profile: own profile or {profile:null,guest:true}; GET /profile/:username: public profile with privacy enforcement, no email/private settings.
- POST /api/platform/settings: displayName, bio, avatar, publicProfile, showOnline, invitations, timezone, preferences (sound, animations, board, pieces).
- POST /api/platform/password {currentPassword,newPassword}: verifies under user lock, updates hash and revokes all sessions.
- POST /api/platform/delete-account {password}: anonymizes match seats and cascades personal profile/progress/social data.
- GET /api/platform/recent: participant's recent three-game matches, including guest rooms.
- GET /api/platform/leaderboards?pool=checkers: public actual ratings and monthly XP standings; valid pools also wayline, chess:bullet/blitz/rapid.
- GET /api/platform/search?q=: public usernames, block-aware.
- GET /api/platform/friends: incoming/outgoing requests, accepted friends, consented online status and own blocks.
- POST /api/platform/friends/request {username}; /respond {username,accept}; /remove {username}.
- GET /api/platform/friends/:username/history: accepted friend's shared match results only.
- POST /api/platform/block {username,block}: block/unblock; blocking removes the friendship and related notices.
- POST /api/platform/presence {}: updates only the opted-in account; friends see fresh status for 90 seconds.
- GET /api/platform/notifications; POST /notifications/read {id}: owned notifications only.
- POST /api/platform/invite {username,game,invite}: verifies owned waiting room, block and recipient invite policy before notification.

## Learning

GET /api/learn lists 24 lessons and own completion flags; GET /learn/:id provides task state. POST /learn/:id/complete {action,daily?} verifies exact required legal action and writes progress/XP once. Guests practice with saved:false. GET /api/daily supplies the UTC day's lesson; daily completion must correspond to this lesson.

Course mode: /learn/:gameId/course is a frontend route. POST /api/learn/:id/complete optionally accepts courseActions (the prior answers). The server verifies the ordered prefix and current lesson; incorrect/skipped steps receive LESSON_WRONG. Progress/XP remain one-time per lesson. Settings preferences also include cards (minimal/diagram) and captureEffect (boolean), with defaults for older clients.
