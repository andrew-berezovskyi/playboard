export function CountryFlag({ language }: { language: string }) {
  return language === 'uk' ? (
    <svg width="24" height="16" viewBox="0 0 24 16" aria-hidden="true">
      <rect width="24" height="16" rx="2" fill="#ffdf47" />
      <path d="M2 0h20a2 2 0 0 1 2 2v6H0V2a2 2 0 0 1 2-2" fill="#2785d6" />
    </svg>
  ) : (
    <svg width="24" height="16" viewBox="0 0 24 16" aria-hidden="true">
      <defs>
        <clipPath id="flag-round">
          <rect width="24" height="16" rx="2" />
        </clipPath>
      </defs>
      <g clipPath="url(#flag-round)">
        <path fill="#24467d" d="M0 0h24v16H0z" />
        <path stroke="#fff" strokeWidth="4" d="m0 0 24 16M24 0 0 16" />
        <path stroke="#d85565" strokeWidth="1.5" d="m0 0 24 16M24 0 0 16" />
        <path stroke="#fff" strokeWidth="5" d="M12 0v16M0 8h24" />
        <path stroke="#d85565" strokeWidth="3" d="M12 0v16M0 8h24" />
      </g>
    </svg>
  );
}
