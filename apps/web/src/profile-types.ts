export type Preferences = {
  sound: boolean;
  animations: boolean;
  board: 'classic' | 'walnut';
  pieces: 'solid' | 'outline';
  cards: 'minimal' | 'diagram';
  captureEffect: boolean;
};
export const defaultPreferences: Preferences = {
  sound: false,
  animations: true,
  board: 'classic',
  pieces: 'solid',
  cards: 'minimal',
  captureEffect: true,
};
export type Profile = {
  username: string;
  displayName: string;
  bio: string;
  avatar: string;
  createdAt: string;
  stats: { games: number; wins: number; draws: number; losses: number };
  xp: number;
  level: number;
  streak: number;
  bestStreak: number;
  today: string;
  friendCount: number;
  ratingHistory: {
    match_id: string;
    pool: string;
    before_rating: number;
    after_rating: number;
    created_at: string;
  }[];
  seasonPoints: number;
  league: string;
  activity: string[];
  ratings: { pool: string; rating: number; deviation: number; games: number }[];
  achievements: { code: string }[];
  lessons: { lesson: string }[];
  history: {
    match_id: string;
    game: string;
    score: number;
    bot: boolean;
    rated: boolean;
    created_at: string;
  }[];
  settings?: {
    publicProfile: boolean;
    showOnline: boolean;
    invitations: 'everyone' | 'friends' | 'none';
    timezone: string;
    preferences: Partial<Preferences>;
  };
};
export function localPreferences(): Preferences {
  try {
    return {
      ...defaultPreferences,
      ...JSON.parse(localStorage.getItem('playboard-preferences') ?? '{}'),
    };
  } catch {
    return defaultPreferences;
  }
}
