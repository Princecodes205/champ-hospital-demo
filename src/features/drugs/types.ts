import { z } from 'zod';

export const drugSchema = z.object({
  id: z.string(),
  name: z.string(),
  strength: z.string(),
  form: z.string(),
  unit_price_naira: z.number(),
  is_active: z.boolean(),
});

export type Drug = z.infer<typeof drugSchema>;

export const prescriptionItemSchema = z.object({
  drug_id: z.string(),
  dose: z.string().min(1, 'Dose is required'),
  frequency: z.string().min(1, 'Frequency is required'),
  duration: z.string().min(1, 'Duration is required'),
  quantity: z.number().int().positive('Quantity must be a positive integer'),
  instructions: z.string().optional(),
});

export type PrescriptionItem = z.infer<typeof prescriptionItemSchema>;
