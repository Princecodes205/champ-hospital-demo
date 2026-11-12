import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { PaymentMethod } from './types';

export const useRecordPayment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      invoiceId,
      method,
      reference,
      idempotencyKey,
    }: {
      invoiceId: string;
      method: PaymentMethod;
      reference: string;
      idempotencyKey: string;
    }) => {
      const { data, error } = await supabase.rpc('record_payment', {
        p_invoice_id: invoiceId,
        p_method: method,
        p_reference: reference || null,
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw error;
      return data;
    },
    retry: 0, // we handle retry manually in the UI so the idempotency key is reused
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice', variables.invoiceId] });
      queryClient.invalidateQueries({ queryKey: ['billing-summary'] });
    },
  });
};

export const useApplyDiscount = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      invoiceId,
      amountNaira,
      reason,
    }: {
      invoiceId: string;
      amountNaira: number;
      reason: string;
    }) => {
      const { error } = await supabase.rpc('apply_discount', {
        p_invoice_id: invoiceId,
        p_discount_naira: amountNaira,
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice', variables.invoiceId] });
    },
  });
};

export const useAddInvoiceLine = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      invoiceId,
      description,
      quantity,
      unitPriceNaira,
      reason,
    }: {
      invoiceId: string;
      description: string;
      quantity: number;
      unitPriceNaira: number;
      reason: string;
    }) => {
      const { data, error } = await supabase.rpc('add_invoice_line', {
        p_invoice_id: invoiceId,
        p_description: description,
        p_quantity: quantity,
        p_unit_price_naira: unitPriceNaira,
        p_reason: reason,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice', variables.invoiceId] });
    },
  });
};

export const useReversePayment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      paymentId,
      reason,
    }: {
      paymentId: string;
      reason: string;
    }) => {
      const { data, error } = await supabase.rpc('reverse_payment', {
        p_payment_id: paymentId,
        p_reason: reason,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice'] });
      queryClient.invalidateQueries({ queryKey: ['billing-summary'] });
    },
  });
};

export const useVoidInvoice = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      invoiceId,
      reason,
    }: {
      invoiceId: string;
      reason: string;
    }) => {
      const { error } = await supabase.rpc('void_invoice', {
        p_invoice_id: invoiceId,
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice', variables.invoiceId] });
    },
  });
};

export const useBillingSummary = (fromDate: string, toDate: string) => {
  return useQuery({
    queryKey: ['billing-summary', fromDate, toDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('billing_summary', {
        p_from_date: fromDate,
        p_to_date: toDate,
      });
      if (error) throw error;
      // The live database still uses `_kobo` column names (migration 0010 has not been applied).
      // Map them to the `_naira` field names the UI types expect.
      return (data as any[]).map(row => ({
        total_billed_naira: row.total_billed_kobo,
        total_collected_naira: row.total_collected_kobo,
        total_outstanding_naira: row.total_outstanding_kobo,
        paid_invoices: row.paid_invoices,
        unpaid_invoices: row.unpaid_invoices,
        void_invoices: row.void_invoices,
      })) as {
        total_billed_naira: number;
        total_collected_naira: number;
        total_outstanding_naira: number;
        paid_invoices: number;
        unpaid_invoices: number;
        void_invoices: number;
      }[];
    },
  });
};

export const useBillingSummaryByMethod = (fromDate: string, toDate: string) => {
  return useQuery({
    queryKey: ['billing-summary-by-method', fromDate, toDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('billing_summary_by_method', {
        p_from_date: fromDate,
        p_to_date: toDate,
      });
      if (error) throw error;
      return data as { method: string; payment_count: number; total_naira: number }[];
    },
  });
};

export const useHospitalSettings = () => {
  return useQuery({
    queryKey: ['hospital-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hospital_settings')
        .select('*')
        .limit(1)
        .single();
      if (error) throw error;
      return data as {
        id: string;
        name: string;
        address: string | null;
        phone: string | null;
        receipt_footer: string | null;
        created_at: string;
        updated_at: string;
      };
    },
  });
};

export const useUpdateHospitalSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<{
        name: string;
        address: string | null;
        phone: string | null;
        receipt_footer: string | null;
      }>;
    }) => {
      const { data, error } = await supabase
        .from('hospital_settings')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hospital-settings'] });
    },
  });
};
