import { useCallback, useEffect, useState } from "react";

/**
 * Lightweight client-side brute-force guard for the portal login forms.
 *
 * Failed attempts are remembered (in sessionStorage so they survive a reload)
 * and after a burst of failures the form is locked for a short cooldown.
 * This is a UX-level supplement — the backend remains responsible for real
 * rate limiting and account lockout.
 */

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000;
const LOCK_MS = 60 * 1000;

interface LoginThrottleState {
  attempts: number[];
  lockUntil: number;
}

const emptyState = (): LoginThrottleState => ({ attempts: [], lockUntil: 0 });

const storageKey = (role: string) => `VIARA_login_throttle_${role}`;

const readState = (role: string): LoginThrottleState => {
  if (typeof sessionStorage === "undefined") return emptyState();
  try {
    const stored = sessionStorage.getItem(storageKey(role));
    return stored ? { ...emptyState(), ...(JSON.parse(stored) as LoginThrottleState) } : emptyState();
  } catch {
    return emptyState();
  }
};

const writeState = (role: string, state: LoginThrottleState): void => {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(storageKey(role), JSON.stringify(state));
  } catch {
    // Storage can be unavailable (private mode / quota) — the guard degrades to in-memory only.
  }
};

export interface LoginThrottle {
  locked: boolean;
  lockRemainingMs: number;
  failedAttempts: number;
  registerFailure: () => void;
  registerSuccess: () => void;
}

export const useLoginThrottle = (role: string): LoginThrottle => {
  const [state, setState] = useState<LoginThrottleState>(() => readState(role));
  const [now, setNow] = useState(() => Date.now());

  const locked = state.lockUntil > now;
  const lockRemainingMs = Math.max(0, state.lockUntil - now);

  useEffect(() => {
    if (state.lockUntil <= Date.now()) return undefined;
    const timer = window.setInterval(() => {
      const current = Date.now();
      if (current >= state.lockUntil) {
        window.clearInterval(timer);
      }
      setNow(current);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [state.lockUntil]);

  const registerFailure = useCallback(() => {
    const timestamp = Date.now();
    setState((current) => {
      const attempts = [...current.attempts.filter((t) => timestamp - t < WINDOW_MS), timestamp];
      const lockUntil =
        attempts.length >= MAX_ATTEMPTS ? timestamp + LOCK_MS : current.lockUntil;
      const next = { attempts, lockUntil };
      writeState(role, next);
      return next;
    });
    setNow(Date.now());
  }, [role]);

  const registerSuccess = useCallback(() => {
    setState(emptyState());
    writeState(role, emptyState());
    setNow(Date.now());
  }, [role]);

  return { locked, lockRemainingMs, failedAttempts: state.attempts.length, registerFailure, registerSuccess };
};
