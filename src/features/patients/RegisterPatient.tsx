import { useState } from 'react';
import { Button, Input, Dialog } from '../../components/ui';
import { patientSchema, type Patient, type PatientInput } from './types';
import { supabase } from '../../lib/supabase';
import { useQueryClient } from '@tanstack/react-query';

export const RegisterPatientDialog = ({ isOpen, onClose, onSuccess }: { isOpen: boolean, onClose: () => void, onSuccess: () => void }) => {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<Partial<PatientInput>>({
    sex: 'Male',
    dob_is_estimated: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // 1. Validation FIRST (Avoid unnecessary DB calls)
      const validatedData = patientSchema.parse(formData);

      // 2. Duplicate Check: Name OR Phone
      const trimmedName = formData.full_name?.trim() || '';
      const trimmedPhone = formData.phone?.trim() || '';

      // a) Strict Check: Phone number must be absolutely unique (Case-insensitive not applicable to numbers, but trim is)
      const { data: phoneDuplicate } = await supabase
        .from('patients')
        .select('id')
        .eq('phone', trimmedPhone)
        .maybeSingle();

      if (phoneDuplicate) {
        throw new Error('A patient with this phone number already exists.');
      }

      // b) Strict Check: Full Name must be unique (Case-Insensitive)
      // Use .ilike() to catch 'John Doe', 'john doe', 'JOHN DOE', etc.
      const { data: nameDuplicate } = await supabase
        .from('patients')
        .select('id')
        .ilike('full_name', trimmedName)
        .maybeSingle();

      if (nameDuplicate) {
        throw new Error('A patient with this name already exists.');
      }


      // 3. Unique Patient Number (PT-000001 style)
      const { data: lastPatient } = await supabase
        .from('patients')
        .select('patient_number')
        .order('patient_number', { ascending: false })
        .limit(1)
        .single();

      let nextNumber = 'PT-000001';
      if (lastPatient?.patient_number) {
        const numericPart = parseInt(lastPatient.patient_number.split('-')[1]);
        if (!isNaN(numericPart)) {
          nextNumber = `PT-${String(numericPart + 1).padStart(6, '0')}`;
        }
      }

      // 4. DATABASE INSERT FIRST (No Optimistic Update until server confirms)
      // Remove internal fields like 'age' before sending to DB
      const { age, ...dbData } = validatedData;

      const { error: insertError } = await supabase
        .from('patients')
        .insert([{ ...dbData, patient_number: nextNumber }]);

      if (insertError) throw insertError;

      // 5. Update Cache ONLY after successful insert
      const currentPatients = queryClient.getQueryData<Patient[]>(['patients', '']);
      if (currentPatients) {
        queryClient.setQueryData(['patients', ''], [
          {
            ...validatedData,
            patient_number: nextNumber,
            id: crypto.randomUUID(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          ...currentPatients
        ]);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      if (err.name === 'ZodError') {
        setError(err.errors[0].message);
      } else if (err instanceof Error) {
        // If it's a Supabase PostgREST error, it often has a detailed message in err.message
        setError(err.message);
      } else if (typeof err === 'string') {
        setError(err);
      } else {
        setError('An unexpected error occurred. Please check your connection or try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Register New Patient">
      <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto px-1">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Full Name"
            placeholder="e.g. Chidi Okoro"
            required
            value={formData.full_name || ''}
            onChange={e => setFormData({...formData, full_name: e.target.value})}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground/80">Sex</label>
            <select
              className="px-3 py-2 rounded-control border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              value={formData.sex}
              onChange={e => setFormData({...formData, sex: e.target.value as any})}
            >
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Input
              label="Date of Birth"
              type="date"
              value={formData.date_of_birth || ''}
              onChange={e => {
                setFormData({...formData, date_of_birth: e.target.value, dob_is_estimated: false});
              }}
            />
            <Input
              label="Or enter Age"
              type="number"
              placeholder="e.g. 25"
              value={formData.age || ''}
              onChange={e => {
                const age = parseInt(e.target.value);
                // Simple approximation: current year - age
                const year = new Date().getFullYear() - age;
                setFormData({
                  ...formData,
                  date_of_birth: `${year}-01-01`,
                  dob_is_estimated: true,
                  age: age
                });
              }}
            />
          </div>
          <div className="flex items-center gap-2 py-8">
            <input
              type="checkbox"
              id="dob_est"
              className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
              checked={formData.dob_is_estimated}
              onChange={e => setFormData({...formData, dob_is_estimated: e.target.checked})}
            />
            <label htmlFor="dob_est" className="text-sm text-foreground/80">Date of birth is estimated</label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Phone Number"
            placeholder="080... or +234..."
            required
            value={formData.phone || ''}
            onChange={e => setFormData({...formData, phone: e.target.value})}
          />
          <Input
            label="Address"
            placeholder="Street, City, State"
            value={formData.address || ''}
            onChange={e => setFormData({...formData, address: e.target.value})}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Next of Kin Name"
            required
            value={formData.next_of_kin_name || ''}
            onChange={e => setFormData({...formData, next_of_kin_name: e.target.value})}
          />
          <Input
            label="Next of Kin Phone"
            required
            value={formData.next_of_kin_phone || ''}
            onChange={e => setFormData({...formData, next_of_kin_phone: e.target.value})}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Blood Group"
            placeholder="e.g. O+"
            value={formData.blood_group || ''}
            onChange={e => setFormData({...formData, blood_group: e.target.value})}
          />
          <Input
            label="Genotype"
            placeholder="e.g. AA"
            value={formData.genotype || ''}
            onChange={e => setFormData({...formData, genotype: e.target.value})}
          />
        </div>

        <Input
          label="Allergies"
          placeholder="List any known allergies..."
          value={formData.allergies || ''}
          onChange={e => setFormData({...formData, allergies: e.target.value})}
        />

        {error && (
          <div className="p-3 rounded-control bg-red-50 text-red-600 text-xs font-medium border border-red-100">
            {error}
          </div>
        )}

        <Button type="submit" className="w-full" isLoading={isLoading}>
          Register Patient
        </Button>
      </form>
    </Dialog>
  );
};
