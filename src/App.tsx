import { useState, useEffect } from 'react';
import { LoginPage } from './features/auth/LoginPage';
import { AppShell } from './components/layout/AppShell';
import { StaffPage } from './features/staff/StaffPage';
import { OverviewPage, HomePage } from './features/common/Placeholders';
import { NotFoundPage } from './features/common/NotFoundPage';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { SessionProvider } from './app/SessionProvider';
import { supabase } from './lib/supabase';
import './styles/tokens.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        if (profile) setUser(profile);
      }
      setIsLoading(false);
    };
    initAuth();

    const handlePopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage onAuthSuccess={(profile) => setUser(profile)} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider queryClient={queryClient}>
        <ErrorBoundary>
          <AppShell user={user} onSignOut={handleSignOut}>
            {currentPath === '/overview' && <OverviewPage />}
            {currentPath === '/staff' && (user.role === 'owner' ? <StaffPage /> : <div className="p-4 text-red-500">Unauthorized</div>)}
            {currentPath === '/home' && (user.role !== 'owner' ? <HomePage /> : <div className="p-4 text-red-500">Unauthorized</div>)}
            {!['/overview', '/staff', '/home'].includes(currentPath) ? (
              user.role === 'owner' ? <OverviewPage /> : <HomePage />
            ) : null}
          </AppShell>
        </ErrorBoundary>
      </SessionProvider>
    </QueryClientProvider>
  );
}
