import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, ensurePlayer } from './api';
import type { UserView } from '../../../packages/shared/src/contracts';
const SessionContext = createContext<{
  user: UserView | null;
  loading: boolean;
  error: boolean;
  refresh: () => Promise<void>;
  setUser: (user: UserView | null) => void;
}>({ user: null, loading: true, error: false, refresh: async () => {}, setUser: () => {} });
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserView | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false);
  const revision = useRef(0);
  const updateUser = useCallback((next: UserView | null) => {
    revision.current += 1;
    setUser(next);
    setError(false);
    setLoading(false);
  }, []);
  const refresh = useCallback(async () => {
    const requestRevision = ++revision.current;
    setLoading(true);
    try {
      const result = await api<{ user: UserView | null }>('/auth/me');
      if (!result.user) await ensurePlayer();
      if (revision.current === requestRevision) {
        setUser(result.user);
        setError(false);
      }
    } catch {
      if (revision.current === requestRevision) setError(true);
    } finally {
      if (revision.current === requestRevision) setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!user) return;
    const ping = () => {
      if (document.visibilityState === 'visible')
        void api('/platform/presence', {}).catch(() => {});
    };
    ping();
    const timer = window.setInterval(ping, 45000);
    document.addEventListener('visibilitychange', ping);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', ping);
    };
  }, [user]);
  useEffect(() => {
    let active = true;
    const requestRevision = ++revision.current;
    api<{ user: UserView | null }>('/auth/me')
      .then(async (result) => {
        if (!result.user) await ensurePlayer();
        if (active && revision.current === requestRevision) {
          setUser(result.user);
          setError(false);
        }
      })
      .catch(() => {
        if (active && revision.current === requestRevision) setError(true);
      })
      .finally(() => {
        if (active && revision.current === requestRevision) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <SessionContext.Provider value={{ user, loading, error, refresh, setUser: updateUser }}>
      {children}
    </SessionContext.Provider>
  );
}
export const useSession = () => useContext(SessionContext);
