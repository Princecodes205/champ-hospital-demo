import React from 'react';
import { Button } from '../ui/Button';

export const AppShell = ({ children, user, onSignOut }: { children: React.ReactNode, user: any, onSignOut: () => void }) => {
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
              <a href="/overview" className="flex items-center gap-3 px-3 py-2 rounded-control text-sm font-medium transition-colors bg-primary text-primary-foreground">
                <div className="w-4 h-4 bg-white/20 rounded-sm" />
                Overview
              </a>
              <a href="/staff" className="flex items-center gap-3 px-3 py-2 rounded-control text-sm font-medium transition-colors text-foreground/70 hover:bg-muted hover:text-foreground">
                <div className="w-4 h-4 bg-foreground/20 rounded-sm" />
                Staff
              </a>
            </>
          )}
          {(user.role === 'doctor' || user.role === 'nurse') && (
            <a href="/home" className="flex items-center gap-3 px-3 py-2 rounded-control text-sm font-medium transition-colors bg-primary text-primary-foreground">
              <div className="w-4 h-4 bg-white/20 rounded-sm" />
              Home
            </a>
          )}
        </nav>

        <div className="mt-auto pt-4 border-t">
          <div className="flex items-center gap-3 px-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
              {user.full_name.charAt(0)}
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
            {user.full_name.charAt(0)}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-8">
          {children}
        </div>

        {/* Bottom Nav - Mobile */}
        <nav className="lg:hidden border-t bg-card h-16 flex items-center justify-around px-2">
          {user.role === 'owner' ? (
            <>
              <a href="/overview" className="flex flex-col items-center justify-center w-full h-full text-xs font-medium transition-colors bg-primary text-primary-foreground">
                <div className="w-4 h-4 bg-white/20 rounded-sm mb-1" />
                Overview
              </a>
              <a href="/staff" className="flex flex-col items-center justify-center w-full h-full text-xs font-medium transition-colors text-foreground/70 hover:bg-muted hover:text-foreground">
                <div className="w-4 h-4 bg-foreground/20 rounded-sm mb-1" />
                Staff
              </a>
            </>
          ) : (
            <a href="/home" className="flex flex-col items-center justify-center w-full h-full text-xs font-medium transition-colors bg-primary text-primary-foreground">
              <div className="w-4 h-4 bg-white/20 rounded-sm mb-1" />
              Home
            </a>
          )}
        </nav>
      </main>
    </div>
  );
};
