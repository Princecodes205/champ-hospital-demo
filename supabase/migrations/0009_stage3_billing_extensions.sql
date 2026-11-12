-- 0009_stage3_billing_extensions.sql
-- Stage 3 billing extensions WITHOUT part payments.
-- Business rule (CLAUDE.md): invoices are paid in full in a single payment.
-- No part payments, no installments, no deposits, no balances.
-- Invoice statuses: unpaid, paid, void only. No part_paid.

-- Idempotent resume: drop the Stage 2 views that block column type changes first.
DROP VIEW IF EXISTS billing_summary;
DROP VIEW IF EXISTS billing_summary_by_method;

-- ------------------------------------------------------------------
-- 1. Enums
-- ------------------------------------------------------------------

-- NOTE: invoice_status (unpaid, paid, void) was created in 0008.
-- We deliberately do NOT add 'part_paid' here.

-- Payment method enum (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method') THEN
    CREATE TYPE payment_method AS ENUM ('cash', 'transfer', 'pos');
  END IF;
END $$;

-- ------------------------------------------------------------------
-- 2. Services table (service catalog)
-- ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  unit_price_kobo INTEGER NOT NULL CHECK (unit_price_kobo >= 0),
  is_visit_fee BOOLEAN DEFAULT false NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Exactly one active visit_fee service may exist at any time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_visit_fee
  ON services (is_visit_fee)
  WHERE is_visit_fee = true AND is_active = true;

-- ------------------------------------------------------------------
-- 3. Visit charges table
-- ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS visit_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID REFERENCES visits(id) ON DELETE CASCADE NOT NULL,
  service_id UUID REFERENCES services(id) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_kobo INTEGER NOT NULL CHECK (unit_price_kobo >= 0),
  added_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_visit_charges_visit ON visit_charges(visit_id);

-- ------------------------------------------------------------------
-- 4. Extend invoices
-- ------------------------------------------------------------------

-- One invoice per visit.
ALTER TABLE invoices ALTER COLUMN visit_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_invoice_per_visit ON invoices(visit_id);

-- Discount reason and void reason.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_reason TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS void_reason TEXT;

-- Restore the single-payment CHECK: paid == total, unpaid/void == 0.
-- No part_paid clause.
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_amount_check;
ALTER TABLE invoices
  ADD CONSTRAINT invoices_status_amount_check CHECK (
    (status = 'paid' AND amount_paid_kobo = total_kobo) OR
    (status IN ('unpaid', 'void') AND amount_paid_kobo = 0)
  );

-- ------------------------------------------------------------------
-- 5. Extend invoice_items
-- ------------------------------------------------------------------

ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('visit_fee', 'service', 'drug', 'manual'));
ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS prescription_item_id UUID;

CREATE INDEX IF NOT EXISTS idx_invoice_items_source ON invoice_items(source);

-- ------------------------------------------------------------------
-- 6. Extend payments (receipt numbers)
-- ------------------------------------------------------------------

ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_number TEXT UNIQUE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- Change method column to the enum (idempotent: skip if already the enum).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payments' AND column_name = 'method'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_attribute att
    JOIN pg_type t ON att.atttypid = t.oid
    WHERE att.attrelid = 'payments'::regclass
      AND att.attname = 'method'
      AND t.typname = 'payment_method'
  ) THEN
    ALTER TABLE payments ALTER COLUMN method TYPE payment_method USING method::text::payment_method;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not convert payments.method to payment_method enum: %', SQLERRM;
END $$;

CREATE INDEX IF NOT EXISTS idx_payments_receipt ON payments(receipt_number);

-- ------------------------------------------------------------------
-- 7. Hospital settings (single row)
-- ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hospital_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  receipt_footer TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enforce a single row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_hospital_settings ON hospital_settings ((true));

-- ------------------------------------------------------------------
-- 8. Indexes (as specified)
-- ------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_invoices_status_created ON invoices(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_patient ON invoices(patient_id);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON payments(paid_at);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);

-- ------------------------------------------------------------------
-- 9. RLS on new tables
-- ------------------------------------------------------------------

ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE hospital_settings ENABLE ROW LEVEL SECURITY;

-- Services: everyone signed in reads active services; owner manages.
DROP POLICY IF EXISTS "Anyone signed in can read active services" ON services;
CREATE POLICY "Anyone signed in can read active services" ON services
  FOR SELECT TO authenticated
  USING (is_active = true);
