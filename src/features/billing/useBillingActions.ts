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
      amountKobo,
      reason,
    }: {
      invoiceId: string;
      amountKobo: number;
      reason: string;
    }) => {
      const { error } = await supabase.rpc('apply_discount', {
        p_invoice_id: invoiceId,
        p_amount_kobo: amountKobo,
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
      unitPriceKobo,
      reason,
    }: {
      invoiceId: string;
      description: string;
      quantity: number;
      unitPriceKobo: number;
      reason: string;
    }) => {
      const { data, error } = await supabase.rpc('add_invoice_line', {
        p_invoice_id: invoiceId,
        p_description: description,
        p_quantity: quantity,
        p_unit_price_kobo: unitPriceKobo,
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
      return data as {
        total_billed_kobo: number;
        total_collected_kobo: number;
        total_outstanding_kobo: number;
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
      return data as { method: string; payment_count: number; total_kobo: number }[];
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
