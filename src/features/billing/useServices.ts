import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { Service } from './types';

export const useServices = () => {
  return useQuery({
    queryKey: ['services'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .order('is_visit_fee', { ascending: false })
        .order('name', { ascending: true });
      if (error) throw error;
      // The live database still uses `unit_price_kobo` (migration 0010 has not been applied).
      return (data ?? []).map(s => ({
        ...s,
        unit_price_naira: (s as any).unit_price_kobo,
      })) as Service[];
    },
  });
};

export const useCreateService = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (service: {
      name: string;
      unit_price_naira: number;
      is_visit_fee: boolean;
    }) => {
      const { data, error } = await supabase
        .from('services')
        .insert({
          name: service.name,
          unit_price_kobo: service.unit_price_naira,
          is_visit_fee: service.is_visit_fee,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
    },
  });
};

export const useUpdateService = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Service>;
    }) => {
      const { data, error } = await supabase
        .from('services')
        .update({
          ...updates,
          ...(updates.unit_price_naira !== undefined
            ? { unit_price_kobo: updates.unit_price_naira }
            : {}),
          unit_price_naira: undefined,
        })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
    },
  });
};

export const useVisitCharges = (visitId: string) => {
  return useQuery({
    queryKey: ['visit-charges', visitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('visit_charges')
        .select('*, services(name)')
        .eq('visit_id', visitId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      // The live database still uses `unit_price_kobo` (migration 0010 has not been applied).
      return (data ?? []).map(c => ({
        ...c,
        unit_price_naira: (c as any).unit_price_kobo,
      })) as (VisitChargeRow & { services: { name: string } })[];
    },
    enabled: !!visitId,
  });
};

export const useAddVisitCharge = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      visitId,
      serviceId,
      quantity,
    }: {
      visitId: string;
      serviceId: string;
      quantity: number;
    }) => {
      const { data, error } = await supabase.rpc('add_visit_charge', {
        p_visit_id: visitId,
        p_service_id: serviceId,
        p_quantity: quantity,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['visit-charges', variables.visitId] });
    },
  });
};

interface VisitChargeRow {
  id: string;
  visit_id: string;
  service_id: string;
  quantity: number;
  unit_price_naira: number;
  added_by: string;
  created_at: string;
}