DROP POLICY IF EXISTS "Owner can manage services" ON services;
CREATE POLICY "Owner can manage services" ON services
  FOR ALL TO authenticated
  USING (get_my_role() = 'owner');

-- Visit charges: staff read; nurse/doctor add.
DROP POLICY IF EXISTS "Staff can read visit charges" ON visit_charges;
CREATE POLICY "Staff can read visit charges" ON visit_charges
  FOR SELECT TO authenticated
  USING (get_my_role() IN ('nurse', 'doctor', 'owner'));
DROP POLICY IF EXISTS "Nurse and doctor can add visit charges" ON visit_charges;
CREATE POLICY "Nurse and doctor can add visit charges" ON visit_charges
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('nurse', 'doctor'));

-- Hospital settings: everyone reads; owner manages.
DROP POLICY IF EXISTS "Anyone signed in can read hospital settings" ON hospital_settings;
CREATE POLICY "Anyone signed in can read hospital settings" ON hospital_settings
  FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS "Owner can manage hospital settings" ON hospital_settings;
CREATE POLICY "Owner can manage hospital settings" ON hospital_settings
  FOR ALL TO authenticated
  USING (get_my_role() = 'owner');

-- ------------------------------------------------------------------
-- 10. add_visit_charge(visit_id, service_id, quantity)
--     Nurse or doctor, only before the visit is completed.
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION add_visit_charge(
  p_visit_id UUID,
  p_service_id UUID,
  p_quantity INTEGER
)
RETURNS visit_charges AS $$
DECLARE
  v_visit_status TEXT;
  v_caller_role user_role;
  v_service services%ROWTYPE;
  v_new_charge visit_charges%ROWTYPE;
BEGIN
  SELECT get_my_role() INTO v_caller_role;
  IF v_caller_role NOT IN ('nurse', 'doctor') THEN
    RAISE EXCEPTION 'Unauthorized: Only nurses and doctors can add visit charges.';
  END IF;

  SELECT status INTO v_visit_status
  FROM visits
  WHERE id = p_visit_id;

  IF v_visit_status = 'completed' OR v_visit_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot add charges to a %s visit.', v_visit_status;
  END IF;

  SELECT * INTO v_service
  FROM services
  WHERE id = p_service_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service not found or inactive.';
  END IF;

  INSERT INTO visit_charges (
    visit_id, service_id, quantity, unit_price_kobo, added_by
  )
  VALUES (
    p_visit_id,
    p_service_id,
    p_quantity,
    v_service.unit_price_kobo,
    auth.uid()
  )
  RETURNING * INTO v_new_charge;

  RETURN v_new_charge;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------------
-- 11. complete_visit (extended): creates the invoice in the same tx
-- ------------------------------------------------------------------

-- Drop and recreate to add invoice creation.
DROP FUNCTION IF EXISTS complete_visit(
  uuid, text, text, text, text, uuid, jsonb
);

CREATE OR REPLACE FUNCTION complete_visit(
  p_visit_id UUID,
  p_history TEXT,
  p_examination TEXT,
  p_diagnosis TEXT,
  p_plan TEXT,
  p_doctor_id UUID,
  p_prescriptions JSONB
)
RETURNS VOID AS $$
DECLARE
  v_visit visits%ROWTYPE;
  v_patient_id UUID;
  v_existing_invoice invoices%ROWTYPE;
  v_visit_fee services%ROWTYPE;
  v_invoice_id UUID;
  v_subtotal INTEGER := 0;
  v_total INTEGER := 0;
  charge record;
  item JSONB;
