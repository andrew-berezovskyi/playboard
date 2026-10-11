export function BoardPiece({
  piece,
  game,
  outline = false,
}: {
  piece: number;
  game: string;
  outline?: boolean;
}) {
  const fill = piece > 0 ? '#f2ead9' : '#183652',
    stroke = piece > 0 ? '#8a7961' : '#92a8bf';
  return (
    <svg className="board-token" viewBox="0 0 80 80" aria-hidden="true">
      <circle
        cx="40"
        cy="42"
        r={game === 'checkers' ? 27 : 23}
        fill={outline ? 'none' : fill}
        stroke={stroke}
        strokeWidth="3"
      />
      <circle
        cx="40"
        cy="42"
        r={game === 'checkers' ? 20 : 16}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        opacity=".65"
      />
      {Math.abs(piece) === 2 &&
        (game === 'checkers' ? (
          <path
            d="m25 45-3-14 10 7 8-13 8 13 10-7-3 14zm0 5h30"
            fill="none"
            stroke={stroke}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path d="M40 23 52 42 40 55 28 42Z" fill={stroke} strokeLinejoin="round" />
        ))}
      <path d="M22 60q18 8 36 0" fill="none" stroke={stroke} strokeWidth="2" opacity=".4" />
    </svg>
  );
}
