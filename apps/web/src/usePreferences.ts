import { useEffect, useState } from 'react';
import { api } from './api';
import { useSession } from './session';
import { localPreferences, type Profile } from './profile-types';
export function usePreferences() {
  const { user } = useSession();
  const state = useState(localPreferences);
  const setPreferences = state[1];
  useEffect(() => {
    if (!user) return;
    let active = true;
    void api<{ profile: Profile }>('/platform/profile')
      .then((r) => {
        if (active && r.profile.settings)
          setPreferences({ ...localPreferences(), ...r.profile.settings.preferences });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user, setPreferences]);
  return state;
}