BEGIN
  -- Lock the visit row.
  SELECT * INTO v_visit
  FROM visits
  WHERE id = p_visit_id
  FOR UPDATE;

  IF v_visit.status = 'completed' OR v_visit.status = 'cancelled' THEN
    RAISE EXCEPTION 'Visit is already %s.', v_visit.status;
  END IF;

  v_patient_id := v_visit.patient_id;

  -- Idempotency: if an invoice already exists for this visit, do not create another.
  SELECT * INTO v_existing_invoice
  FROM invoices
  WHERE visit_id = p_visit_id;

  IF NOT FOUND THEN
    -- Get the active visit_fee service.
    SELECT * INTO v_visit_fee
    FROM services
    WHERE is_visit_fee = true AND is_active = true
    LIMIT 1;

    -- Create the invoice (unpaid, no payment yet).
    INSERT INTO invoices (
      patient_id, visit_id, invoice_number, status,
      subtotal_kobo, discount_kobo, total_kobo, amount_paid_kobo,
      created_by, created_at, updated_at
    )
    VALUES (
      v_patient_id,
      p_visit_id,
      'INV-' || lpad(nextval('invoice_number_seq')::text, 6, '0'),
      'unpaid',
      0, 0, 0, 0,
      auth.uid(), now(), now()
    )
    RETURNING id INTO v_invoice_id;

    -- Line 1: visit fee (consultation fee).
    IF FOUND THEN
      INSERT INTO invoice_items (
        invoice_id, description, quantity, unit_price_kobo,
        line_total_kobo, source
      )
      VALUES (
        v_invoice_id,
        'Consultation fee',
        1,
        v_visit_fee.unit_price_kobo,
        v_visit_fee.unit_price_kobo,
        'visit_fee'
      );
      v_subtotal := v_subtotal + v_visit_fee.unit_price_kobo;
    END IF;

    -- Lines: visit charges.
    FOR charge IN
      SELECT vc.quantity, vc.unit_price_kobo, s.name
      FROM visit_charges vc
      JOIN services s ON s.id = vc.service_id
      WHERE vc.visit_id = p_visit_id
    LOOP
      INSERT INTO invoice_items (
        invoice_id, description, quantity, unit_price_kobo,
        line_total_kobo, source
      )
      VALUES (
        v_invoice_id,
        charge.name,
        charge.quantity,
        charge.unit_price_kobo,
        charge.quantity * charge.unit_price_kobo,
        'service'
      );
      v_subtotal := v_subtotal + (charge.quantity * charge.unit_price_kobo);
    END LOOP;

    -- Lines: prescribed drugs (snapshot current catalog unit price).
    FOR item IN SELECT * FROM jsonb_array_elements(p_prescriptions)
    LOOP
      DECLARE
        v_drug_id TEXT := item->>'drug_id';
        v_qty INTEGER := (item->>'quantity')::INTEGER;
        v_unit_price INTEGER := 0;
        v_drug_name TEXT := '';
      BEGIN
        SELECT name, unit_price_kobo INTO v_drug_name, v_unit_price
        FROM drugs
        WHERE id = v_drug_id::UUID;

        INSERT INTO invoice_items (
          invoice_id, description, quantity, unit_price_kobo,
          line_total_kobo, source, prescription_item_id
        )
        -- description must never be NULL (NOT NULL constraint on invoice_items).
        -- item->>'strength' may be missing from the prescription payload, so coalesce it.
        VALUES (
          v_invoice_id,
          v_drug_name || COALESCE(' ' || item->>'strength', ''),
          v_qty,
          v_unit_price,
          v_qty * v_unit_price,
          'drug',
          (item->>'drug_id')::UUID
        );
        v_subtotal := v_subtotal + (v_qty * v_unit_price);
      END;
    END LOOP;

    v_total := GREATEST(v_subtotal, 0);

    UPDATE invoices
    SET subtotal_kobo = v_subtotal,
        total_kobo = v_total,
        updated_at = now()
    WHERE id = v_invoice_id;
  END IF;

  -- Insert or Update Consultation.
  INSERT INTO consultations (visit_id, history, examination, diagnosis, plan, doctor_id)
  VALUES (p_visit_id, p_history, p_examination, p_diagnosis, p_plan, p_doctor_id)
  ON CONFLICT (visit_id) DO UPDATE SET
    history = EXCLUDED.history,
    examination = EXCLUDED.examination,
    diagnosis = EXCLUDED.diagnosis,
    plan = EXCLUDED.plan,
    updated_at = now();

  -- Insert Prescriptions.
  FOR item IN SELECT * FROM jsonb_array_elements(p_prescriptions)
  LOOP
    INSERT INTO prescription_items (visit_id, drug_id, dose, frequency, duration, quantity, instructions)
    VALUES (
      p_visit_id,
      (item->>'drug_id')::UUID,
      (item->>'dose'),
      (item->>'frequency'),
      (item->>'duration'),
      (item->>'quantity')::INTEGER,
      (item->>'instructions')
    );
  END LOOP;

  UPDATE visits
  SET status = 'completed', completed_at = now(), updated_at = now()
  WHERE id = p_visit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Sequence for invoice numbers.
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1;

