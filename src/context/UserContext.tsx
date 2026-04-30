import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  GoingEvent,
  SavedEvent,
  SharedWithYouEvent,
  SiftStorage,
  UserProfile,
} from "@/types/user";
import { DEFAULT_LISTS, initialStorage } from "@/types/user";
import {
  loadStorage,
  saveStorage,
  setOnboardingDoneFlag,
  clearOnboardingDoneFlag,
} from "@/lib/storage";
import {
  fetchUserData,
  syncUserProfile,
  syncDisplayName,
  syncSavedEvent,
  deleteSavedEvent as deleteSavedEventDB,
  syncGoingEvent,
  deleteGoingEvent as deleteGoingEventDB,
  syncCustomList,
  renameCustomListDB,
  deleteCustomListDB,
  reorderCustomListsDB,
} from "@/lib/userDataService";
import { supabase } from "@/lib/supabase";
import { fetchEventById } from "@/lib/getEvents";
import { events as localEvents } from "@/data/events";

interface UserContextValue extends SiftStorage {
  ready: boolean;
  setAuth: (
    isLoggedIn: boolean,
    userEmail: string,
    userDisplayName?: string
  ) => Promise<void>;
  setUserProfile: (profile: UserProfile) => void;
  addSavedEvent: (eventId: string, listName: string, meta?: { title?: string; startDate?: string; endDate?: string }) => void;
  removeSavedEvent: (eventId: string) => void;
  getSavedListForEvent: (eventId: string) => string | null;
  toggleGoing: (event: {
    eventId: string;
    eventTitle: string;
    eventDate: string;
    eventEndDate?: string;
  }) => boolean;
  isGoing: (eventId: string) => boolean;
  markCommitted: (eventId: string) => void;
  getGoingEvent: (eventId: string) => GoingEvent | undefined;
  addCustomList: (listName: string) => void;
  renameCustomList: (oldName: string, newName: string) => void;
  deleteCustomList: (listName: string) => void;
  reorderCustomLists: (newOrder: string[]) => void;
  saveEventToNewList: (listName: string, eventId: string, meta?: { title?: string; startDate?: string; endDate?: string }) => void;
  getAllListNames: () => string[];
  addSharedWithYou: (eventId: string) => void;
  updateDisplayName: (name: string) => void;
  signOut: () => Promise<void>;
  refreshFromRemote: () => Promise<void>;
}

const UserContext = createContext<UserContextValue | null>(null);

