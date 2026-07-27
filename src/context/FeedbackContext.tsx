import { createContext, useCallback, useContext, useState } from "react";

interface FeedbackContextValue {
  /** Increments each time feedback is requested on demand. */
  manualOpenCount: number;
  /** Open the in-app feedback modal on demand (e.g. from Settings). */
  promptFeedback: () => void;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [manualOpenCount, setManualOpenCount] = useState(0);
  const promptFeedback = useCallback(() => setManualOpenCount((c) => c + 1), []);

  return (
    <FeedbackContext.Provider value={{ manualOpenCount, promptFeedback }}>
      {children}
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback must be used within a FeedbackProvider");
  return ctx;
}
