export type Rating = { rating: number; deviation: number; volatility: number };
// Mark Glickman's revised Glicko-2 algorithm, tau=.5. One completed match is
// one rating period; both opponents use their pre-period values.
export function glicko2(player: Rating, opponents: (Rating & { score: number })[]): Rating {
  const scale = 173.7178,
    mu = (player.rating - 1500) / scale,
    phi = player.deviation / scale,
    a = Math.log(player.volatility ** 2),
    tau = 0.5;
  if (!opponents.length)
    return {
      ...player,
      deviation: Math.min(350, Math.sqrt(phi ** 2 + player.volatility ** 2) * scale),
    };
  let information = 0,
    improvement = 0;
  for (const other of opponents) {
    const g = 1 / Math.sqrt(1 + (3 * (other.deviation / scale) ** 2) / Math.PI ** 2),
      e = 1 / (1 + Math.exp(-g * (mu - (other.rating - 1500) / scale)));
    information += g * g * e * (1 - e);
    improvement += g * (other.score - e);
  }
  const v = 1 / information,
    delta = v * improvement;
  const f = (x: number) => {
    const ex = Math.exp(x);
    return (
      (ex * (delta * delta - phi * phi - v - ex)) / (2 * (phi * phi + v + ex) ** 2) -
      (x - a) / (tau * tau)
    );
  };
  let A = a,
    B: number;
  if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v);
  else {
    let k = 1;
    while (f(a - k * tau) < 0 && k < 1000) k++;
    B = a - k * tau;
  }
  let fa = f(A),
    fb = f(B);
  for (let i = 0; Math.abs(B - A) > 1e-6 && i < 100; i++) {
    const C = A + ((A - B) * fa) / (fb - fa),
      fc = f(C);
    if (fc * fb <= 0) {
      A = B;
      fa = fb;
    } else fa /= 2;
    B = C;
    fb = fc;
  }
  const volatility = Math.exp(A / 2),
    star = Math.sqrt(phi * phi + volatility * volatility),
    nextPhi = 1 / Math.sqrt(1 / (star * star) + 1 / v);
  return {
    rating: 1500 + scale * (mu + nextPhi * nextPhi * improvement),
    deviation: nextPhi * scale,
    volatility,
  };
}
