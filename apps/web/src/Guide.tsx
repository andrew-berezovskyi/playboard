export function Guide({ happy = false }: { happy?: boolean }) {
  return (
    <svg className="coach-emblem" viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
      <rect
        x="3"
        y="3"
        width="34"
        height="34"
        rx="11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path d="M12 12h7v7h-7zm9 9h7v7h-7z" fill="currentColor" opacity=".55" />
      {happy ? (
        <path
          d="m12 25 4 4 12-15"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M23 12h5v5M12 23v5h5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
