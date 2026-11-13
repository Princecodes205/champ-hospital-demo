import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useRealtimeResource } from '../../lib/useRealtimeResource';
import type { Invoice, InvoiceItem, Payment } from './types';

export interface InvoicesListParams {
  status?: string;
  search?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
}

export const useInvoices = (params: InvoicesListParams = {}) => {
  const {
    status,
    search,
    fromDate,
    toDate,
    page = 1,
    pageSize = 25,
  } = params;

  return useQuery({
    queryKey: ['invoices', status, search, fromDate, toDate, page, pageSize],
    queryFn: async () => {
      let query = supabase
        .from('invoices')
        .select('*, patients(full_name, patient_number)', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (status && status !== 'all') {
        query = query.eq('status', status);
      }
      if (fromDate) {
        query = query.gte('created_at', fromDate);
      }
      if (toDate) {
        query = query.lte('created_at', toDate);
      }
      if (search) {
        query = query.or(
          `invoice_number.ilike.%${search}%,patients.full_name.ilike.%${search}%,patients.patient_number.ilike.%${search}%`,
        );
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;

      // The live database still uses `_kobo` column names (migration 0010 has not been applied).
      // Map them to the `_naira` field names the UI types and components expect.
      const invoices = (data ?? []).map(inv => ({
        ...inv,
        subtotal_naira: (inv as any).subtotal_kobo,
        discount_naira: (inv as any).discount_kobo,
        total_naira: (inv as any).total_kobo,
        amount_paid_naira: (inv as any).amount_paid_kobo,
      })) as Invoice[];

      return {
        invoices,
        count: count ?? 0,
      };
    },
  });
};

export const useInvoice = (invoiceId: string) => {
  // ── Real-time: per-row subscriptions so this invoice page updates live ──
  // Each subscribes to exactly one row (id=eq.<id>), so a change only
  // invalidates this invoice's queries — never the whole table.
  // These run before the return so they are always registered (rules of hooks).
  useRealtimeResource('invoices', invoiceId, [['invoice', invoiceId]], true);
  useRealtimeResource(
    'invoice_items',
    invoiceId,
    [['invoice', invoiceId]],
    true,
    'invoice_id',
  );
  useRealtimeResource(
    'payments',
    invoiceId,
    [['invoice', invoiceId]],
    true,
    'invoice_id',
  );

  return useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: async () => {
      const { data: invoice, error } = await supabase
        .from('invoices')
        .select('*, patients(full_name, patient_number)')
        .eq('id', invoiceId)
        .single();
      if (error) throw error;

      const { data: items, error: itemsError } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('created_at', { ascending: true });
      if (itemsError) throw itemsError;

      const { data: payments, error: paymentsError } = await supabase
        .from('payments')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('created_at', { ascending: true });
      if (paymentsError) throw paymentsError;

      // The live database still uses `_kobo` column names (migration 0010 has not been applied).
      // Map them to the `_naira` field names the UI types and components expect.
      const mappedInvoice = {
        ...invoice,
        subtotal_naira: (invoice as any).subtotal_kobo,
        discount_naira: (invoice as any).discount_kobo,
        total_naira: (invoice as any).total_kobo,
        amount_paid_naira: (invoice as any).amount_paid_kobo,
      } as Invoice & {
        patients: { full_name: string; patient_number: string };
      };

      const mappedItems = (items ?? []).map(item => ({
        ...item,
        unit_price_naira: (item as any).unit_price_kobo,
        line_total_naira: (item as any).line_total_kobo,
      })) as InvoiceItem[];

      const mappedPayments = (payments ?? []).map(p => ({
        ...p,
        amount_naira: (p as any).amount_kobo,
      })) as Payment[];

      return {
        invoice: mappedInvoice,
        items: mappedItems,
        payments: mappedPayments,
      };
    },
    enabled: !!invoiceId,
  });
};
