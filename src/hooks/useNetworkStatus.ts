import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";

/**
 * Tracks connectivity. `isInternetReachable` can be null while probing, so we
 * treat only an explicit `false` as offline to avoid false-negative flashes.
 */
export function useNetworkStatus(): { isOnline: boolean } {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const evaluate = (state: { isConnected: boolean | null; isInternetReachable: boolean | null }) =>
      state.isConnected !== false && state.isInternetReachable !== false;

    // Guard against the native module being absent (e.g. a JS reload before a
    // native rebuild) — degrade to "online" rather than crashing the feed.
    try {
      NetInfo.fetch().then((state) => setIsOnline(evaluate(state))).catch(() => {});
      const unsubscribe = NetInfo.addEventListener((state) => setIsOnline(evaluate(state)));
      return () => unsubscribe();
    } catch {
      setIsOnline(true);
    }
  }, []);

  return { isOnline };
}
