import { createContext, useContext, useEffect, useRef, useCallback } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

interface RealtimeContextType {
  invalidate: (queryKey: readonly unknown[]) => void;
}

const RealtimeContext = createContext<RealtimeContextType | null>(null);

/**
 * Debounced invalidation buffer.
 *
 * Multiple DB changes within the debounce window coalesce into a single
 * React Query invalidation, so a burst of writes (e.g. completing a visit
 * writes consultations, prescriptions, invoice items, invoice, and visit
 * status in quick succession) triggers exactly one refetch instead of five.
 */
const invalidationTimers = new Map<string, ReturnType<typeof setTimeout>>();

const debouncedInvalidate = (
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  delayMs = 500,
) => {
  const key = JSON.stringify(queryKey);

  if (invalidationTimers.has(key)) {
    clearTimeout(invalidationTimers.get(key)!);
  }

  const timer = setTimeout(() => {
    invalidationTimers.delete(key);
    queryClient.invalidateQueries({ queryKey });
  }, delayMs);

  invalidationTimers.set(key, timer);
};

/**
 * RealtimeProvider
 *
 * Owns a single shared Supabase Realtime channel for the whole app.
 * Every table that can affect the UI subscribes here. When a change
 * arrives, the relevant query keys are invalidated (debounced) so every
 * open tab sees the update without a manual refresh.
 *
 * Optimisation rules:
 *   - One channel total (not one per component).
 *   - Debounced invalidation per query key (coalesces burst writes).
 *   - Targeted row filters where possible (id=eq.xxx) so a subscriber only
 *     refetches the row they care about, not the whole table.
 *   - Auto cleanup on unmount.
 */
export const RealtimeProvider: React.FC<{
  children: React.ReactNode;
  queryClient: QueryClient;
}> = ({ children, queryClient }) => {
  const invalidate = useCallback(
    (queryKey: readonly unknown[]) => {
      debouncedInvalidate(queryClient, queryKey);
    },
    [queryClient],
  );

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const channel = supabase.channel('app-realtime');

    // ── Visits: any change refreshes the queue ──
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'visits' },
      () => {
        invalidate(['visits', 'queue']);
      },
    );

    // ── Vitals: affects the visit detail page ──
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'vitals' },
      (payload) => {
        const visitId = (payload.new as any)?.visit_id || (payload.old as any)?.visit_id;
        if (visitId) invalidate(['visit-vitals', visitId]);
      },
    );

    // ── Consultations: affects the visit detail page ──
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'consultations' },
      (payload) => {
        const visitId = (payload.new as any)?.visit_id || (payload.old as any)?.visit_id;
        if (visitId) invalidate(['visit-consultation', visitId]);
      },
    );

    // ── Prescription items: affects the visit detail page ──
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'prescription_items' },
      (payload) => {
        const visitId = (payload.new as any)?.visit_id || (payload.old as any)?.visit_id;
        if (visitId) invalidate(['visit-prescriptions', visitId]);
      },
    );

    // ── Visit charges: affects the visit detail page ──
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'visit_charges' },
      (payload) => {
        const visitId = (payload.new as any)?.visit_id || (payload.old as any)?.visit_id;
        if (visitId) invalidate(['visit-charges', visitId]);
        invalidate(['visits', 'queue']);
      },
    );

    // ── Invoices: any change refreshes the invoice list + detail ──
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'invoices' },
      (payload) => {
        const invoiceId =
          (payload.new as any)?.id || (payload.old as any)?.id;
        invalidate(['invoices']);
        if (invoiceId) invalidate(['invoice', invoiceId]);
      },
    );

    // ── Invoice items: line-item changes affect invoice totals ──
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'invoice_items' },
      (payload) => {
        const invoiceId =
          (payload.new as any)?.invoice_id || (payload.old as any)?.invoice_id;
        invalidate(['invoices']);
        if (invoiceId) invalidate(['invoice', invoiceId]);
      },
    );

    // ── Payments: a new payment settles an invoice ──
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'payments' },
      (payload) => {
        const invoiceId = (payload.new as any)?.invoice_id || (payload.old as any)?.invoice_id;
        invalidate(['invoices']);
        if (invoiceId) invalidate(['invoice', invoiceId]);
      },
    );

    // ── Services: price / name changes ripple to charges and invoices ──
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'services' },
      () => {
        invalidate(['services']);
        invalidate(['invoices']);
      },
    );

    // ── Patients: new patient or edit refreshes the patient list ──
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'patients' },
      () => {
        invalidate(['patients']);
      },
    );

    // ── Hospital settings: affects receipts and settings page ──
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'hospital_settings' },
      () => {
        invalidate(['hospital-settings']);
      },
    );

    channelRef.current = channel;

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        // eslint-disable-next-line no-console
        console.log('[Realtime] Connected');
      }
    });

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [queryClient, invalidate]);

  return (
    <RealtimeContext.Provider value={{ invalidate }}>
      {children}
    </RealtimeContext.Provider>
  );
};

export const useRealtime = (): RealtimeContextType => {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error('useRealtime must be used within a RealtimeProvider');
  }
  return context;
};
