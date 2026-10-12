export const squareName = (index: number, size: number) =>
  `${'abcdefgh'[index % size]}${size - Math.floor(index / size)}`;
export function BoardCoordinates({
  size = 8,
  flipped = false,
}: {
  size?: number;
  flipped?: boolean;
}) {
  const files = Array.from(
    { length: size },
    (_, index) => 'ABCDEFGH'[flipped ? size - 1 - index : index],
  );
  const ranks = Array.from({ length: size }, (_, index) => (flipped ? index + 1 : size - index));
  return (
    <>
      <div
        className="board-files"
        aria-hidden="true"
        style={{ gridTemplateColumns: `repeat(${size},1fr)` }}
      >
        {files.map((file) => (
          <span key={file}>{file}</span>
        ))}
      </div>
      <div
        className="board-ranks"
        aria-hidden="true"
        style={{ gridTemplateRows: `repeat(${size},1fr)` }}
      >
        {ranks.map((rank) => (
          <span key={rank}>{rank}</span>
        ))}
      </div>
    </>
  );
}
