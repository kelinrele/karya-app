/**
 * The current session, kept current.
 *
 * `isLoading` is true until the first answer from storage arrives. Restoring
 * a session is asynchronous, so on a hard refresh there is a moment where the
 * session is unknown rather than absent. Treating unknown as absent would
 * flash the signed-out state, and worse, would let the data layer pick the
 * guest backend for a signed-in user and read the wrong store. Nothing should
 * decide anything about auth while `isLoading` is true.
 */
import { useEffect, useState } from 'react';
import { getSession, onSessionChange, type Session } from '@/lib/auth';

export interface SessionState {
  session: Session | null;
  isLoading: boolean;
}

export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ session: null, isLoading: true });

  useEffect(() => {
    let cancelled = false;
    const settle = (session: Session | null) => {
      if (!cancelled) setState({ session, isLoading: false });
    };

    // The listener reports the restored session once on subscribe, then every
    // change after. getSession is asked as well so that a listener which never
    // fires, for whatever reason, still ends the loading state; both answer
    // with the same session, so the order they arrive in does not matter.
    const unsubscribe = onSessionChange(settle);
    getSession().then(settle, () => settle(null));

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return state;
}