-- ------------------------------------------------------------------
-- 12. record_payment(invoice_id, method, reference, idempotency_key)
--     No amount parameter: amount is always the invoice total from the DB.
--     Idempotent: same key returns the original payment; different key on a paid invoice is rejected.
--     Rejects void or already-paid invoices. Uses row lock (SELECT ... FOR UPDATE).
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION record_payment(
  p_invoice_id UUID,
  p_method TEXT,
  p_reference TEXT,
  p_idempotency_key TEXT
)
RETURNS payments AS $$
DECLARE
  v_invoice invoices%ROWTYPE;
  v_existing_payment payments%ROWTYPE;
  v_new_payment payments%ROWTYPE;
  v_receipt_number TEXT := 'RC-' || lpad(nextval('receipt_number_seq')::text, 6, '0');
BEGIN
  -- Lock the invoice row to prevent concurrent payments.
  SELECT * INTO v_invoice
  FROM invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF v_invoice.status = 'void' THEN
    RAISE EXCEPTION 'Cannot record payment on a void invoice.';
  END IF;

  IF v_invoice.status = 'paid' THEN
    -- Idempotency: same key returns the original payment.
    SELECT * INTO v_existing_payment
    FROM payments
    WHERE idempotency_key = p_idempotency_key
      AND invoice_id = p_invoice_id;

    IF FOUND THEN
      RETURN v_existing_payment;
    END IF;

    -- Different key on an already-paid invoice is rejected.
    RAISE EXCEPTION 'Invoice is already paid. Reverse the payment first before recording a new one.';
  END IF;

  -- Generate a receipt number (RC-...).
  -- At this point the invoice is unpaid. Create the payment for the full total.
  INSERT INTO payments (
    invoice_id, amount_kobo, method, reference, idempotency_key, receipt_number, paid_at, created_by
  )
  VALUES (
    p_invoice_id,
    v_invoice.total_kobo,
    p_method,
    p_reference,
    p_idempotency_key,
    v_receipt_number,
    now(),
    auth.uid()
  )
  RETURNING * INTO v_new_payment;

  -- Mark the invoice as paid in full.
  UPDATE invoices
  SET status = 'paid',
      amount_paid_kobo = v_invoice.total_kobo,
      paid_at = now(),
      paid_by = auth.uid(),
      updated_at = now()
  WHERE id = p_invoice_id;

  RETURN v_new_payment;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE SEQUENCE IF NOT EXISTS receipt_number_seq START 1;

-- ------------------------------------------------------------------
-- 13. apply_discount(invoice_id, discount_kobo, reason)
--     Only allowed while the invoice is unpaid. Paid => reverse first.
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION apply_discount(
  p_invoice_id UUID,
  p_discount_kobo INTEGER,
  p_reason TEXT
)
RETURNS VOID AS $$
DECLARE
  v_status invoice_status;
