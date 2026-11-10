import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
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

      return {
        invoices: data as Invoice[],
        count: count ?? 0,
      };
    },
  });
};

export const useInvoice = (invoiceId: string) => {
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

      return {
        invoice: invoice as Invoice & {
          patients: { full_name: string; patient_number: string };
        },
        items: items as InvoiceItem[],
        payments: payments as Payment[],
      };
    },
    enabled: !!invoiceId,
  });
};
