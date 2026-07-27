import { useEffect } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import { UserProvider } from "@/context/UserContext";
import { FeedbackProvider } from "@/context/FeedbackContext";
import { initAnalytics } from "@/lib/analytics";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initAnalytics();
  }, []);

  return (
    <UserProvider>
      <ToastProvider>
        <FeedbackProvider>{children}</FeedbackProvider>
      </ToastProvider>
    </UserProvider>
  );
}
