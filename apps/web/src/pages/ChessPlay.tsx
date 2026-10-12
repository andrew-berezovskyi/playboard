import { Icon } from '../components';
import { BoardCoordinates } from '../BoardCoordinates';
import { Choice } from '../ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Chess, type Square, type PieceSymbol } from 'chess.js';
import { io, type Socket } from 'socket.io-client';
import { api, ApiError } from '../api';
import { ChessPiece } from '../ChessPiece';
import { usePreferences } from '../usePreferences';
import { GameHelp } from '../GameHelp';
import { loadChess, moveAt, drawClaims } from '../../../../packages/games/chess/engine';
import type {
  ChessCommand,
  MatchView,
  MatchAck,
} from '../../../../packages/shared/src/chess-contracts';

function clock(ms: number) {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
export default function ChessPlay() {
  const { matchId } = useParams(),
    location = useLocation(),
    navigate = useNavigate(),
    { t } = useTranslation();
  const [match, setMatch] = useState<MatchView | null>(null),
    [error, setError] = useState(''),
    [connected, setConnected] = useState(false),
    [pending, setPending] = useState(false),
    [selected, setSelected] = useState<Square | null>(null),
    [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null),
    [flipped, setFlipped] = useState<boolean | null>(null),
    [review, setReview] = useState<number | null>(null),
    [now, setNow] = useState(() => Date.now()),
    [serverOffset, setServerOffset] = useState(0),
    [copied, setCopied] = useState(false),
    [confirmResign, setConfirmResign] = useState(false),
    [claimByMove, setClaimByMove] = useState(false);
  const [prefs, setPrefs] = usePreferences();
  const boardTheme = prefs.board,
    sound = prefs.sound;
  const setBoardTheme = (board: string) =>
    setPrefs((p) => ({ ...p, board: board as typeof p.board }));
  const setSound = (enabled: boolean) => setPrefs((p) => ({ ...p, sound: enabled }));
  const socket = useRef<Socket | null>(null),
    latest = useRef<MatchView | null>(null),
    boardRef = useRef<HTMLDivElement>(null),
    audio = useRef<AudioContext | null>(null);
  const invite = useMemo(() => {
    if (location.state?.invite) return String(location.state.invite);
    try {
      return sessionStorage.getItem(`invite:${matchId}`);
    } catch {
      return null;
    }
  }, [location.state, matchId]);
  const invitation = invite ? `${window.location.origin}/join/chess#${invite}` : null;
  useEffect(() => {
    if (!matchId) return;
    let active = true;
    const receive = (next: MatchView) => {
      if (!active || next.id !== matchId) return;
      if (latest.current && next.version < latest.current.version) return;
      setServerOffset(next.serverNow - Date.now());
      latest.current = next;
      setMatch(next);
    };
    async function refresh() {
      try {
        const result = await api<{ match: MatchView }>(`/chess/matches/${matchId}`);
        receive(result.match);
      } catch (e) {
        if (active) setError(e instanceof ApiError ? e.code : 'UNKNOWN');
      }
    }
    void refresh();
    const client = io({
      path: '/socket.io',
      transports: ['websocket'],
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 700,
      reconnectionDelayMax: 5000,
    });
    socket.current = client;
    const offline = () => {
      client.disconnect();
      setConnected(false);
    };
    const online = () => client.connect();
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    client.on('connect', () => {
      client.timeout(10000).emit('match:join', matchId, (timeout: Error | null, ack: MatchAck) => {
        if (!active) return;
        if (timeout) {
          setConnected(false);
          return;
        }
        if (ack.error) {
          setError(ack.error);
          setConnected(false);
        } else if (ack.match) {
          receive(ack.match);
          setConnected(true);
          setError('');
        }
      });
    });
    client.on('disconnect', () => {
      if (active) setConnected(false);
    });
    client.on('connect_error', () => {
      if (active) setConnected(false);
    });
    client.on('match:changed', () => void refresh());
    const poll = setInterval(() => void refresh(), 15000),
      ticker = setInterval(() => setNow(Date.now()), 250);
    return () => {
      active = false;
      clearInterval(poll);
      clearInterval(ticker);
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
      client.disconnect();
      socket.current = null;
      latest.current = null;
    };
  }, [matchId]);
  const previousCount = useRef(0);
  useEffect(() => {
    const count = match?.state.moves.length ?? 0;
    if (
      count > previousCount.current &&
      previousCount.current > 0 &&
      prefs.animations &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      const move = match?.state.moves.at(-1);
      if (move) {
        const from = boardRef.current?.querySelector<HTMLElement>(`[data-square="${move.from}"]`),
          to = boardRef.current?.querySelector<HTMLElement>(`[data-square="${move.to}"]`);
        const a = from?.getBoundingClientRect(),
          b = to?.getBoundingClientRect();
        if (a && b)
          to?.querySelector('svg')?.animate(
            [
              { transform: `translate(${a.x - b.x}px,${a.y - b.y}px)` },
              { transform: 'translate(0,0)' },
            ],
            { duration: 180, easing: 'ease-out' },
          );
      }
    }
    if (count > previousCount.current && sound && audio.current) {
      const ctx = audio.current,
        osc = ctx.createOscillator(),
        gain = ctx.createGain();
      osc.frequency.setValueAtTime(480, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(280, ctx.currentTime + 0.07);
      gain.gain.setValueAtTime(0.045, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    }
    previousCount.current = count;
  }, [match, sound, prefs.animations]);
  const chess = useMemo(() => (match ? loadChess(match.state) : null), [match]);
  const displayed = useMemo(
    () =>
      match ? new Chess(review === null ? match.state.fen : moveAt(match.state, review)) : null,
    [match, review],
  );
  const moves = useMemo(() => chess?.history({ verbose: true }) ?? [], [chess]);
  const choices = useMemo(
    () => (selected && displayed ? displayed.moves({ square: selected, verbose: true }) : []),
    [selected, displayed],
  );
  const isFlipped = flipped ?? match?.yourSide === 'b';
  const squares = useMemo(() => {
    const list = Array.from(
      { length: 64 },
      (_, i) => `${'abcdefgh'[i % 8]}${8 - Math.floor(i / 8)}` as Square,
    );
    return isFlipped ? list.reverse() : list;
  }, [isFlipped]);
  async function send(action: ChessCommand['action']) {
    const current = latest.current;
    if (!current || pending) return;
    setPending(true);
    setError('');
    const command: ChessCommand = {
      actionId: crypto.randomUUID(),
      expectedVersion: current.version,
      action,
    };
    try {
      let ack: MatchAck;
      if (socket.current?.connected) {
        try {
          ack = await new Promise<MatchAck>((resolve, reject) =>
            socket
              .current!.timeout(10000)
              .emit('match:action', command, (timeout: Error | null, response: MatchAck) =>
                timeout ? reject(timeout) : resolve(response),
              ),
          );
        } catch {
          ack = await api<MatchAck>(`/chess/matches/${current.id}/actions`, command);
        }
      } else ack = await api<MatchAck>(`/chess/matches/${current.id}/actions`, command);
      if (ack.error) throw new ApiError(ack.error);
      if (ack.match) {
        latest.current = ack.match;
        setServerOffset(ack.match.serverNow - now);
        setMatch(ack.match);
      }
      setSelected(null);
      setPromotion(null);
      setConfirmResign(false);
      setClaimByMove(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.code : 'NETWORK');
      try {
        const r = await api<{ match: MatchView }>(`/chess/matches/${current.id}`);
        latest.current = r.match;
        setMatch(r.match);
      } catch {
        /* preserve visible error */
      }
    } finally {
      setPending(false);
    }
  }
  function attempt(from: Square, to: Square) {
    if (
      !match ||
      !chess ||
      pending ||
      review !== null ||
      match.status !== 'active' ||
      chess.turn() !== match.yourSide
    )
      return;
    const options = chess.moves({ square: from, verbose: true }).filter((m) => m.to === to);
    if (!options.length) {
      setError('ILLEGAL_MOVE');
      return;
    }
    if (options.some((m) => m.promotion)) {
      setPromotion({ from, to });
      return;
    }
    void send(
      claimByMove ? { type: 'claim_draw', intendedMove: { from, to } } : { type: 'move', from, to },
    );
  }
  function click(square: Square) {
    if (!match || !displayed || review !== null) return;
    const piece = displayed.get(square);
    if (piece?.color === match.yourSide) {
      setSelected(selected === square ? null : square);
      setError('');
    } else if (selected) attempt(selected, square);
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('COPY_FAILED');
    }
  }
  function exportPgn() {
    if (!match || !chess) return;
    for (const [key, value] of Object.entries({
      Event: 'Plyvra casual chess',
      Site: 'Local',
      White: match.white ?? 'Guest',
      Black: match.black ?? 'Guest',
      Result: match.result
        ? match.result.winner === 'first'
          ? '1-0'
          : match.result.winner === 'second'
            ? '0-1'
            : '1/2-1/2'
        : '*',
    }))
      chess.setHeader(key, value);
    const url = URL.createObjectURL(new Blob([chess.pgn()], { type: 'application/x-chess-pgn' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `plyvra-${match.id.slice(0, 8)}.pgn`;
    link.click();
    URL.revokeObjectURL(url);
  }
  async function rematch() {
    if (!match) return;
    setPending(true);
    try {
      const next = await api<{ match: MatchView }>(`/chess/matches/${match.id}/rematch`, {});
      navigate(`/play/chess/${next.match.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.code : 'UNKNOWN');
    } finally {
      setPending(false);
    }
  }
  function name(value: string | null) {
    return value === 'Guest'
      ? t('chess.guest')
      : value === 'Bot'
        ? `${t('chess.bot')} · ${t(`chess.${match?.difficulty}`)}`
        : (value ?? t('chess.waiting'));
  }
  function player(side: 'w' | 'b') {
    if (!match || !chess) return null;
    const elapsed =
      match.status === 'active' && chess.turn() === side && match.turnStartedAt
        ? Math.max(0, now + serverOffset - match.turnStartedAt)
        : 0;
    const value = (side === 'w' ? match.whiteMs : match.blackMs) - elapsed;
    return (
      <div
        className={`player-strip ${match.status === 'active' && chess.turn() === side ? 'to-move' : ''}`}
      >
        <div className="player-avatar">
          <ChessPiece type="k" color={side} />
        </div>
        <div className="player-name">
          <strong>{name(side === 'w' ? match.white : match.black)}</strong>
          <span>
            {t(side === 'w' ? 'chess.white' : 'chess.black')} ·{' '}
            {t(match.connected[side] ? 'chess.connected' : 'chess.reconnecting')}
          </span>
        </div>
        <span className="chess-clock" aria-label={t(side === 'w' ? 'chess.white' : 'chess.black')}>
          {match.timeControl === 'none' ? '∞' : clock(value)}
        </span>
      </div>
    );
  }
  if (!match || !chess || !displayed)
    return (
      <div className="empty-page">
        {error ? (
          <>
            <p className="notice error" role="alert">
              {t(`errors.${error}`, { defaultValue: t('errors.UNKNOWN') })}
            </p>
            <Link className="button" to="/games/chess">
              {t('chess.play')}
            </Link>
          </>
        ) : (
          <p role="status">{t('chess.loading')}</p>
        )}
      </div>
    );
  const claims = drawClaims(chess),
    canPlay =
      match.status === 'active' &&
      chess.turn() === match.yourSide &&
      !pending &&
      review === null &&
      connected;
  const opponent = match.yourSide === 'w' ? 'b' : 'w',
    last = moves.at(-1);
  return (
    <>
      <header className="play-heading">
        <Link className="text-link" to="/games/chess">
          ← {t('games.chess')}
        </Link>
        <span>
          {t(match.ranked ? 'product.ranked' : 'product.casual')} ·{' '}
          {match.timeControl === 'none' ? t('chess.none') : match.timeControl}
        </span>
      </header>
      {error && (
        <div className="notice error" role="alert">
          {error === 'COPY_FAILED'
            ? t('chess.copyFailed')
            : t(`errors.${error}`, { defaultValue: t('errors.UNKNOWN') })}
        </div>
      )}
      {!connected && (
        <p className="notice" role="status">
          {t('chess.disconnected')}{' '}
          <button className="button compact" onClick={() => socket.current?.connect()}>
            {t('chess.retry')}
          </button>
        </p>
      )}
      {match.status === 'active' && connected && !match.connected[opponent] && (
        <p className="notice" role="status">
          {t('chess.opponentOffline')}
        </p>
      )}
      <div className="play-layout">
        <section className="board-column">
          {player(isFlipped ? 'w' : 'b')}
          <div className={`play-board-frame coordinate-frame theme-${boardTheme}`}>
            <BoardCoordinates flipped={isFlipped} />
            <div
              className="play-board"
              ref={boardRef}
              role="group"
              aria-label={t('chess.boardLabel')}
            >
              {squares.map((square, index) => {
                const piece = displayed.get(square),
                  legal = choices.some((m) => m.to === square),
                  isDark = ('abcdefgh'.indexOf(square[0]) + Number(square[1])) % 2 === 0,
                  inCheck =
                    displayed.isCheck() && piece?.type === 'k' && piece.color === displayed.turn();
                return (
                  <button
                    key={square}
                    data-square={square}
                    className={`board-square ${isDark ? 'dark' : 'light'} ${selected === square ? 'is-selected' : ''} ${last && (last.from === square || last.to === square) && review === null ? 'last-move' : ''} ${inCheck ? 'in-check' : ''}`}
                    aria-label={t('chess.square', {
                      square,
                      piece: piece
                        ? `${t(piece.color === 'w' ? 'chess.white' : 'chess.black')} ${t(`chess.${piece.type === 'b' ? 'bPiece' : piece.type}`)}`
                        : t('chess.empty'),
                    })}
                    aria-pressed={selected === square}
                    onClick={() => click(square)}
                    draggable={!!piece && piece.color === match.yourSide && canPlay}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', square);
                      setSelected(square);
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = e.dataTransfer.getData('text/plain');
                      if (/^[a-h][1-8]$/.test(from)) attempt(from as Square, square);
                    }}
                    onKeyDown={(e) => {
                      const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 8, ArrowUp: -8 }[
                        e.key
                      ];
                      if (delta !== undefined) {
                        e.preventDefault();
                        const next = Math.min(63, Math.max(0, index + delta));
                        boardRef.current
                          ?.querySelector<HTMLButtonElement>(`[data-square="${squares[next]}"]`)
                          ?.focus();
                      }
                    }}
                  >
                    {piece && (
                      <ChessPiece
                        type={piece.type}
                        color={piece.color}
                        outline={prefs.pieces === 'outline'}
                      />
                    )}{' '}
                    {legal && (
                      <span
                        className={`legal-indicator ${piece ? 'capture' : ''}`}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          {player(isFlipped ? 'b' : 'w')}
          <div className="board-tools">
            <button
              className="button compact"
              onClick={() => {
                setFlipped(!isFlipped);
                setSelected(null);
              }}
            >
              {t('chess.flip')}
            </button>
            <label className="sr-only" htmlFor="board-theme">
              {t('chess.theme')}
            </label>
            <Choice
              id="board-theme"
              value={boardTheme}
              onChange={(e) => setBoardTheme(e.target.value)}
            >
              <option value="classic">{t('chess.classic')}</option>
              <option value="walnut">{t('chess.walnut')}</option>
            </Choice>
            <button
              className="button compact"
              onClick={() => {
                if (!audio.current) audio.current = new AudioContext();
                void audio.current.resume();
                setSound(!sound);
              }}
            >
              <Icon name="sound" />
              {t(sound ? 'chess.sound' : 'chess.quiet')}
            </button>
          </div>
        </section>
        <aside className="match-panel">
          <div className="match-status" role="status">
            <h1>
              {match.status === 'waiting'
                ? t('chess.waiting')
                : match.result
                  ? t(
                      match.result.winner === 'first'
                        ? 'chess.win'
                        : match.result.winner === 'second'
                          ? 'chess.blackWin'
                          : 'chess.drawResult',
                    )
                  : t(chess.turn() === match.yourSide ? 'chess.yourTurn' : 'chess.opponentTurn')}
            </h1>
            {match.result ? (
              <p>{t(`chess.${match.result.reason}`)}</p>
            ) : (
              chess.isCheck() && <p>{t('chess.check')}</p>
            )}
          </div>
          {match.status === 'waiting' && (
            <div className="invite-panel">
              <h3>{t('chess.invitation')}</h3>
              {invitation ? (
                <>
                  <label className="sr-only" htmlFor="invite-link">
                    {t('chess.invitation')}
                  </label>
                  <input id="invite-link" readOnly value={invitation} />
                  <button className="button primary" onClick={() => void copy(invitation)}>
                    <Icon name="share" />
                    {t(copied ? 'chess.copied' : 'chess.copy')}
                  </button>
                </>
              ) : (
                <p>{t(match.white && match.black ? 'chess.rematchWaiting' : 'chess.inviteLost')}</p>
              )}
            </div>
          )}
          {match.drawOffer && (
            <div className="notice">
              {t(match.drawOffer === match.yourSide ? 'chess.drawOffered' : 'chess.drawReceived')}
              {match.drawOffer !== match.yourSide && (
                <div className="actions">
                  <button
                    className="button"
                    disabled={pending}
                    onClick={() => void send({ type: 'accept_draw' })}
                  >
                    {t('chess.accept')}
                  </button>
                  <button
                    className="button"
                    disabled={pending}
                    onClick={() => void send({ type: 'decline_draw' })}
                  >
                    {t('chess.decline')}
                  </button>
                </div>
              )}
            </div>
          )}
          <h3>{t('chess.history')}</h3>
          <GameHelp
            game="chess"
            training={
              match.mode === 'bot' && new URLSearchParams(location.search).get('training') === '1'
            }
            hint={
              match.status === 'active' && chess.turn() === match.yourSide
                ? chess.moves()[0]
                : undefined
            }
          />
          <div className="move-list">
            {moves.length ? (
              <ol>
                {Array.from({ length: Math.ceil(moves.length / 2) }, (_, i) => (
                  <li key={i}>
                    <span>{i + 1}.</span>
                    {moves.slice(i * 2, i * 2 + 2).map((m, j) => (
                      <button
                        disabled={match.status !== 'finished'}
                        key={j}
                        onClick={() => {
                          setReview(i * 2 + j + 1);
                          setSelected(null);
                        }}
                        className={review === i * 2 + j + 1 ? 'selected' : ''}
                      >
                        {m.san}
                      </button>
                    ))}
                  </li>
                ))}
              </ol>
            ) : (
              <p>{t('chess.noMoves')}</p>
            )}
          </div>
          {match.status === 'finished' && (
            <>
              <div className="replay-tools">
                <button
                  className="button compact"
                  aria-label={t('chess.first')}
                  onClick={() => setReview(0)}
                >
                  ⏮
                </button>
                <button
                  className="button compact"
                  aria-label={t('chess.previous')}
                  onClick={() => setReview(Math.max(0, (review ?? moves.length) - 1))}
                >
                  ←
                </button>
                <button
                  className="button compact"
                  aria-label={t('chess.next')}
                  onClick={() => setReview(Math.min(moves.length, (review ?? moves.length) + 1))}
                >
                  →
                </button>
                <button className="button compact" onClick={() => setReview(null)}>
                  {t('chess.last')}
                </button>
              </div>
              {review !== null && <p role="status">{t('chess.review', { number: review })}</p>}
              <button disabled={pending} className="button primary" onClick={() => void rematch()}>
                <Icon name="rematch" />
                {t('chess.rematch')}
              </button>
              {match.rematchId && (
                <Link className="text-link" to={`/play/chess/${match.rematchId}`}>
                  {t('chess.rematchOpen')}
                </Link>
              )}
            </>
          )}
          {match.status === 'active' && (
            <div className="match-actions">
              {match.mode === 'private' && !match.drawOffer && (
                <button
                  disabled={pending || !connected}
                  className="button"
                  onClick={() => void send({ type: 'offer_draw' })}
                >
                  {t('chess.draw')}
                </button>
              )}
              {canPlay && (claims.repetition || claims.fiftyMoves) && (
                <button className="button" onClick={() => void send({ type: 'claim_draw' })}>
                  {t('chess.claim')}
                </button>
              )}
              {canPlay && (
                <>
                  <button
                    className="button"
                    aria-pressed={claimByMove}
                    onClick={() => setClaimByMove(!claimByMove)}
                  >
                    {t('chess.claimMove')}
                  </button>
                  {claimByMove && <p role="status">{t('chess.claimInstruction')}</p>}
                </>
              )}
              {confirmResign ? (
                <>
                  <button
                    className="button danger"
                    disabled={pending}
                    onClick={() => void send({ type: 'resign' })}
                  >
                    {t('chess.confirmResign')}
                  </button>
                  <button className="button" onClick={() => setConfirmResign(false)}>
                    {t('chess.confirmCancel')}
                  </button>
                </>
              ) : (
                <button
                  className="button"
                  disabled={!connected || pending}
                  onClick={() => setConfirmResign(true)}
                >
                  {t('chess.resign')}
                </button>
              )}
            </div>
          )}
          <div className="export-tools">
            <button className="text-link" onClick={exportPgn}>
              {t('chess.export')}
            </button>
            <button className="text-link" onClick={() => void copy(displayed.fen())}>
              {t('chess.fen')}
            </button>
          </div>
        </aside>
      </div>
      {promotion && (
        <div className="modal-backdrop">
          <section
            className="promotion-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="promotion-title"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setPromotion(null);
              if (e.key === 'Tab') {
                const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>('button');
                const first = buttons[0],
                  last = buttons[buttons.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first.focus();
                }
              }
            }}
          >
            <h2 id="promotion-title">{t('chess.promotion')}</h2>
            <div>
              {(['q', 'r', 'b', 'n'] as PieceSymbol[]).map((type, i) => (
                <button
                  key={type}
                  autoFocus={i === 0}
                  disabled={pending}
                  onClick={() =>
                    void send(
                      claimByMove
                        ? {
                            type: 'claim_draw',
                            intendedMove: {
                              ...promotion,
                              promotion: type as 'q' | 'r' | 'b' | 'n',
                            },
                          }
                        : { type: 'move', ...promotion, promotion: type as 'q' | 'r' | 'b' | 'n' },
                    )
                  }
                >
                  <ChessPiece type={type} color={match.yourSide} />
                  <span>{t(`chess.${type === 'b' ? 'bPiece' : type}`)}</span>
                </button>
              ))}
            </div>
            <button className="button" onClick={() => setPromotion(null)}>
              {t('common.cancel')}
            </button>
          </section>
        </div>
      )}
    </>
  );
}
