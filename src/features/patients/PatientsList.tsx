import { useState } from 'react';
import { Button, Input, Table, EmptyState, LoadingSpinner } from '../../components/ui';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { Patient } from './types';

export const PatientsList = ({ onRegisterClick, onPatientClick }: { onRegisterClick: () => void, onPatientClick: (id: string) => void }) => {
  const [search, setSearch] = useState('');

  const { data: patients, isLoading } = useQuery({
    queryKey: ['patients', search],
    queryFn: async () => {
      let query = supabase.from('patients').select('*');

      if (search) {
        query = query.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%,patient_number.ilike.%${search}%`);
      }

      const { data, error } = await query.order('created_at', { ascending: false }).limit(25);
      if (error) {
        console.error('Error fetching patients:', error);
        throw error;
      }
      return data as Patient[];
    },
    placeholderData: (previousData) => previousData,
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
    gcTime: 1000 * 60 * 60 * 24, // Keep in memory for 24h
    refetchOnWindowFocus: false, // STOP searching for data when switching tabs
    refetchOnMount: false, // STOP searching for data when entering the page
  });

  const columns = [
    { header: 'Patient No.', accessor: 'patient_number' },
    { header: 'Full Name', accessor: 'full_name' },
    { header: 'Phone', accessor: 'phone' },
    { header: 'Sex', accessor: 'sex' },
    { header: 'DOB', accessor: 'date_of_birth' },
  ];

  const tableData = patients?.map(p => ({
    ...p,
    full_name: (
      <div className="flex flex-col cursor-pointer hover:text-primary" onClick={() => onPatientClick(p.id)}>
        <span className="font-medium">{p.full_name}</span>
      </div>
    ),
  })) || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Patients</h1>
          <p className="text-sm text-muted-foreground">Manage and register hospital patients</p>
        </div>
        <Button onClick={onRegisterClick}>Register Patient</Button>
      </div>

      <div className="flex items-center gap-3">
        <Input
          placeholder="Search by name, phone or patient number..."
          className="max-w-md"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : patients?.length === 0 ? (
        <EmptyState
          title="No patients found"
          description="Try adjusting your search or register a new patient."
          action={<Button onClick={onRegisterClick}>Register Patient</Button>}
        />
      ) : (
        <Table columns={columns} data={tableData} />
      )}
    </div>
  );
};
