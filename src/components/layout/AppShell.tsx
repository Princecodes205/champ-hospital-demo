import React from 'react';
import { Button } from '../ui/Button';

interface NavItemProps {
  label: string;
  icon: any; // Using any for simplicity since we aren't using a full icon lib here
  href: string;
  active?: boolean;
  onClick?: () => void;
}

const NavItem = ({ label, icon: _Icon, href, active, onClick }: NavItemProps) => (
  <a
    href={href}
    onClick={(e) => {
      e.preventDefault();
      window.history.pushState({}, '', href);
      window.dispatchEvent(new PopStateEvent('popstate'));
      if (onClick) onClick();
    }}
    className={`
      flex items-center gap-3 px-3 py-2 rounded-control text-sm font-medium transition-colors
      ${active ? 'bg-primary text-primary-foreground' : 'text-foreground/70 hover:bg-muted hover:text-foreground'}
    `}
  >
    <div className="w-4 h-4 bg-current opacity-50 rounded-sm" />
    <span>{label}</span>
  </a>
);

export const AppShell = ({ children, user, onSignOut }: { children: React.ReactNode, user: any, onSignOut: () => void }) => {
  const currentPath = window.location.pathname;

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex flex-col w-64 border-r bg-card p-4">
        <div className="flex items-center gap-2 px-3 mb-8">
          <div className="w-8 h-8 bg-primary rounded-sm flex items-center justify-center text-white font-bold">C</div>
          <span className="font-bold tracking-tight">Champ Hospital</span>
        </div>

        <nav className="flex-1 flex flex-col gap-1">
          {user.role === 'owner' && (
            <>
              <NavItem label="Overview" icon={null} href="/overview" active={currentPath === '/overview'} />
              <NavItem label="Staff" icon={null} href="/staff" active={currentPath === '/staff'} />
              <NavItem label="Queue" icon={null} href="/queue" active={currentPath === '/queue'} />
              <NavItem label="Patients" icon={null} href="/patients" active={currentPath === '/patients'} />
            </>
          )}
          {(user.role === 'doctor' || user.role === 'nurse') && (
            <>
              <NavItem label="Queue" icon={null} href="/queue" active={currentPath === '/queue'} />
              <NavItem label="Patients" icon={null} href="/patients" active={currentPath === '/patients'} />
            </>
          )}
        </nav>

        <div className="mt-auto pt-4 border-t">
          <div className="flex items-center gap-3 px-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
              {user.full_name?.charAt(0)}
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-medium truncate">{user.full_name}</span>
              <span className="text-xs text-muted-foreground capitalize">{user.role}</span>
            </div>
          </div>
          <Button variant="ghost" className="w-full justify-start gap-3 text-sm" onClick={onSignOut}>
            <div className="w-4 h-4 bg-foreground/20 rounded-sm" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b bg-card flex items-center justify-between px-4 lg:hidden">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-sm flex items-center justify-center text-white font-bold">C</div>
            <span className="font-bold tracking-tight">Champ Hospital</span>
          </div>
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
            {user.full_name?.charAt(0)}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-8">
          {children}
        </div>

        {/* Bottom Nav - Mobile */}
        <nav className="lg:hidden border-t bg-card h-16 flex items-center justify-around px-2">
          {user.role === 'owner' ? (
            <>
              <NavItem label="Overview" icon={null} href="/overview" active={currentPath === '/overview'} />
              <NavItem label="Staff" icon={null} href="/staff" active={currentPath === '/staff'} />
              <NavItem label="Queue" icon={null} href="/queue" active={currentPath === '/queue'} />
              <NavItem label="Patients" icon={null} href="/patients" active={currentPath === '/patients'} />
            </>
          ) : (
            <>
              <NavItem label="Queue" icon={null} href="/queue" active={currentPath === '/queue'} />
              <NavItem label="Patients" icon={null} href="/patients" active={currentPath === '/patients'} />
            </>
          )}
        </nav>
      </main>
    </div>
  );
};
