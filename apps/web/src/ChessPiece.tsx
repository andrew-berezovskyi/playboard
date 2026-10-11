import type { Color, PieceSymbol } from 'chess.js';
import type { ReactNode } from 'react';
// Original, code-native silhouettes; independent of commercial game artwork.
export function ChessPiece({
  type,
  color,
  outline = false,
}: {
  type: PieceSymbol;
  color: Color;
  outline?: boolean;
}) {
  const shapes: Record<PieceSymbol, ReactNode> = {
    p: (
      <>
        <circle cx="32" cy="17" r="8" />
        <path d="M27 25C28 34 27 40 23 45h18c-4-5-5-11-4-20Z" />
        <path d="M22 45c-3 3-4 5-4 8h28c0-3-1-5-4-8Z" />
      </>
    ),
    r: (
      <>
        <path d="M18 12h8v6h4v-6h4v6h4v-6h8v16H18Z" />
        <path d="M23 28c3 9 3 13-2 20h22c-5-7-5-11-2-20Z" />
        <path d="M18 48h28v6H18Z" />
      </>
    ),
    b: (
      <>
        <path d="M32 8c-3 6-12 11-12 20 0 7 5 10 12 10s12-3 12-10C44 19 35 14 32 8Z" />
        <path d="m29 19 6 9" fill="none" />
        <path d="M28 38c0 6-3 9-8 12h24c-5-3-8-6-8-12Z" />
      </>
    ),
    n: (
      <>
        <path d="M19 49c1-9 6-17 13-24l-10 5c-3 1-8-1-9-5l9-15 12-2 6-5 4 11c10 7 13 19 9 35Z" />
        <path d="M35 14c9 6 13 16 12 29M20 23l6-1" fill="none" />
        <circle cx="31" cy="16" r="1.7" className="piece-eye" />
      </>
    ),
    q: (
      <>
        <path d="m17 19 7 7 8-13 8 13 7-7-7 24H24Z" />
        <circle cx="16" cy="17" r="3" />
        <circle cx="32" cy="10" r="3" />
        <circle cx="48" cy="17" r="3" />
        <path d="M24 43c0 4-3 6-5 8h26c-2-2-5-4-5-8Z" />
      </>
    ),
    k: (
      <>
        <path d="M32 6v14m-6-8h12" fill="none" strokeWidth="4" />
        <path d="M20 23c0-7 8-9 12-3 4-6 12-4 12 3 0 5-4 11-7 15H27c-3-4-7-10-7-15Z" />
        <path d="M27 38c0 6-3 9-7 13h24c-4-4-7-7-7-13Z" />
      </>
    ),
  };
  return (
    <svg
      className={`chess-piece piece-${color}`}
      viewBox="0 0 64 64"
      aria-hidden="true"
      fill={outline ? 'none' : 'currentColor'}
      stroke={outline ? 'currentColor' : 'var(--piece-stroke)'}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {shapes[type]}
      <path d="M18 53h28c3 0 5 2 5 5H13c0-3 2-5 5-5Z" />
      <path d="M21 56h22" fill="none" opacity=".4" />
    </svg>
  );
}
