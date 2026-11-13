import React, { useState } from 'react';
import { Button } from '../ui/Button';

interface NavItemProps {
  label: string;
  icon: any;
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

export const AppShell = ({ children, user, onSignOut, isSigningOut }: { children: React.ReactNode, user: any, onSignOut: () => void, isSigningOut?: boolean }) => {
  const currentPath = window.location.pathname;
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navLinks = user.role === 'owner' ? [
    { label: 'Overview', href: '/overview' },
    { label: 'Staff', href: '/staff' },
    { label: 'Queue', href: '/queue' },
    { label: 'Patients', href: '/patients' },
    { label: 'Invoices', href: '/invoices' },
    { label: 'Services', href: '/services' },
    { label: 'Settings', href: '/settings' },
  ] : [
    { label: 'Queue', href: '/queue' },
    { label: 'Patients', href: '/patients' },
    { label: 'Invoices', href: '/invoices' },
  ];

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden relative">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex flex-col w-64 border-r bg-card p-4">
        <div className="flex items-center gap-2 px-3 mb-8">
          <div className="w-8 h-8 bg-primary rounded-sm flex items-center justify-center text-white font-bold">C</div>
          <span className="font-bold tracking-tight">Champ Hospital</span>
        </div>

        <nav className="flex-1 flex flex-col gap-1">
          {navLinks.map(link => (
            <NavItem key={link.href} label={link.label} icon={null} href={link.href} active={currentPath === link.href} />
          ))}
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
          <Button variant="ghost" className="w-full justify-start gap-3 text-sm" onClick={onSignOut} isLoading={isSigningOut} disabled={isSigningOut}>
            <div className="w-4 h-4 bg-foreground/20 rounded-sm" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Mobile Menu Drawer */}
      <div className={`
        fixed inset-0 z-50 transition-opacity duration-300 lg:hidden
        ${isMobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
      `}>
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/50" onClick={() => setIsMobileMenuOpen(false)} />

        {/* Menu Content */}
        <aside className={`
          absolute left-0 top-0 h-full w-72 bg-card border-r p-4 transition-transform duration-300
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2 px-3">
              <div className="w-8 h-8 bg-primary rounded-sm flex items-center justify-center text-white font-bold">C</div>
              <span className="font-bold tracking-tight">Champ Hospital</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setIsMobileMenuOpen(false)}>✕</Button>
          </div>

          <nav className="flex flex-col gap-1">
            {navLinks.map(link => (
              <NavItem
                key={link.href}
                label={link.label}
                icon={null}
                href={link.href}
                active={currentPath === link.href}
                onClick={() => setIsMobileMenuOpen(false)}
              />
            ))}
          </nav>

          <div className="mt-auto absolute bottom-8 left-4 right-4 pt-4 border-t">
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
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b bg-card flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden p-2 h-9 w-9"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <div className="flex flex-col gap-1 w-5">
                <div className="h-0.5 w-full bg-foreground/70 rounded-full" />
                <div className="h-0.5 w-full bg-foreground/70 rounded-full" />
                <div className="h-0.5 w-full bg-foreground/70 rounded-full" />
              </div>
            </Button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-sm flex items-center justify-center text-white font-bold">C</div>
              <span className="font-bold tracking-tight">Champ Hospital</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
              {user.full_name?.charAt(0)}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
};
