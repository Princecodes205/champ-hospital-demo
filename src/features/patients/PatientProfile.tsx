import { useState } from 'react';
import { Button, Badge, Table, Skeleton, EmptyState, useToast } from '../../components/ui';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { Patient } from './types';

export const PatientProfile = ({ patientId, onStartVisit }: { patientId: string, onStartVisit: (id: string) => void }) => {
  const [isStarting, setIsStarting] = useState(false);
  const { addToast } = useToast();
  const { data: patient, isLoading, error } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .eq('id', patientId)
        .single();
      if (error) throw error;
      return data as Patient;
    },
  });

  const handleStartVisit = async () => {
    setIsStarting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data: visitId, error: rpcError } = await supabase.rpc('start_visit', {
        p_patient_id: patientId,
        p_reason: 'General Consultation',
        p_user_id: user.id
      });

      if (rpcError) throw rpcError;
      if (!visitId) throw new Error('Failed to create visit');

      onStartVisit(visitId);
    } catch (err: any) {
      console.error('Error starting visit:', err);
      addToast(err.message || 'Failed to start visit.', 'error');
    } finally {
      setIsStarting(false);
    }
  };

  const { data: visits, isLoading: visitsLoading } = useQuery({
    queryKey: ['visits', patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('visits')
        .select('id, status, reason, created_at')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!patient,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-32 w-full rounded-card" />
        <div className="space-y-4">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (error || !patient) {
    return <EmptyState title="Patient not found" description="The requested patient record could not be located." />;
  }

  const columns = [
    { header: 'Date', accessor: 'created_at' },
    { header: 'Reason', accessor: 'reason' },
    { header: 'Status', accessor: 'status' },
  ];

  const visitTableData = visits?.map(v => ({
    ...v,
    created_at: new Date(v.created_at).toLocaleDateString(),
    status: <Badge variant={v.status === 'completed' ? 'success' : 'neutral'}>{v.status.replace('_', ' ')}</Badge>,
  })) || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{patient.full_name}</h1>
          <p className="text-muted-foreground font-medium">{patient.patient_number}</p>
        </div>
        <Button
          onClick={handleStartVisit}
          isLoading={isStarting}
        >
          Start New Visit
        </Button>
      </div>

      {/* Allergy Alert - Prominent block as per requirements */}
      {patient.allergies && (
        <div className="p-4 border-2 border-red-200 bg-red-50 rounded-card flex gap-3 items-start">
          <div className="text-red-600 font-bold text-lg">⚠️ Allergies:</div>
          <div className="text-red-700 font-medium">{patient.allergies}</div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-6">
          <section className="p-4 border rounded-card bg-card space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Demographics</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sex</span>
                <span className="font-medium">{patient.sex}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">DOB</span>
                <span className="font-medium">{patient.date_of_birth} {patient.dob_is_estimated && '(Est.)'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Phone</span>
                <span className="font-medium">{patient.phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Blood Group</span>
                <span className="font-medium">{patient.blood_group || 'Not recorded'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Genotype</span>
                <span className="font-medium">{patient.genotype || 'Not recorded'}</span>
              </div>
            </div>
          </section>

          <section className="p-4 border rounded-card bg-card space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Next of Kin</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name</span>
                <span className="font-medium">{patient.next_of_kin_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Phone</span>
                <span className="font-medium">{patient.next_of_kin_phone}</span>
              </div>
            </div>
          </section>
        </div>

        <div className="md:col-span-2 space-y-6">
          <section className="p-4 border rounded-card bg-card space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Visit History</h3>
            {visitsLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : visits?.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">No previous visits recorded.</div>
            ) : (
              <Table columns={columns} data={visitTableData} />
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
