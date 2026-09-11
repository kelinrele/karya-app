/**
 * Authentication, as the rest of the app is allowed to see it.
 *
 * Every auth call goes through here. No other module imports the client for
 * auth and no other module reads the session from storage, so there is
 * exactly one place that knows how a session is held and one place to change
 * if that ever needs to.
 *
 * Guest mode is not an auth state. A guest has no session at all and their
 * data never leaves the browser. The data layer decides between the guest
 * and signed-in backends from what this module reports; components never do.
 */
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type { Session };

export interface Credentials {
  email: string;
  password: string;
}

/**
 * Create an account. Returns the session when the project signs the user in
 * immediately, or null when it requires email confirmation first.
 */
export async function signUp({ email, password }: Credentials): Promise<Session | null> {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signInWithPassword({ email, password }: Credentials): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

/** End the session and remove it from storage. */
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/** The current session, restored from storage if one was persisted. */
export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

/**
 * Subscribe to session changes: sign-in, sign-out, token refresh, and the
 * initial restore from storage. The session is null once signed out.
 * Returns the unsubscribe function.
 */
export function onSessionChange(
  handler: (session: Session | null, event: AuthChangeEvent) => void,
): () => void {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    handler(session, event);
  });
  return () => {
    data.subscription.unsubscribe();
  };
}
