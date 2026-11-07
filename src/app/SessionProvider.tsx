import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { QueryClient } from '@tanstack/react-query';

interface SessionContextType {
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextType | null>(null);

export const SessionProvider: React.FC<{ children: React.ReactNode, queryClient: QueryClient }> = ({ children, queryClient }) => {
  const SESSION_TIMEOUT_MS = 6 * 60 * 60 * 1000; // 6 hours
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const logout = async () => {
    await supabase.auth.signOut();
    queryClient.clear();
    window.location.href = '/';
  };

  const resetTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      console.log('Session expired due to inactivity.');
      logout();
    }, SESSION_TIMEOUT_MS);
  };

  useEffect(() => {
    // Events that count as activity
    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];

    const handleActivity = () => resetTimer();

    activityEvents.forEach(event => {
      window.addEventListener(event, handleActivity);
    });

    // Start the first timer
    resetTimer();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      activityEvents.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, []);

  return (
    <SessionContext.Provider value={{ logout }}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used within a SessionProvider');
  return context;
};