BEGIN
  SELECT status INTO v_status
  FROM invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF v_status <> 'unpaid' THEN
    RAISE EXCEPTION 'Cannot apply discount to a %s invoice. Reverse the payment first.', v_status;
  END IF;

  IF p_discount_kobo < 0 THEN
    RAISE EXCEPTION 'Discount cannot be negative.';
  END IF;

  UPDATE invoices
  SET discount_kobo = p_discount_kobo,
      discount_reason = p_reason,
      updated_at = now()
  WHERE id = p_invoice_id;

  -- recompute_invoice_totals is defined in 0008_billing.sql.
  PERFORM recompute_invoice_totals(p_invoice_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------------
-- 14. add_invoice_line(invoice_id, description, quantity, unit_price_kobo, reason)
--     Only allowed while the invoice is unpaid. Paid => reverse first.
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION add_invoice_line(
  p_invoice_id UUID,
  p_description TEXT,
  p_quantity INTEGER,
  p_unit_price_kobo INTEGER,
  p_reason TEXT
)
RETURNS invoice_items AS $$
DECLARE
  v_status invoice_status;
  v_new_item invoice_items%ROWTYPE;
BEGIN
  SELECT status INTO v_status
  FROM invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF v_status <> 'unpaid' THEN
    RAISE EXCEPTION 'Cannot add line to a %s invoice. Reverse the payment first.', v_status;
  END IF;

  INSERT INTO invoice_items (
    invoice_id, description, quantity, unit_price_kobo, line_total_kobo, source
  )
  VALUES (
    p_invoice_id,
    p_description,
    p_quantity,
    p_unit_price_kobo,
    p_quantity * p_unit_price_kobo,
    'manual'
  )
  RETURNING * INTO v_new_item;

  PERFORM recompute_invoice_totals(p_invoice_id);

  RETURN v_new_item;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------------
-- 15. reverse_payment(p_payment_id, p_reason)
--     Owner only. Reason required. Marks reversed (never deletes), returns invoice to unpaid.
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION reverse_payment(
  p_payment_id UUID,
  p_reason TEXT
)
RETURNS payments AS $$
DECLARE
  v_payment payments%ROWTYPE;
  v_invoice invoices%ROWTYPE;
  v_caller_role user_role;
BEGIN
  -- Owner only.
  SELECT get_my_role() INTO v_caller_role;
  IF v_caller_role <> 'owner' THEN
    RAISE EXCEPTION 'Unauthorized: Only the owner can reverse payments.';
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required to reverse a payment.';
  END IF;

  SELECT * INTO v_payment
  FROM payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF v_payment.reversed THEN
    RAISE EXCEPTION 'This payment has already been reversed.';
  END IF;

  SELECT * INTO v_invoice
  FROM invoices
  WHERE id = v_payment.invoice_id
  FOR UPDATE;

  IF v_invoice.status <> 'paid' THEN
    RAISE EXCEPTION 'Cannot reverse payment: invoice is not paid.';
  END IF;

  -- Mark payment reversed (never delete).
  UPDATE payments
  SET reversed = true,
      reversed_at = now(),
      reversed_reason = p_reason,
      reversed_by = auth.uid()
  WHERE id = p_payment_id;

  -- Return invoice to unpaid.
  UPDATE invoices
  SET status = 'unpaid',
      amount_paid_kobo = 0,
      paid_at = NULL,
      paid_by = NULL,
      updated_at = now()
  WHERE id = v_invoice.id;

  -- Return the (now reversed) payment row.
  RETURN v_payment;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------------
-- 16. void_invoice(p_invoice_id, p_reason)
--     Owner only. Reason required. Only unpaid invoices can be voided.
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION void_invoice(
  p_invoice_id UUID,
  p_reason TEXT
)
RETURNS invoices AS $$
DECLARE
  v_status invoice_status;
  v_caller_role user_role;
  v_invoice invoices%ROWTYPE;
BEGIN
  SELECT get_my_role() INTO v_caller_role;
  IF v_caller_role <> 'owner' THEN
    RAISE EXCEPTION 'Unauthorized: Only the owner can void invoices.';
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required to void an invoice.';
  END IF;

  SELECT status INTO v_status
  FROM invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF v_status <> 'unpaid' THEN
    RAISE EXCEPTION 'Only unpaid invoices can be voided. This invoice is %s.', v_status;
  END IF;

  UPDATE invoices
  SET status = 'void',
      void_reason = p_reason,
      voided_at = now(),
      voided_by = auth.uid(),
      updated_at = now()
  WHERE id = p_invoice_id
  RETURNING * INTO v_invoice;

  RETURN v_invoice;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------------
-- 17. billing_summary(from_date, to_date)
--     Computed in SQL. Returns totals and collected by method.
--     No part_paid category (single-payment rule). Replaces the 0008 views.
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION billing_summary(
  p_from_date TIMESTAMPTZ,
  p_to_date TIMESTAMPTZ
)
RETURNS TABLE (
  total_billed_kobo INTEGER,
  total_collected_kobo INTEGER,
  total_outstanding_kobo INTEGER,
  paid_invoices INTEGER,
  unpaid_invoices INTEGER,
  void_invoices INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(total_kobo), 0)::INTEGER,
    COALESCE(SUM(amount_paid_kobo), 0)::INTEGER,
    COALESCE(SUM(total_kobo - amount_paid_kobo), 0)::INTEGER,
    COUNT(*) FILTER (WHERE status = 'paid')::INTEGER,
    COUNT(*) FILTER (WHERE status = 'unpaid')::INTEGER,
    COUNT(*) FILTER (WHERE status = 'void')::INTEGER
  FROM invoices
  WHERE created_at >= p_from_date AND created_at <= p_to_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Collected by payment method (non-reversed payments only) in range.
CREATE OR REPLACE FUNCTION billing_summary_by_method(
  p_from_date TIMESTAMPTZ,
  p_to_date TIMESTAMPTZ
)
RETURNS TABLE (
  method payment_method,
  payment_count INTEGER,
  total_kobo INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.method,
    COUNT(*) AS payment_count,
    COALESCE(SUM(p.amount_kobo), 0) AS total_kobo
  FROM payments p
  JOIN invoices i ON i.id = p.invoice_id
  WHERE p.reversed = false
    AND p.paid_at >= p_from_date
    AND p.paid_at <= p_to_date
  GROUP BY p.method;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

NOTIFY pgrst, 'reload schema';
