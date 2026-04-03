import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
import { loadStorage, saveStorage, setOnboardingDoneFlag } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import { fetchEventById } from "@/lib/getEvents";
import { events as localEvents } from "@/data/events";

interface UserContextValue extends SiftStorage {
  ready: boolean;
  setAuth: (
    isLoggedIn: boolean,
    userEmail: string,
    userDisplayName?: string
  ) => void;
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
  addCustomList: (listName: string) => void;
  getAllListNames: () => string[];
  addSharedWithYou: (eventId: string) => void;
  updateDisplayName: (name: string) => void;
  signOut: () => Promise<void>;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [storage, setStorage] = useState<SiftStorage>(initialStorage);
  const [ready, setReady] = useState(false);

  // Load from AsyncStorage on mount + restore Supabase session
  useEffect(() => {
    loadStorage().then(async (data) => {
      // Check for existing Supabase session
      try {
        if (supabase) {
          const { data: sessionData } = await supabase.auth.getSession();
          if (sessionData.session?.user) {
            const user = sessionData.session.user;
            data = {
              ...data,
              isLoggedIn: true,
              userEmail: user.email ?? data.userEmail,
              userDisplayName:
                (user.user_metadata?.display_name as string) ?? data.userDisplayName,
            };
            // Returning user with saved profile — skip onboarding
            if (data.userProfile) {
              setOnboardingDoneFlag();
            }
          } else {
            // No active Supabase session — clear stale auth data (fixes guest mode showing old user info)
            data = {
              ...data,
              isLoggedIn: false,
              userEmail: "",
              userDisplayName: undefined,
            };
          }
        }
      } catch {
        // Supabase unavailable, use local storage as-is
      }

      // If user has a saved profile from a previous session, mark onboarding done
      if (data.userProfile) {
        setOnboardingDoneFlag();
      }

      // Backfill eventStartDate for saved events missing it
      const needsBackfill = data.savedEvents.filter((s) => !s.eventStartDate);
      if (needsBackfill.length > 0) {
        const updated = await Promise.all(
          data.savedEvents.map(async (s) => {
            if (s.eventStartDate) return s;
            // Try local data first
            const local = localEvents.find((e) => e.id === s.eventId);
            if (local) {
              return { ...s, eventTitle: s.eventTitle || local.title, eventStartDate: local.startDate, eventEndDate: local.endDate };
            }
            // Try Supabase
            try {
              const db = await fetchEventById(s.eventId);
              if (db) {
                return { ...s, eventTitle: s.eventTitle || db.title, eventStartDate: db.startDate, eventEndDate: db.endDate };
              }
            } catch {}
            return s;
          })
        );
        data = { ...data, savedEvents: updated };
        saveStorage(data);
      }

      setStorage(data);
      setReady(true);
    });

    // Listen for auth state changes (sign in/out from other tabs, token refresh)
    if (!supabase) return;

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          setStorage((prev) => ({
            ...prev,
            isLoggedIn: true,
            userEmail: session.user.email ?? prev.userEmail,
          }));
        } else {
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
  }, []);

  const persist = useCallback(
    (next: SiftStorage) => {
      setStorage(next);
      saveStorage(next);
    },
    []
  );

  const setAuth = useCallback(
    (
      isLoggedIn: boolean,
      userEmail: string,
      userDisplayName?: string
    ) => {
      persist({
        ...storage,
        isLoggedIn,
        userEmail,
        userDisplayName:
          userDisplayName !== undefined
            ? userDisplayName
            : storage.userDisplayName,
        createdAt:
          isLoggedIn && !storage.createdAt
            ? new Date().toISOString()
            : storage.createdAt,
      });
    },
    [storage, persist]
  );

  const setUserProfile = useCallback(
    (userProfile: UserProfile) => {
      persist({ ...storage, userProfile });
    },
    [storage, persist]
  );

  const addSavedEvent = useCallback(
    (eventId: string, listName: string, meta?: { title?: string; startDate?: string; endDate?: string }) => {
      const savedAt = new Date().toISOString();
      const savedEvents = [
        ...storage.savedEvents.filter((s) => s.eventId !== eventId),
        { eventId, listName, savedAt, eventTitle: meta?.title, eventStartDate: meta?.startDate, eventEndDate: meta?.endDate },
      ];
      persist({ ...storage, savedEvents });
    },
    [storage, persist]
  );

  const removeSavedEvent = useCallback(
    (eventId: string) => {
      const savedEvents = storage.savedEvents.filter(
        (s) => s.eventId !== eventId
      );
      persist({ ...storage, savedEvents });
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

  const toggleGoing = useCallback(
    (event: {
      eventId: string;
      eventTitle: string;
      eventDate: string;
      eventEndDate?: string;
    }): boolean => {
      const exists = storage.goingEvents.some(
        (e) => e.eventId === event.eventId
      );
      const markedAt = new Date().toISOString();
      let goingEvents: GoingEvent[];
      if (exists) {
        goingEvents = storage.goingEvents.filter(
          (e) => e.eventId !== event.eventId
        );
      } else {
        goingEvents = [
          ...storage.goingEvents,
          {
            eventId: event.eventId,
            eventTitle: event.eventTitle,
            eventDate: event.eventDate,
            eventEndDate: event.eventEndDate,
            markedAt,
          },
        ];
      }
      persist({ ...storage, goingEvents });
      return !exists;
    },
    [storage, persist]
  );

  const isGoing = useCallback(
    (eventId: string) =>
      storage.goingEvents.some((e) => e.eventId === eventId),
    [storage.goingEvents]
  );

  const addCustomList = useCallback(
    (listName: string) => {
      const trimmed = listName.trim();
      if (!trimmed || storage.customLists.includes(trimmed)) return;
      persist({
        ...storage,
        customLists: [...storage.customLists, trimmed],
      });
    },
    [storage, persist]
  );

  const getAllListNames = useCallback(() => {
    return [...DEFAULT_LISTS, ...storage.customLists];
  }, [storage.customLists]);

  const updateDisplayName = useCallback(
    (name: string) => {
      persist({ ...storage, userDisplayName: name });
    },
    [storage, persist]
  );

  const signOut = useCallback(async () => {
    try {
      if (supabase) await supabase.auth.signOut();
    } catch {
      // Supabase unavailable, just clear local state
    }
    persist({
      ...initialStorage,
      // Keep profile/preferences but clear auth
      userProfile: storage.userProfile,
    });
  }, [storage, persist]);

  const addSharedWithYou = useCallback(
    (eventId: string) => {
      if (storage.sharedWithYou.some((s) => s.eventId === eventId)) return;
      const sharedWithYou = [
        ...storage.sharedWithYou,
        { eventId, sharedAt: new Date().toISOString() },
      ];
      persist({ ...storage, sharedWithYou });
    },
    [storage, persist]
  );

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
      addCustomList,
      getAllListNames,
      addSharedWithYou,
      updateDisplayName,
      signOut,
    }),
    [
      storage,
      ready,
      setAuth,
      setUserProfile,
      addSavedEvent,
      removeSavedEvent,
      getSavedListForEvent,
      toggleGoing,
      isGoing,
      addCustomList,
      getAllListNames,
      addSharedWithYou,
      updateDisplayName,
      signOut,
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
