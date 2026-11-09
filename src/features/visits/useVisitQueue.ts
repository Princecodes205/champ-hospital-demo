import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { VisitWithPatient } from './types';

export const useVisitQueue = () => {
  const queryClient = useQueryClient();
  const [realtimeError, setRealtimeError] = useState(false);

  const { data: visits, isLoading, error } = useQuery({
    queryKey: ['visits', 'queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('visits')
        .select('*, patients(*)')
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching visit queue:', error);
        throw error;
      }
      return data as VisitWithPatient[];
    },
    staleTime: 0, // Ensure data is refreshed more aggressively
    gcTime: 1000 * 60 * 60,
    refetchOnWindowFocus: true, // Refresh when user returns to the tab
    refetchOnMount: true, // Refresh when entering the page
    refetchInterval: realtimeError ? 30000 : false,
  });

  useEffect(() => {
    const channel = supabase
      .channel('visit-queue')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'visits',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['visits', 'queue'] });
        }
      )
      .subscribe((status) => {
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setRealtimeError(true);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return { visits, isLoading, error, isPolling: realtimeError };
};
