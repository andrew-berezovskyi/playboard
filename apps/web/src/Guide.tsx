export function Guide({ happy = false }: { happy?: boolean }) {
  return (
    <svg
      className={`guide ${happy ? 'happy' : ''}`}
      viewBox="0 0 100 90"
      width="64"
      height="58"
      aria-hidden="true"
    >
      <path
        d="M22 68Q12 49 23 27Q32 12 52 13Q75 15 82 33Q93 54 78 71Q50 86 22 68"
        fill="#1e3858"
        stroke="#9ab6d9"
        strokeWidth="2"
      />
      <path d="m44 15 8-10 7 11" fill="#9ab6d9" />
      <path
        d="M31 43q5-5 10 0m18 0q5-5 10 0"
        stroke="#dae6f5"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      {happy ? (
        <path
          d="M39 57q12 13 24 0"
          fill="none"
          stroke="#dae6f5"
          strokeWidth="3"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M43 61q8-4 16 0"
          fill="none"
          stroke="#dae6f5"
          strokeWidth="3"
          strokeLinecap="round"
        />
      )}
      <circle cx="26" cy="56" r="4" fill="#789abd" />
      <circle cx="75" cy="56" r="4" fill="#789abd" />
    </svg>
  );
}
