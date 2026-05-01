import { useEffect } from "react";
import { useRouter } from "expo-router";

/**
 * Catch-all route for unmatched URLs.
 * Handles expo-share-intent deeplinks (sift://dataUrl=siftShareKey)
 * which Expo Router can't resolve as file-system routes.
 * The ShareIntentProvider handles the actual data extraction;
 * this just prevents the "unmatched route" error.
 */
export default function UnmatchedRoute() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to discover tab — ShareIntentHandler in _layout.tsx
    // will pick up the share intent data and navigate to /add-event
    router.replace("/(tabs)/discover");
  }, []);

  return null;
}
