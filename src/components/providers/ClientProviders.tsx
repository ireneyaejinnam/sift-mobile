import { ToastProvider } from "@/components/ui/Toast";
import { UserProvider } from "@/context/UserContext";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <ToastProvider>{children}</ToastProvider>
    </UserProvider>
  );
}
