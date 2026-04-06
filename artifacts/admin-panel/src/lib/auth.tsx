import { useEffect } from "react";
import { useLocation } from "wouter";
import { useGetAdminMe } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";

export function useAuth() {
  const [, setLocation] = useLocation();

  const logout = () => {
    localStorage.removeItem("token");
    setLocation("/login");
  };

  const login = (token: string) => {
    localStorage.setItem("token", token);
    setLocation("/dashboard");
  };

  return { logout, login };
}

export function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const [, setLocation] = useLocation();
  const token = localStorage.getItem("token");
  
  // Use generated API hook to check current session
  const { data: admin, isLoading, isError } = useGetAdminMe({
    query: {
      retry: false,
      staleTime: 5 * 60 * 1000,
      enabled: !!token,
    }
  });

  useEffect(() => {
    if (!token || isError) {
      localStorage.removeItem("token");
      setLocation("/login");
    }
  }, [token, isError, setLocation]);

  if (!token) return null;

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground font-medium animate-pulse">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (!admin) return null;

  return <Component />;
}
