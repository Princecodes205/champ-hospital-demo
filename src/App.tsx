import { useState, useEffect } from 'react';
import { LoginPage } from './features/auth/LoginPage';
import { AppShell } from './components/layout/AppShell';
import { StaffPage } from './features/staff/StaffPage';
import { OverviewPage, HomePage } from './features/common/Placeholders';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { SessionProvider } from './app/SessionProvider';
import { PatientsList, RegisterPatientDialog, PatientProfile } from './features/patients';
import { QueuePage, VisitPage } from './features/visits';
import { InvoicesList, InvoicePage, ServicesPage, HospitalSettingsPage, ReceiptPage } from './features/billing';
import { supabase } from './lib/supabase';
import { ToastProvider } from './components/ui/Feedback';
import './styles/tokens.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [selectedPatient, setSelectedPatient] = useState<string | null>(null);
  const [selectedVisit, setSelectedVisit] = useState<string | null>(null);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const user = session.user;

        // Dynamic Profile Sync: Check if profile exists
        let { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (!profile) {
          const metadata = user.user_metadata || {};
          const { data: newProfile, error } = await supabase.from('profiles').insert({
            id: user.id,
            username: metadata.username || `user_${user.id.slice(0, 8)}`,
            full_name: metadata.full_name || 'Staff Member',
            role: metadata.role || 'nurse',
          }).select().single();

          if (!error) profile = newProfile;
        }

        if (profile) {
          setUser(profile);
          // CRITICAL FIX: Set userId on window for legacy components to access
          (window as any).userId = user.id;
        }
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
      <ToastProvider>
        <SessionProvider queryClient={queryClient}>
          <ErrorBoundary>
            <AppShell user={user} onSignOut={handleSignOut}>
            {currentPath === '/overview' && <OverviewPage />}
            {currentPath === '/staff' && (user.role === 'owner' ? <StaffPage /> : <div className="p-4 text-red-500">Unauthorized</div>)}
            {currentPath === '/patients' && (
              <PatientsList
                onRegisterClick={() => setIsRegisterOpen(true)}
                onPatientClick={(id) => { setSelectedPatient(id); setCurrentPath('/patient-profile'); }}
              />
            )}
            {currentPath === '/patient-profile' && (
              <PatientProfile
                patientId={selectedPatient || ''}
                onStartVisit={(visitId) => { setSelectedVisit(visitId); setCurrentPath('/visit'); }}
              />
            )}
            {currentPath === '/queue' && <QueuePage onVisitClick={(id) => { setSelectedVisit(id); setCurrentPath('/visit'); }} />}
            {currentPath === '/invoices' && <InvoicesList />}
            {currentPath === '/invoice/:id' && <InvoicePage />}
            {currentPath === '/services' && (user.role === 'owner' ? <ServicesPage /> : <div className="p-4 text-red-500">Unauthorized</div>)}
            {currentPath === '/settings' && (user.role === 'owner' ? <HospitalSettingsPage /> : <div className="p-4 text-red-500">Unauthorized</div>)}
            {currentPath === '/receipt/:id' && <ReceiptPage />}
            {currentPath === '/visit' && <VisitPage visitId={selectedVisit || ''} userRole={user.role} />}
            {currentPath === '/home' && (user.role !== 'owner' ? <HomePage /> : <div className="p-4 text-red-500">Unauthorized</div>)}
            {!['/overview', '/staff', '/patients', '/patient-profile', '/queue', '/visit', '/invoices', '/invoice/:id', '/services', '/settings', '/receipt/:id', '/home'].includes(currentPath) ? (
              user.role === 'owner' ? <OverviewPage /> : <HomePage />
            ) : null}

            {isRegisterOpen && (
              <RegisterPatientDialog
                isOpen={isRegisterOpen}
                onClose={() => setIsRegisterOpen(false)}
                onSuccess={() => {}}
              />
            )}
          </AppShell>
        </ErrorBoundary>
      </SessionProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
