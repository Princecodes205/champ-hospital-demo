import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { Visit } from './types';

export const useVisit = (visitId: string) => {
  const queryClient = useQueryClient();

  const { data: visit, isLoading: visitLoading } = useQuery({
    queryKey: ['visit', visitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('visits')
        .select('*, patients(*)')
        .eq('id', visitId)
        .single();
      if (error) throw error;
      return data as Visit & { patients: any };
    },
  });

  const { data: vitals, isLoading: vitalsLoading } = useQuery({
    queryKey: ['visit-vitals', visitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vitals')
        .select('*')
        .eq('visit_id', visitId)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    enabled: !!visit,
  });

  const { data: consultation, isLoading: consultLoading } = useQuery({
    queryKey: ['visit-consultation', visitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('consultations')
        .select('*')
        .eq('visit_id', visitId)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    enabled: !!visit,
  });

  const { data: prescriptions, isLoading: presLoading } = useQuery({
    queryKey: ['visit-prescriptions', visitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('prescription_items')
        .select('*, drugs(*)')
        .eq('visit_id', visitId);
      if (error) throw error;
      return data;
    },
    enabled: !!visit,
  });

  const saveVitalsMutation = useMutation({
    mutationFn: async (vitalsData: any) => {
      // Get the current user ID directly from Supabase auth to guarantee it's not null
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;

      if (!userId) {
        throw new Error("User session not found. Please log in again.");
      }

      const { recorded_by: _, ...vitals } = vitalsData;

      const cleanVitals = {
        visit_id: visitId,
        temperature_c: vitals.temperature_c === '' ? null : parseFloat(vitals.temperature_c),
        bp_systolic: vitals.bp_systolic === '' ? null : parseInt(vitals.bp_systolic),
        bp_diastolic: vitals.bp_diastolic === '' ? null : parseInt(vitals.bp_diastolic),
        pulse_bpm: vitals.pulse_bpm === '' ? null : parseInt(vitals.pulse_bpm),
        respiratory_rate: vitals.respiratory_rate === '' ? null : parseInt(vitals.respiratory_rate),
        spo2_percent: vitals.spo2_percent === '' ? null : parseInt(vitals.spo2_percent),
        weight_kg: vitals.weight_kg === '' ? null : parseFloat(vitals.weight_kg),
        height_cm: vitals.height_cm === '' ? null : parseFloat(vitals.height_cm),
        recorded_by: userId,
        recorded_at: new Date().toISOString(),
      };

      const { error: vitalsError } = await supabase
        .from('vitals')
        .upsert(cleanVitals);

      if (vitalsError) throw vitalsError;

      const { error: statusError } = await supabase
        .from('visits')
        .update({ status: 'waiting_doctor', updated_at: new Date().toISOString() })
        .eq('id', visitId);

      if (statusError) throw statusError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visit-vitals', visitId] });
      queryClient.invalidateQueries({ queryKey: ['visits', 'queue'] });
    },
  });

  const startConsultationMutation = useMutation({
    mutationFn: async (doctorId: string) => {
      const { error } = await supabase.rpc('begin_consultation', {
        p_visit_id: visitId,
        p_doctor_id: doctorId
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visit', visitId] });
      queryClient.invalidateQueries({ queryKey: ['visits', 'queue'] });
    },
  });

  const completeVisitMutation = useMutation({
    mutationFn: async (consultationData: any) => {
      const { error } = await supabase.rpc('complete_visit_v2', {
        p_visit_id: visitId,
        p_history: consultationData.history,
        p_examination: consultationData.examination,
        p_diagnosis: consultationData.diagnosis,
        p_plan: consultationData.plan,
        p_doctor_id: consultationData.doctor_id,
        p_prescriptions: JSON.stringify(consultationData.prescriptions || []),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visit', visitId] });
      queryClient.invalidateQueries({ queryKey: ['visits', 'queue'] });
      queryClient.invalidateQueries({ queryKey: ['visit-consultation', visitId] });
      queryClient.invalidateQueries({ queryKey: ['visit-prescriptions', visitId] });
    },
  });

  const cancelVisitMutation = useMutation({
    mutationFn: async (reason: string) => {
      const { error } = await supabase
        .from('visits')
        .update({
          status: 'cancelled',
          cancel_reason: reason,
          updated_at: new Date().toISOString()
        })
        .eq('id', visitId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visit', visitId] });
      queryClient.invalidateQueries({ queryKey: ['visits', 'queue'] });
    },
  });

  return {
    visit,
    vitals,
    consultation,
    prescriptions,
    isLoading: visitLoading || vitalsLoading || consultLoading || presLoading,
    saveVitals: saveVitalsMutation.mutateAsync,
    beginConsultation: startConsultationMutation.mutateAsync,
    completeVisit: completeVisitMutation.mutateAsync,
    cancelVisit: cancelVisitMutation.mutateAsync,
    isSaving: saveVitalsMutation.isPending || startConsultationMutation.isPending || completeVisitMutation.isPending || cancelVisitMutation.isPending,
  };

};
