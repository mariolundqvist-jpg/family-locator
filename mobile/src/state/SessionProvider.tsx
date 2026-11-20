/**
 * Session and group state for the whole app.
 *
 * One place decides what the app believes about consent and sharing, and it
 * pushes every change into the LocationController before re-rendering. The
 * controller is what actually stops the GPS; the UI only reflects it.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import * as api from '../api';
import { clearContext } from './contextStore';
import { getController, onControllerChange } from '../controller';
import type { ControllerSnapshot } from '../core/controller';
import type { SharingState, TransmissionContext } from '../core/types';

type SessionValue = {
  loading: boolean;
  user: api.MeResponse['user'] | null;
  families: api.FamilySummary[];
  activeFamilyId: string | null;
  view: api.FamilyView | null;
  controller: ControllerSnapshot | null;
  error: string | null;
  signIn: (email: string, code: string, displayName?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  selectFamily: (familyId: string) => Promise<void>;
  setSharing: (state: SharingState) => Promise<void>;
  applyConsent: (foreground: boolean, background: boolean) => Promise<void>;
  deleteAccount: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<api.MeResponse['user'] | null>(null);
  const [families, setFamilies] = useState<api.FamilySummary[]>([]);
  const [activeFamilyId, setActiveFamilyId] = useState<string | null>(null);
  const [view, setView] = useState<api.FamilyView | null>(null);
  const [controller, setController] = useState<ControllerSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeFamilyIdRef = useRef<string | null>(null);
  activeFamilyIdRef.current = activeFamilyId;

  useEffect(() => onControllerChange(setController), []);

  /** Load the group and push its facts into the gate. */
  const loadFamily = useCallback(async (familyId: string) => {
    const fresh = await api.familyView(familyId);
    setView(fresh);
    const ctrl = await getController();
    await ctrl.setContext({
      signedIn: true,
      memberId: fresh.viewer.memberId,
      sharingState: fresh.viewer.sharingState,
      foregroundConsent: fresh.viewer.consent.foreground,
      backgroundConsent: fresh.viewer.consent.background,
      memberRemoved: false,
      serverRevoked: false,
    });
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const me = await api.me();
      setUser(me.user);
      setFamilies(me.families);

      const current = activeFamilyIdRef.current;
      const stillMember = current && me.families.some((f) => f.familyId === current);
      const next = stillMember ? current : (me.families[0]?.familyId ?? null);
      setActiveFamilyId(next);

      const ctrl = await getController();
      if (!next) {
        // Signed in but in no group: nothing may be collected.
        setView(null);
        await ctrl.setContext(
          { signedIn: true, memberId: '', sharingState: 'off', foregroundConsent: false, backgroundConsent: false },
          'no_membership',
        );
        return;
      }
      await loadFamily(next);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 401) {
        // Session expired or was revoked on the server.
        setUser(null);
        setFamilies([]);
        setView(null);
        setActiveFamilyId(null);
        const ctrl = await getController();
        await ctrl.signOut();
        await clearContext();
        return;
      }
      setError((err as Error).message);
    }
  }, [loadFamily]);

  // Boot: restore a session if the keychain still has one.
  useEffect(() => {
    (async () => {
      const ctrl = await getController();
      // Reconcile the watcher with whatever was persisted, then verify online.
      await ctrl.setContext({});
      const token = await api.loadToken();
      if (!token) {
        setLoading(false);
        return;
      }
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  // Coming back to the foreground is a chance to flush what queued while away
  // and to learn about a removal that happened in the meantime.
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state !== 'active') return;
      void (async () => {
        const ctrl = await getController();
        await ctrl.flush();
        if (user) await refresh();
      })();
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [refresh, user]);

  const signIn = useCallback(
    async (email: string, code: string, displayName?: string) => {
      await api.verifyCode(email, code, displayName);
      await refresh();
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    const ctrl = await getController();
    // Stop collection and destroy the queue *before* the token is destroyed,
    // so nothing is left that could be sent by a later task run.
    await ctrl.signOut();
    try {
      await api.logout();
    } finally {
      await clearContext();
      setUser(null);
      setFamilies([]);
      setView(null);
      setActiveFamilyId(null);
    }
  }, []);

  const selectFamily = useCallback(
    async (familyId: string) => {
      setActiveFamilyId(familyId);
      await loadFamily(familyId);
    },
    [loadFamily],
  );

  const setSharing = useCallback(
    async (state: SharingState) => {
      const ctrl = await getController();
      // Local gate first: if the network call fails, the person's choice to
      // stop must already have taken effect.
      if (state !== 'on') {
        await ctrl.setSharingState(state);
      }
      const result = await api.setSharing(state);
      if (state === 'on') {
        await ctrl.setSharingState(result.sharingState as SharingState);
      }
      await refresh();
    },
    [refresh],
  );

  const applyConsent = useCallback(
    async (foreground: boolean, background: boolean) => {
      const ctrl = await getController();
      await ctrl.setContext({ foregroundConsent: foreground, backgroundConsent: background }, 'consent_changed');
      await refresh();
    },
    [refresh],
  );

  const deleteAccount = useCallback(async () => {
    const ctrl = await getController();
    await ctrl.shutdown('sign_out');
    await api.deleteAccount();
    await clearContext();
    setUser(null);
    setFamilies([]);
    setView(null);
    setActiveFamilyId(null);
  }, []);

  const context: TransmissionContext | undefined = controller?.context;

  const value = useMemo<SessionValue>(
    () => ({
      loading,
      user,
      families,
      activeFamilyId,
      view,
      controller,
      error,
      signIn,
      signOut,
      refresh,
      selectFamily,
      setSharing,
      applyConsent,
      deleteAccount,
    }),
    [
      loading,
      user,
      families,
      activeFamilyId,
      view,
      controller,
      error,
      signIn,
      signOut,
      refresh,
      selectFamily,
      setSharing,
      applyConsent,
      deleteAccount,
      context,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
