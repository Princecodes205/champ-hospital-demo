export type InvoiceStatus = 'unpaid' | 'paid' | 'void';

export interface Invoice {
  id: string;
  patient_id: string;
  visit_id: string;
  invoice_number: string;
  status: InvoiceStatus;
  subtotal_kobo: number;
  discount_kobo: number;
  discount_reason: string | null;
  total_kobo: number;
  amount_paid_kobo: number;
  paid_at: string | null;
  paid_by: string | null;
  voided_at: string | null;
  voided_reason: string | null;
  voided_by: string | null;
  void_reason: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price_kobo: number;
  line_total_kobo: number;
  source: 'visit_fee' | 'service' | 'drug' | 'manual';
  prescription_item_id: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  invoice_id: string;
  receipt_number: string | null;
  amount_kobo: number;
  method: 'cash' | 'transfer' | 'pos';
  reference: string | null;
  idempotency_key: string;
  reversed: boolean;
  reversed_at: string | null;
  reversed_reason: string | null;
  reversed_by: string | null;
  received_by: string;
  paid_at: string;
  created_by: string;
  created_at: string;
}

export interface Service {
  id: string;
  name: string;
  unit_price_kobo: number;
  is_visit_fee: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface VisitCharge {
  id: string;
  visit_id: string;
  service_id: string;
  service_name: string;
  quantity: number;
  unit_price_kobo: number;
  added_by: string;
  created_at: string;
}

export interface BillingSummary {
  total_billed_kobo: number;
  total_collected_kobo: number;
  total_outstanding_kobo: number;
  paid_invoices: number;
  unpaid_invoices: number;
  void_invoices: number;
}

export interface BillingSummaryByMethod {
  method: string;
  payment_count: number;
  total_kobo: number;
}

export type PaymentMethod = 'cash' | 'transfer' | 'pos';
export type StatusFilter = 'all' | 'unpaid' | 'paid' | 'void';

export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'transfer', 'pos'];

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash',
  transfer: 'Transfer',
  pos: 'POS',
};

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  unpaid: 'Unpaid',
  paid: 'Paid',
  void: 'Void',
};

export const INVOICE_STATUS_VARIANT: Record<InvoiceStatus, 'neutral' | 'success' | 'error'> = {
  unpaid: 'neutral',
  paid: 'success',
  void: 'error',
};

export interface HospitalSettings {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  receipt_footer: string | null;
  created_at: string;
  updated_at: string;
}
