import { Icon } from '../components';
import { BoardCoordinates } from '../BoardCoordinates';
import { Choice } from '../ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { io, type Socket } from 'socket.io-client';
import { api, ApiError } from '../api';
import { BoardPiece } from '../BoardPiece';
import { usePreferences } from '../usePreferences';
import { GameHelp } from '../GameHelp';
import { boardActions } from '../../../../packages/games/board-engine';
import {
  createCheckers,
  applyCheckers,
  type CheckersState,
} from '../../../../packages/games/checkers/engine';
import {
  createWayline,
  applyWayline,
  waylineCards,
  type WaylineState,
} from '../../../../packages/games/wayline/engine';
import type { BoardView, BoardCommand } from '../../../../packages/shared/src/board-contracts';
const clock = (ms: number) => {
  const n = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
};
const coordinate = (i: number, size: number) =>
  `${'abcdefgh'[i % size]}${size - Math.floor(i / size)}`;
export default function BoardPlay() {
  const { matchId, gameId } = useParams(),
    { t, i18n } = useTranslation(),
    navigate = useNavigate(),
    location = useLocation();
  const [match, setMatch] = useState<BoardView | null>(null),
    [error, setError] = useState(''),
    [connected, setConnected] = useState(false),
    [pending, setPending] = useState(false),
    [path, setPath] = useState<number[]>([]),
    [card, setCard] = useState(''),
    [flip, setFlip] = useState<boolean | null>(null),
    [review, setReview] = useState<number | null>(null),
    [now, setNow] = useState(() => Date.now()),
    [offset, setOffset] = useState(0),
    [confirm, setConfirm] = useState(false),
    [copied, setCopied] = useState(false);
  const [prefs, setPrefs] = usePreferences();
  const [captured, setCaptured] = useState<{ square: number; piece: number }[]>([]);
  const previousBoard = useRef<number[] | null>(null);
  useEffect(() => {
    if (!match) return;
    const old = previousBoard.current;
    previousBoard.current = match.state.board;
    const removed =
      old && match.status !== 'waiting' && prefs.animations && prefs.captureEffect
        ? old.flatMap((piece, square) =>
            piece && !match.state.board[square] && (piece > 0 ? 'w' : 'b') === match.state.turn
              ? [{ square, piece }]
              : [],
          )
        : [];
    setCaptured(removed);
    const timer = setTimeout(() => setCaptured([]), 280);
    return () => clearTimeout(timer);
  }, [match, prefs.animations, prefs.captureEffect]);
  const latest = useRef<BoardView | null>(null),
    socket = useRef<Socket | null>(null),
    boardRef = useRef<HTMLDivElement>(null),
    previous = useRef(0),
    audio = useRef<AudioContext | null>(null);
  const invite = useMemo(() => {
    try {
      return location.state?.invite ?? sessionStorage.getItem(`invite:${matchId}`);
    } catch {
      return null;
    }
  }, [location.state, matchId]);
  useEffect(() => {
    if (!matchId) return;
    let active = true;
    const receive = (m: BoardView) => {
      if (!active || m.id !== matchId || (latest.current && latest.current.version > m.version))
        return;
      latest.current = m;
      setMatch(m);
      setOffset(m.serverNow - Date.now());
    };
    const refresh = async () => {
      try {
        const r = await api<{ match: BoardView }>(`/board/matches/${matchId}`);
        receive(r.match);
      } catch (e) {
        if (active) setError(e instanceof ApiError ? e.code : 'UNKNOWN');
      }
    };
    void refresh();
    const client = io({ path: '/socket.io', transports: ['websocket'], withCredentials: true });
    socket.current = client;
    client.on('connect', () => {
      client
        .timeout(10000)
        .emit(
          'board:join',
          matchId,
          (timeout: Error | null, ack: { match?: BoardView; error?: string }) => {
            if (!active) return;
            if (timeout || ack.error) {
              setConnected(false);
              setError(ack.error ?? 'NETWORK');
            } else if (ack.match) {
              receive(ack.match);
              setConnected(true);
              setError('');
            }
          },
        );
    });
    client.on('disconnect', () => {
      if (active) setConnected(false);
    });
    client.on('board:changed', () => void refresh());
    const offline = () => {
        client.disconnect();
        setConnected(false);
      },
      online = () => client.connect();
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    const ticker = setInterval(() => setNow(Date.now()), 250),
      poll = setInterval(() => void refresh(), 15000);
    return () => {
      active = false;
      clearInterval(ticker);
      clearInterval(poll);
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
      client.disconnect();
      latest.current = null;
    };
  }, [matchId]);
  useEffect(() => {
    if (!match) return;
    const count = match.state.history.length;
    if (count > previous.current) {
      if (prefs.animations && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const action = match.state.history.at(-1)!;
        const from = 'path' in action ? action.path[0] : action.from,
          to = 'path' in action ? action.path.at(-1) : action.to;
        if (from !== null && to !== null && to !== undefined) {
          const source = boardRef.current
              ?.querySelector<HTMLElement>(`[data-square="${from}"]`)
              ?.getBoundingClientRect(),
            target = boardRef.current?.querySelector<HTMLElement>(`[data-square="${to}"]`),
            box = target?.getBoundingClientRect();
          if (source && box)
            target
              ?.querySelector('svg')
              ?.animate(
                [
                  { transform: `translate(${source.x - box.x}px,${source.y - box.y}px)` },
                  { transform: 'translate(0,0)' },
                ],
                { duration: 180, easing: 'ease-out' },
              );
        }
      }
      if (prefs.sound) {
        audio.current ??= new AudioContext();
        const ctx = audio.current,
          o = ctx.createOscillator(),
          g = ctx.createGain();
        o.frequency.value = 380;
        g.gain.setValueAtTime(0.035, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
        o.connect(g);
        g.connect(ctx.destination);
        o.start();
        o.stop(ctx.currentTime + 0.1);
      }
    }
    previous.current = count;
  }, [match, prefs.animations, prefs.sound]);
  const displayed = useMemo(() => {
    if (!match) return null;
    if (review === null) return match.state;
    if (match.game === 'checkers') {
      const s = match.state as CheckersState;
      return s.history
        .slice(0, review)
        .reduce(applyCheckers, createCheckers(s.initialBoard, s.initialTurn));
    }
    const s = match.state as WaylineState;
    return s.history.slice(0, review).reduce(applyWayline, createWayline(s.setup));
  }, [match, review]);
  const legal = useMemo(
    () => (match && match.status === 'active' ? boardActions(match.game, match.state) : []),
    [match],
  );
  const candidates = legal.filter((a) =>
    'path' in a
      ? a.path.slice(0, path.length).every((v, i) => v === path[i])
      : a.card === (card || (match?.state as WaylineState)?.hands?.[match?.yourSide ?? 'w']?.[0]) &&
        a.from === path[0],
  );
  const targets = candidates
    .map((a) => ('path' in a ? a.path[path.length] : a.to))
    .filter((n): n is number => n !== null && n !== undefined);
  async function send(action: BoardCommand['action']) {
    const current = latest.current;
    if (!current || pending) return;
    setPending(true);
    setError('');
    try {
      const command = { actionId: crypto.randomUUID(), expectedVersion: current.version, action };
      const r = await api<{ match: BoardView }>(`/board/matches/${current.id}/actions`, command);
      latest.current = r.match;
      setMatch(r.match);
      // Executed after an awaited user command, never during component rendering.
      // eslint-disable-next-line react-hooks/purity
      setOffset(r.match.serverNow - Date.now());
      setPath([]);
      setCard('');
      setConfirm(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.code : 'UNKNOWN');
    } finally {
      setPending(false);
    }
  }
  if (!match || !displayed)
    return (
      <div className="empty-page">
        <p role={error ? 'alert' : 'status'}>
          {error ? t(`errors.${error}`, { defaultValue: t('product.error') }) : t('common.loading')}
        </p>
        <Link className="text-link" to={`/games/${gameId}`}>
          {t('product.back')}
        </Link>
      </div>
    );
  const canPlay =
      connected &&
      !pending &&
      review === null &&
      match.status === 'active' &&
      match.state.turn === match.yourSide,
    size = match.game === 'wayline' ? 5 : 8,
    isFlipped = flip ?? match.yourSide === 'b',
    squares = Array.from({ length: size * size }, (_, i) => i);
  if (isFlipped) squares.reverse();
  function click(i: number) {
    if (!canPlay) return;
    if (match!.game === 'checkers') {
      if (path.length && targets.includes(i)) {
        const next = [...path, i],
          complete = candidates.find(
            (a) => 'path' in a && JSON.stringify(a.path) === JSON.stringify(next),
          );
        if (complete) void send({ type: 'move', payload: complete });
        else setPath(next);
        return;
      }
      if (displayed!.board[i] && (displayed!.board[i] > 0 ? 'w' : 'b') === match!.yourSide)
        setPath([i]);
      else setPath([]);
    } else {
      const chosen = candidates.find((a) => !('path' in a) && a.to === i);
      if (chosen) void send({ type: 'move', payload: chosen });
      else if (displayed!.board[i] && (displayed!.board[i] > 0 ? 'w' : 'b') === match!.yourSide)
        setPath([i]);
      else setPath([]);
    }
  }
  function player(side: 'w' | 'b') {
    const elapsed =
        match!.status === 'active' && match!.state.turn === side && match!.turnStartedAt
          ? Math.max(0, now + offset - match!.turnStartedAt)
          : 0,
      name = side === 'w' ? match!.white : match!.black;
    return (
      <div
        className={`player-strip ${match!.status === 'active' && match!.state.turn === side ? 'to-move' : ''}`}
      >
        <div className="player-avatar">
          <BoardPiece piece={side === 'w' ? 2 : -2} game={match!.game} />
        </div>
        <div className="player-name">
          <strong>
            {name === 'Guest'
              ? t('chess.guest')
              : name === 'Bot'
                ? `${t('chess.bot')} · ${t(`chess.${match!.difficulty}`)}`
                : (name ?? t('chess.waiting'))}
          </strong>
          <span>{t(side === 'w' ? 'chess.white' : 'chess.black')}</span>
        </div>
        <span className="player-clock">
          {match!.timeControl === 'none'
            ? '∞'
            : clock((side === 'w' ? match!.whiteMs : match!.blackMs) - elapsed)}
        </span>
      </div>
    );
  }
  function cards(hand: string[], interactive: boolean) {
    return (
      <div className="movement-cards">
        {hand.map((id) => {
          const c = waylineCards.find((c) => c.id === id)!;
          return (
            <button
              key={id}
              disabled={!interactive || !canPlay}
              aria-pressed={interactive && (card || hand[0]) === id}
              onClick={() => {
                setCard(id);
                setPath([]);
              }}
              className={`movement-card ${prefs.cards === 'diagram' ? 'card-grid' : ''}`}
            >
              <span>{i18n.language === 'uk' ? c.uk : c.en}</span>
              <span className="card-pattern" aria-hidden="true">
                {Array.from({ length: 25 }, (_, i) => (
                  <i
                    key={i}
                    className={
                      i === 12
                        ? 'origin'
                        : c.moves.some(([dx, dy]) => 12 - dy * 5 + dx === i)
                          ? 'direction'
                          : ''
                    }
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    );
  }
  const invitation = invite
    ? `${location.pathname ? window.location.origin : ''}/join/${match.game}#${invite}`
    : null;
  return (
    <>
      <header className="play-heading">
        <Link className="text-link" to={`/games/${match.game}`}>
          ← {t(`games.${match.game}`)}
        </Link>
        <span>
          {t(match.ranked ? 'product.ranked' : 'product.casual')} ·{' '}
          {match.timeControl === 'none' ? t('chess.none') : match.timeControl}
        </span>
      </header>
      {error && (
        <p className="notice error" role="alert">
          {t(`errors.${error}`, { defaultValue: t('product.error') })}
        </p>
      )}
      {!connected && (
        <p className="notice" role="status">
          {t('chess.disconnected')}
        </p>
      )}
      <div className="play-layout">
        <section className="board-column">
          {player(isFlipped ? 'w' : 'b')}
          {match.game === 'wayline' &&
            cards((displayed as WaylineState).hands[match.yourSide === 'w' ? 'b' : 'w'], false)}
          <div className={`play-board-frame coordinate-frame theme-${prefs.board}`}>
            <BoardCoordinates size={size} flipped={isFlipped} />
            <div
              className="play-board"
              role="group"
              aria-label={t('product.boardLabel')}
              ref={boardRef}
              style={{
                gridTemplateColumns: `repeat(${size},minmax(0,1fr))`,
                gridTemplateRows: `repeat(${size},minmax(0,1fr))`,
              }}
            >
              {squares.map((square, index) => {
                const piece = displayed.board[square],
                  dark = (Math.floor(square / size) + (square % size)) % 2 === 1,
                  way = displayed as WaylineState,
                  relay = match.game === 'wayline' && (square === 11 || square === 13);
                return (
                  <button
                    key={square}
                    data-square={square}
                    aria-label={`${coordinate(square, size)}: ${piece ? t(piece > 0 ? 'product.white' : 'product.black') + ' ' + t(match.game === 'checkers' ? (Math.abs(piece) === 2 ? 'product.king' : 'product.man') : Math.abs(piece) === 2 ? 'product.navigator' : 'product.scout') : t('product.empty')}`}
                    aria-pressed={path.at(-1) === square}
                    className={`board-square ${dark ? 'dark' : 'light'} ${path.includes(square) ? 'is-selected' : ''} ${relay ? 'relay-square' : ''}`}
                    onClick={() => click(square)}
                    draggable={!!piece && canPlay && (piece > 0 ? 'w' : 'b') === match.yourSide}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', String(square));
                      setPath([square]);
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      click(square);
                    }}
                    onKeyDown={(e) => {
                      const delta = {
                        ArrowRight: 1,
                        ArrowLeft: -1,
                        ArrowUp: -size,
                        ArrowDown: size,
                      }[e.key];
                      if (delta !== undefined) {
                        e.preventDefault();
                        boardRef.current
                          ?.querySelector<HTMLButtonElement>(
                            `[data-square="${squares[Math.min(squares.length - 1, Math.max(0, index + delta))]}"]`,
                          )
                          ?.focus();
                      }
                    }}
                  >
                    {captured
                      .filter((c) => c.square === square)
                      .map((c) => (
                        <span className="capture-ghost" key={c.square}>
                          <BoardPiece piece={c.piece} game={match.game} />
                        </span>
                      ))}
                    {piece !== 0 && (
                      <BoardPiece
                        piece={piece}
                        game={match.game}
                        outline={prefs.pieces === 'outline'}
                      />
                    )}{' '}
                    {path.length > 0 && targets.includes(square) && (
                      <span className="legal-indicator" />
                    )}
                    {relay && (
                      <span className="relay-marker">
                        {square === (match.yourSide === 'w' ? 11 : 13) ? '1' : '2'}
                      </span>
                    )}
                    {match.game === 'wayline' && way.relay.w === 2 && null}
                  </button>
                );
              })}
            </div>
          </div>
          {match.game === 'wayline' && (
            <>
              <p>{t('product.selectCard')}</p>
              {cards((displayed as WaylineState).hands[match.yourSide], true)}
              <p>
                {t('product.relay')}: {(displayed as WaylineState).relay[match.yourSide]}/2
              </p>
              <div className="open-card">{cards([(displayed as WaylineState).open], false)}</div>
              {canPlay && legal.every((a) => !('path' in a) && a.from === null) && (
                <button
                  className="button"
                  onClick={() =>
                    void send({
                      type: 'move',
                      payload: legal.find(
                        (a) =>
                          !('path' in a) &&
                          a.card === (card || (displayed as WaylineState).hands[match.yourSide][0]),
                      ),
                    })
                  }
                >
                  {t('product.pass')}
                </button>
              )}
            </>
          )}
          {player(isFlipped ? 'b' : 'w')}
          <div className="board-tools">
            <button
              className="button compact"
              onClick={() => {
                setFlip(!isFlipped);
                setPath([]);
              }}
            >
              {t('chess.flip')}
            </button>
            <Choice
              aria-label={t('product.boardTheme')}
              value={prefs.board}
              onChange={(e) => setPrefs({ ...prefs, board: e.target.value as typeof prefs.board })}
            >
              <option value="classic">{t('product.classic')}</option>
              <option value="walnut">{t('product.walnut')}</option>
            </Choice>
          </div>
        </section>
        <aside className="match-panel">
          <h1>
            {match.status === 'waiting'
              ? t('chess.waiting')
              : match.result
                ? t(
                    match.result.winner === null
                      ? 'chess.drawResult'
                      : match.result.winner === 'first'
                        ? 'chess.win'
                        : 'chess.blackWin',
                  )
                : t(match.state.turn === match.yourSide ? 'chess.yourTurn' : 'chess.opponentTurn')}
          </h1>
          {match.result && (
            <p>
              {t(`product.${match.result.reason}`, {
                defaultValue: t(`chess.${match.result.reason}`),
              })}
            </p>
          )}
          {match.status === 'waiting' &&
            (invitation ? (
              <>
                <label htmlFor="invite-link">{t('chess.invitation')}</label>
                <input id="invite-link" readOnly value={invitation} />
                <button
                  className="button"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(invitation)
                      .then(() => setCopied(true))
                      .catch(() => setError('COPY_FAILED'));
                  }}
                >
                  <Icon name="share" />
                  {t(copied ? 'chess.copied' : 'chess.copy')}
                </button>
              </>
            ) : (
              <p>{t('chess.rematchWaiting')}</p>
            ))}
          {match.drawOffer && (
            <p className="notice">
              {t(match.drawOffer === match.yourSide ? 'chess.drawOffered' : 'chess.drawReceived')}
              {match.drawOffer !== match.yourSide && (
                <>
                  <button className="button" onClick={() => void send({ type: 'accept_draw' })}>
                    {t('chess.accept')}
                  </button>
                  <button className="button" onClick={() => void send({ type: 'decline_draw' })}>
                    {t('chess.decline')}
                  </button>
                </>
              )}
            </p>
          )}
          <h3>{t('chess.history')}</h3>
          <GameHelp
            game={match.game}
            training={
              match.mode === 'bot' && new URLSearchParams(location.search).get('training') === '1'
            }
            hint={
              canPlay && legal[0]
                ? 'path' in legal[0]
                  ? legal[0].path.map((n) => coordinate(n, size)).join(' → ')
                  : `${waylineCards.find((c) => c.id === ('card' in legal[0] ? legal[0].card : ''))?.[i18n.language === 'uk' ? 'uk' : 'en']}: ${legal[0].from === null ? t('product.pass') : coordinate(legal[0].from!, size) + ' → ' + coordinate(legal[0].to!, size)}`
                : undefined
            }
          />
          <ol className="board-history">
            {match.state.history.map((a, i) => (
              <li key={i}>
                <button disabled={match.status !== 'finished'} onClick={() => setReview(i + 1)}>
                  {'path' in a
                    ? a.path.map((n) => coordinate(n, size)).join(' → ')
                    : `${waylineCards.find((c) => c.id === a.card)?.[i18n.language === 'uk' ? 'uk' : 'en'] ?? a.card}: ${a.from === null ? t('product.pass') : coordinate(a.from, size) + ' → ' + coordinate(a.to!, size)}`}
                </button>
              </li>
            ))}
          </ol>
          {match.status === 'active' && (
            <div className="actions">
              {match.mode !== 'bot' && (
                <button
                  disabled={pending || !connected}
                  className="button"
                  onClick={() => void send({ type: 'offer_draw' })}
                >
                  {t('chess.draw')}
                </button>
              )}
              <button
                disabled={pending || !connected}
                className="button"
                onClick={() => (confirm ? void send({ type: 'resign' }) : setConfirm(true))}
              >
                {t(confirm ? 'chess.confirmResign' : 'chess.resign')}
              </button>
              {confirm && (
                <button className="text-link" onClick={() => setConfirm(false)}>
                  {t('common.cancel')}
                </button>
              )}
            </div>
          )}
          {match.status === 'finished' && (
            <>
              <div className="actions">
                <button className="button" onClick={() => setReview(0)}>
                  {t('chess.first')}
                </button>
                <button
                  className="button"
                  onClick={() => setReview(Math.max(0, (review ?? match.state.history.length) - 1))}
                >
                  {t('chess.previous')}
                </button>
                <button
                  className="button"
                  onClick={() => setReview(Math.min(match.state.history.length, (review ?? 0) + 1))}
                >
                  {t('chess.next')}
                </button>
                <button className="button" onClick={() => setReview(null)}>
                  {t('chess.last')}
                </button>
              </div>
              <button
                className="button primary"
                disabled={pending}
                onClick={() => {
                  setPending(true);
                  void api<{ match: BoardView }>(`/board/matches/${match.id}/rematch`, {})
                    .then((r) => navigate(`/play/${match.game}/${r.match.id}`))
                    .catch(() => setError('UNKNOWN'))
                    .finally(() => setPending(false));
                }}
              >
                <Icon name="rematch" />
                {t('chess.rematch')}
              </button>
            </>
          )}
          <details>
            <summary>{t('product.rules')}</summary>
            <p>{t(match.game === 'checkers' ? 'product.rulesCheckers' : 'product.rulesWayline')}</p>
            <Link to={`/learn/${match.game}`}>{t('product.learn')}</Link>
          </details>
          <button
            className="button"
            onClick={() => {
              const url = URL.createObjectURL(
                  new Blob(
                    [
                      JSON.stringify(
                        {
                          game: match.game,
                          rulesVersion: match.rulesVersion,
                          state: match.state,
                          result: match.result,
                        },
                        null,
                        2,
                      ),
                    ],
                    { type: 'application/json' },
                  ),
                ),
                link = document.createElement('a');
              link.href = url;
              link.download = `playboard-${match.id}.json`;
              link.click();
              URL.revokeObjectURL(url);
            }}
          >
            {t('product.export')}
          </button>
        </aside>
      </div>
    </>
  );
}
