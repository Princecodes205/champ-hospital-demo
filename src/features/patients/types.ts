import { z } from 'zod';

export const patientSchema = z.object({
  full_name: z.string().min(2, 'Full name is required'),
  sex: z.enum(['Male', 'Female', 'Other']),
  date_of_birth: z.string().optional(),
  age: z.number().optional(),
  dob_is_estimated: z.boolean().default(false),
  phone: z.string().min(1, 'Phone number is required'),
  address: z.string().optional(),
  next_of_kin_name: z.string().optional(),
  next_of_kin_phone: z.string().optional(),
  blood_group: z.string().optional(),
  genotype: z.string().optional(),
  allergies: z.string().optional(),
});

export type PatientInput = z.infer<typeof patientSchema>;

export interface Patient extends PatientInput {
  id: string;
  patient_number: string;
  created_at: string;
  updated_at: string;
}
