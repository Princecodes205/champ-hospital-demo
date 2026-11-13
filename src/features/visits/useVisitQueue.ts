import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { VisitWithPatient } from './types';

export const useVisitQueue = () => {
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
    staleTime: 0, // Always refetch on invalidation — real-time drives freshness
    gcTime: 1000 * 60 * 60,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  return { visits, isLoading, error };
};
