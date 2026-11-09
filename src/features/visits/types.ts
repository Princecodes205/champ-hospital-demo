import { z } from 'zod';

export const visitStatusEnum = z.enum([
  'waiting_triage',
  'waiting_doctor',
  'in_consultation',
  'completed',
  'cancelled',
]);

export type VisitStatus = z.infer<typeof visitStatusEnum>;

export interface Visit {
  id: string;
  patient_id: string;
  status: VisitStatus;
  reason: string;
  assigned_doctor_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface VisitWithPatient extends Visit {
  patients: {
    full_name: string;
    patient_number: string;
    date_of_birth: string;
  };
}
