import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

/**
 * Subscribes to changes on a single database row (by id) and invalidates
 * the given query keys when the row changes.
 *
 * Used for detail pages (e.g. one visit page, one invoice page) so the
 * user sees live updates without refreshing, without refetching whole lists.
 *
 * One channel is opened per resource. Since a user typically has only one
 * or two detail pages open at a time, this stays lightweight.
 */
export const useRealtimeResource = (
  table: string,
  id: string | null,
  queryKeys: readonly unknown[][],
  enabled = true,
  filterColumn = 'id',
) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!id || !enabled) return;

    const channel = supabase
      .channel(`${table}-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: `${filterColumn}=eq.${id}`,
        },
        () => {
          // Invalidate each key when the row changes
          queryKeys.forEach((key) => {
            queryClient.invalidateQueries({ queryKey: key });
          });
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [table, id, enabled, queryClient, queryKeys, filterColumn]);
};