function isInvalidRefreshTokenError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /Invalid Refresh Token|Refresh Token Not Found/i.test(error.message)
  );
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [storage, setStorage] = useState<SiftStorage>(initialStorage);
  const [ready, setReady] = useState(false);

  // Supabase user ID — used to key all remote data operations.
  const userIdRef = useRef<string | null>(null);

  const clearLocalAuthState = useCallback(async () => {
    userIdRef.current = null;
    clearOnboardingDoneFlag();
    // Update state synchronously first so the UI re-renders as logged-out
    // immediately; defer the async supabase + storage writes.
    const clean = { ...initialStorage };
    setStorage(clean);
    saveStorage(clean).catch(() => {});
    if (supabase) {
      supabase.auth.signOut({ scope: "local" }).catch(() => {});
    }
  }, []);

  // Re-fetch saved/going lists from Supabase. Called on tab focus so that
  // server-side changes (e.g. event deletion invalidating a going_events row)
  // propagate without requiring sign-out.
  const refreshFromRemote = useCallback(async () => {
    const userId = userIdRef.current;
    if (!userId) return;
    const remote = await fetchUserData(userId);
    if (!remote) return;
    setStorage((prev) => ({
      ...prev,
      savedEvents: remote.savedEvents,
      goingEvents: remote.goingEvents,
      customLists: remote.customLists,
    }));
  }, []);

  // ── Startup: restore session + load data ─────────────────

  useEffect(() => {
    (async () => {
      try {
        if (supabase) {
          let sessionData;
          try {
            const result = await supabase.auth.getSession();
            sessionData = result.data;
          } catch (error) {
            if (isInvalidRefreshTokenError(error)) {
              await clearLocalAuthState();
              setReady(true);
              return;
            }
            throw error;
          }

          if (sessionData.session?.user) {
            const user = sessionData.session.user;
            userIdRef.current = user.id;

            // Try loading from Supabase first; fall back to local cache.
            const remote = await fetchUserData(user.id);
            let data: SiftStorage;

            if (remote) {
              data = {
                ...initialStorage,
                isLoggedIn: true,
                userEmail: user.email ?? "",
                userDisplayName: remote.displayName,
                userProfile: remote.userProfile,
                savedEvents: remote.savedEvents,
                goingEvents: remote.goingEvents,
                customLists: remote.customLists,
                createdAt: user.created_at,
              };
            } else {
              // Supabase unavailable — use cached local data.
              const cached = await loadStorage();
              data = {
                ...cached,
                isLoggedIn: true,
                userEmail: user.email ?? cached.userEmail,
                userDisplayName: cached.userDisplayName,
                createdAt: user.created_at ?? cached.createdAt,
              };
            }

            if (data.userProfile) setOnboardingDoneFlag();
            else clearOnboardingDoneFlag();

            // Ensure "Favorites" list exists.
            if (!data.customLists.includes("Favorites")) {
              const customLists = ["Favorites", ...data.customLists];
              data = { ...data, customLists };
              syncCustomList(user.id, "Favorites", 0);
              reorderCustomListsDB(user.id, customLists);
            }

            // Backfill missing event dates in saved events.
            data = await backfillSavedEventDates(data);

            setStorage(data);
            saveStorage(data);
          } else {
            // No session — guest always starts clean.
            await clearLocalAuthState();
          }
        }
      } catch {
        // Supabase unavailable entirely — use local cache as-is.
        const cached = await loadStorage();
        setStorage(cached);
      }

      setReady(true);
    })();

    if (!supabase) return;

    // Keep auth state in sync (token refresh, external sign-out).
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          userIdRef.current = session.user.id;
          setStorage((prev) => ({
            ...prev,
            isLoggedIn: true,
            userEmail: session.user.email ?? prev.userEmail,
          }));
        } else {
          userIdRef.current = null;
          setStorage((prev) => ({
            ...prev,
            isLoggedIn: false,
            userEmail: "",
            userDisplayName: undefined,
          }));
        }
      }
    );

    return () => listener.subscription.unsubscribe();
  }, [clearLocalAuthState]);

  // ── Local + cache persist ────────────────────────────────

  const persist = useCallback((next: SiftStorage) => {
    setStorage(next);
    saveStorage(next);
  }, []);

  // ── Auth ──────────────────────────────────────────────────

  const setAuth = useCallback(
    async (isLoggedIn: boolean, userEmail: string, userDisplayName?: string) => {
      if (isLoggedIn && userEmail) {
        // Get the Supabase user ID from the current session.
        let userId: string | null = null;
        let supabaseCreatedAt: string | undefined;
        let authFullName: string | undefined;
        if (supabase) {
          const { data } = await supabase.auth.getUser();
          userId = data.user?.id ?? null;
          supabaseCreatedAt = data.user?.created_at;
          authFullName = data.user?.user_metadata?.full_name as string | undefined;
        }
        userIdRef.current = userId;

        // Load from Supabase; fall back to local cache.
        let data: SiftStorage = initialStorage;
        if (userId) {
          const remote = await fetchUserData(userId);
          if (remote) {
            data = {
              ...initialStorage,
              userDisplayName: remote.displayName,
              userProfile: remote.userProfile,
              savedEvents: remote.savedEvents,
              goingEvents: remote.goingEvents,
              customLists: remote.customLists,
            };
          } else {
            data = await loadStorage();
          }
        }

        if (data.userProfile) setOnboardingDoneFlag();
        else clearOnboardingDoneFlag();

        const resolvedName =
          userDisplayName !== undefined
            ? userDisplayName
            : authFullName ?? data.userDisplayName;

        // Write resolved name to user_profiles (single source of truth)
        if (resolvedName && userId) {
          syncDisplayName(userId, resolvedName);
        }

        // Ensure "Favorites" list exists.
        if (!data.customLists.includes("Favorites")) {
          const customLists = ["Favorites", ...data.customLists];
          data = { ...data, customLists };
          if (userId) {
            syncCustomList(userId, "Favorites", 0);
            reorderCustomListsDB(userId, customLists);
          }
        }

        const next: SiftStorage = {
          ...data,
          isLoggedIn: true,
          userEmail,
          userDisplayName: resolvedName,
          createdAt: supabaseCreatedAt ?? data.createdAt,
        };
        persist(next);
      } else {
        userIdRef.current = null;
        clearOnboardingDoneFlag();
        persist({ ...initialStorage });
      }
    },
    [persist]
  );

  // ── Profile ───────────────────────────────────────────────

  const setUserProfile = useCallback(
    (userProfile: UserProfile) => {
      persist({ ...storage, userProfile });
      if (userIdRef.current) {
        syncUserProfile(userIdRef.current, userProfile, storage.userDisplayName);
      }
    },
    [storage, persist]
  );

  // ── Saved events ─────────────────────────────────────────

  const addSavedEvent = useCallback(
    (eventId: string, listName: string, meta?: { title?: string; startDate?: string; endDate?: string }) => {
      const savedAt = new Date().toISOString();
      const newEvent: SavedEvent = {
        eventId, listName, savedAt,
        eventTitle: meta?.title,
        eventStartDate: meta?.startDate,
        eventEndDate: meta?.endDate,
      };
      const savedEvents = [
        ...storage.savedEvents.filter((s) => s.eventId !== eventId),
        newEvent,
      ];
      persist({ ...storage, savedEvents });
      if (userIdRef.current) syncSavedEvent(userIdRef.current, newEvent);
    },
    [storage, persist]
  );

  const removeSavedEvent = useCallback(
    (eventId: string) => {
      const savedEvents = storage.savedEvents.filter((s) => s.eventId !== eventId);
      persist({ ...storage, savedEvents });
      if (userIdRef.current) deleteSavedEventDB(userIdRef.current, eventId);
    },
    [storage, persist]
  );

  const getSavedListForEvent = useCallback(
    (eventId: string): string | null => {
      const s = storage.savedEvents.find((e) => e.eventId === eventId);
      return s ? s.listName : null;
    },
    [storage.savedEvents]
  );

  // ── Going ─────────────────────────────────────────────────

  const toggleGoing = useCallback(
    (event: {
      eventId: string;
      eventTitle: string;
      eventDate: string;
      eventEndDate?: string;
    }): boolean => {
      const exists = storage.goingEvents.some((e) => e.eventId === event.eventId);
      const markedAt = new Date().toISOString();
      let goingEvents: GoingEvent[];

      if (exists) {
        goingEvents = storage.goingEvents.filter((e) => e.eventId !== event.eventId);
        if (userIdRef.current) deleteGoingEventDB(userIdRef.current, event.eventId);
      } else {
        const newEvent: GoingEvent = { ...event, markedAt };
        goingEvents = [...storage.goingEvents, newEvent];
        if (userIdRef.current) syncGoingEvent(userIdRef.current, newEvent);
      }

      persist({ ...storage, goingEvents });
      return !exists;
    },
    [storage, persist]
  );

  const isGoing = useCallback(
    (eventId: string) => storage.goingEvents.some((e) => e.eventId === eventId),
    [storage.goingEvents]
  );

  const getGoingEvent = useCallback(
    (eventId: string) => storage.goingEvents.find((e) => e.eventId === eventId),
    [storage.goingEvents]
  );

  const markCommitted = useCallback(
    (eventId: string) => {
      const committedAt = new Date().toISOString();
      const goingEvents = storage.goingEvents.map((e) =>
        e.eventId === eventId ? { ...e, committed: true, committedAt } : e
      );
      persist({ ...storage, goingEvents });
      const updated = goingEvents.find((e) => e.eventId === eventId);
      if (userIdRef.current && updated) syncGoingEvent(userIdRef.current, updated);
    },
    [storage, persist]
  );

  // ── Lists ─────────────────────────────────────────────────

  const addCustomList = useCallback(
    (listName: string) => {
      const trimmed = listName.trim();
      if (!trimmed || storage.customLists.includes(trimmed)) return;
      const customLists = [...storage.customLists, trimmed];
      persist({ ...storage, customLists });
      if (userIdRef.current) syncCustomList(userIdRef.current, trimmed, customLists.length - 1);
    },
    [storage, persist]
  );

  const renameCustomList = useCallback(
    (oldName: string, newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed || trimmed === oldName) return;
      if (storage.customLists.includes(trimmed)) return;
      const customLists = storage.customLists.map((l) => l === oldName ? trimmed : l);
      const savedEvents = storage.savedEvents.map((s) =>
        s.listName === oldName ? { ...s, listName: trimmed } : s
      );
      persist({ ...storage, customLists, savedEvents });
      if (userIdRef.current) renameCustomListDB(userIdRef.current, oldName, trimmed);
    },
    [storage, persist]
  );

  const deleteCustomList = useCallback(
    (listName: string) => {
      const customLists = storage.customLists.filter((l) => l !== listName);
      const savedEvents = storage.savedEvents.filter((s) => s.listName !== listName);
      persist({ ...storage, customLists, savedEvents });
      if (userIdRef.current) deleteCustomListDB(userIdRef.current, listName);
    },
    [storage, persist]
  );

  const saveEventToNewList = useCallback(
    (listName: string, eventId: string, meta?: { title?: string; startDate?: string; endDate?: string }) => {
      const trimmed = listName.trim();
      if (!trimmed) return;
      const savedAt = new Date().toISOString();
      const newEvent: SavedEvent = {
        eventId, listName: trimmed, savedAt,
        eventTitle: meta?.title,
        eventStartDate: meta?.startDate,
        eventEndDate: meta?.endDate,
      };
      const savedEvents = [
        ...storage.savedEvents.filter((s) => s.eventId !== eventId),
        newEvent,
      ];
      const isNew = !storage.customLists.includes(trimmed);
      const customLists = isNew
        ? [...storage.customLists, trimmed]
        : storage.customLists;

      persist({ ...storage, savedEvents, customLists });

      if (userIdRef.current) {
        syncSavedEvent(userIdRef.current, newEvent);
        if (isNew) syncCustomList(userIdRef.current, trimmed, customLists.length - 1);
      }
    },
    [storage, persist]
  );

  const getAllListNames = useCallback(
    () => storage.customLists,
    [storage.customLists]
  );

  const reorderCustomLists = useCallback(
    (newOrder: string[]) => {
      persist({ ...storage, customLists: newOrder });
      if (userIdRef.current) reorderCustomListsDB(userIdRef.current, newOrder);
    },
    [storage, persist]
  );

  // ── Misc ──────────────────────────────────────────────────

  const updateDisplayName = useCallback(
    (name: string) => {
      persist({ ...storage, userDisplayName: name });
      if (userIdRef.current) {
        if (storage.userProfile) {
          syncUserProfile(userIdRef.current, storage.userProfile, name);
        } else {
          syncDisplayName(userIdRef.current, name);
        }
      }
    },
    [storage, persist]
  );

  const addSharedWithYou = useCallback(
    (eventId: string) => {
      if (storage.sharedWithYou.some((s) => s.eventId === eventId)) return;
      const sharedWithYou: SharedWithYouEvent[] = [
        ...storage.sharedWithYou,
        { eventId, sharedAt: new Date().toISOString() },
      ];
      persist({ ...storage, sharedWithYou });
    },
    [storage, persist]
  );

  const signOut = useCallback(async () => {
    await clearLocalAuthState();
  }, [clearLocalAuthState]);

  // ── Context value ─────────────────────────────────────────

  const value = useMemo<UserContextValue>(
    () => ({
      ...storage,
      ready,
      setAuth,
      setUserProfile,
      addSavedEvent,
      removeSavedEvent,
      getSavedListForEvent,
      toggleGoing,
      isGoing,
      markCommitted,
      getGoingEvent,
      addCustomList,
      renameCustomList,
      deleteCustomList,
      reorderCustomLists,
      saveEventToNewList,
      getAllListNames,
      addSharedWithYou,
      updateDisplayName,
      signOut,
      refreshFromRemote,
    }),
    [
      storage, ready, setAuth, setUserProfile,
      addSavedEvent, removeSavedEvent, getSavedListForEvent,
      toggleGoing, isGoing, markCommitted, getGoingEvent, addCustomList, renameCustomList, deleteCustomList, reorderCustomLists, saveEventToNewList,
      getAllListNames, addSharedWithYou, updateDisplayName, signOut, refreshFromRemote,
    ]
  );

  return (
    <UserContext.Provider value={value}>{children}</UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within UserProvider");
  return ctx;
}

// ── Helpers ───────────────────────────────────────────────────

async function backfillSavedEventDates(data: SiftStorage): Promise<SiftStorage> {
  const needsBackfill = data.savedEvents.filter((s) => !s.eventStartDate);
  if (needsBackfill.length === 0) return data;

  const updated = await Promise.all(
    data.savedEvents.map(async (s) => {
      if (s.eventStartDate) return s;
      const local = localEvents.find((e) => e.id === s.eventId);
      if (local) {
        return {
          ...s,
          eventTitle: s.eventTitle || local.title,
          eventStartDate: local.startDate,
          eventEndDate: local.endDate,
        };
      }
      try {
        const db = await fetchEventById(s.eventId);
        if (db) {
          return {
            ...s,
            eventTitle: s.eventTitle || db.title,
            eventStartDate: db.startDate,
            eventEndDate: db.endDate,
          };
        }
      } catch {}
      return s;
    })
  );

  return { ...data, savedEvents: updated };
}
