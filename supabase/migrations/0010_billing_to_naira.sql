-- 0010_billing_to_naira.sql
-- Convert all billing money columns from kobo to naira (whole units).
-- No more kobo anywhere: database, RPC functions, and UI all use naira.

-- ------------------------------------------------------------------
-- 1. Invoices table: rename _kobo columns to _naira
-- ------------------------------------------------------------------

ALTER TABLE invoices
  RENAME COLUMN subtotal_kobo TO subtotal_naira;

ALTER TABLE invoices
  RENAME COLUMN discount_kobo TO discount_naira;

ALTER TABLE invoices
  RENAME COLUMN total_kobo TO total_naira;

ALTER TABLE invoices
  RENAME COLUMN amount_paid_kobo TO amount_paid_naira;

-- Recreate the CHECK invariant with naira column names.
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_amount_check;
ALTER TABLE invoices
  ADD CONSTRAINT invoices_status_amount_check CHECK (
    (status = 'paid' AND amount_paid_naira = total_naira) OR
    (status IN ('unpaid', 'void') AND amount_paid_naira = 0)
  );

-- ------------------------------------------------------------------
-- 2. Invoice items table: rename _kobo columns to _naira
-- ------------------------------------------------------------------

ALTER TABLE invoice_items
  RENAME COLUMN unit_price_kobo TO unit_price_naira;

ALTER TABLE invoice_items
  RENAME COLUMN line_total_kobo TO line_total_naira;

-- ------------------------------------------------------------------
-- 3. Payments table: rename _kobo column to _naira
-- ------------------------------------------------------------------

ALTER TABLE payments
  RENAME COLUMN amount_kobo TO amount_naira;

-- ------------------------------------------------------------------
-- 4. Services table: rename unit_price_kobo to unit_price_naira
-- ------------------------------------------------------------------

ALTER TABLE services
  RENAME COLUMN unit_price_kobo TO unit_price_naira;

-- ------------------------------------------------------------------
-- 5. Visit charges table: rename unit_price_kobo to unit_price_naira
-- ------------------------------------------------------------------

ALTER TABLE visit_charges
  RENAME COLUMN unit_price_kobo TO unit_price_naira;

-- ------------------------------------------------------------------
-- 6. Drugs table: rename unit_price_kobo to unit_price_naira
-- ------------------------------------------------------------------

ALTER TABLE drugs
  RENAME COLUMN unit_price_kobo TO unit_price_naira;

-- ------------------------------------------------------------------
-- 7. Recreate helper function recompute_invoice_totals with naira names
-- ------------------------------------------------------------------

DROP FUNCTION IF EXISTS recompute_invoice_totals(UUID);

CREATE OR REPLACE FUNCTION recompute_invoice_totals(p_invoice_id UUID)
RETURNS VOID AS $$
DECLARE
  v_subtotal INTEGER;
  v_discount INTEGER;
  v_total INTEGER;
BEGIN
  SELECT COALESCE(SUM(line_total_naira), 0),
         COALESCE((SELECT discount_naira FROM invoices WHERE id = p_invoice_id), 0)
  INTO v_subtotal, v_discount
  FROM invoice_items
  WHERE invoice_id = p_invoice_id;

  v_total := GREATEST(v_subtotal - v_discount, 0);

  UPDATE invoices
  SET subtotal_naira = v_subtotal,
      total_naira = v_total,
      updated_at = now()
  WHERE id = p_invoice_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------------
-- 8. record_payment: naira parameter names
-- ------------------------------------------------------------------

DROP FUNCTION IF EXISTS record_payment(UUID, TEXT, TEXT, TEXT);

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
  INSERT INTO payments (
    invoice_id, amount_naira, method, reference, idempotency_key, receipt_number, paid_at, created_by
  )
  VALUES (
    p_invoice_id,
    v_invoice.total_naira,
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
      amount_paid_naira = v_invoice.total_naira,
      paid_at = now(),
      paid_by = auth.uid(),
      updated_at = now()
  WHERE id = p_invoice_id;

  RETURN v_new_payment;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------------
-- 9. apply_discount: naira parameter name
-- ------------------------------------------------------------------

DROP FUNCTION IF EXISTS apply_discount(UUID, INTEGER, TEXT);

CREATE OR REPLACE FUNCTION apply_discount(
  p_invoice_id UUID,
  p_discount_naira INTEGER,
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

  IF p_discount_naira < 0 THEN
    RAISE EXCEPTION 'Discount cannot be negative.';
  END IF;

  UPDATE invoices
  SET discount_naira = p_discount_naira,
      discount_reason = p_reason,
      updated_at = now()
  WHERE id = p_invoice_id;

  -- recompute_invoice_totals is defined above.
  PERFORM recompute_invoice_totals(p_invoice_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------------
-- 10. add_invoice_line: naira parameter name
-- ------------------------------------------------------------------

DROP FUNCTION IF EXISTS add_invoice_line(UUID, TEXT, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION add_invoice_line(
  p_invoice_id UUID,
  p_description TEXT,
  p_quantity INTEGER,
  p_unit_price_naira INTEGER
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
    invoice_id, description, quantity, unit_price_naira, line_total_naira, source
  )
  VALUES (
    p_invoice_id,
    p_description,
    p_quantity,
    p_unit_price_naira,
    p_quantity * p_unit_price_naira,
    'manual'
  )
  RETURNING * INTO v_new_item;

  PERFORM recompute_invoice_totals(p_invoice_id);

  RETURN v_new_item;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------------
-- 11. complete_visit: update to use naira column names
-- ------------------------------------------------------------------

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
      subtotal_naira, discount_naira, total_naira, amount_paid_naira,
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
        invoice_id, description, quantity, unit_price_naira,
        line_total_naira, source
      )
      VALUES (
        v_invoice_id,
        'Consultation fee',
        1,
        v_visit_fee.unit_price_naira,
        v_visit_fee.unit_price_naira,
        'visit_fee'
      );
      v_subtotal := v_subtotal + v_visit_fee.unit_price_naira;
    END IF;

    -- Lines: visit charges.
    FOR charge IN
      SELECT vc.quantity, vc.unit_price_naira, s.name
      FROM visit_charges vc
      JOIN services s ON s.id = vc.service_id
      WHERE vc.visit_id = p_visit_id
    LOOP
      INSERT INTO invoice_items (
        invoice_id, description, quantity, unit_price_naira,
        line_total_naira, source
      )
      VALUES (
        v_invoice_id,
        charge.name,
        charge.quantity,
        charge.unit_price_naira,
        charge.quantity * charge.unit_price_naira,
        'service'
      );
      v_subtotal := v_subtotal + (charge.quantity * charge.unit_price_naira);
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
        SELECT name, unit_price_naira INTO v_drug_name, v_unit_price
        FROM drugs
        WHERE id = v_drug_id::UUID;

        -- description must never be NULL (NOT NULL constraint on invoice_items).
        -- item->>'strength' may be missing from the prescription payload, so coalesce it.
        INSERT INTO invoice_items (
          invoice_id, description, quantity, unit_price_naira,
          line_total_naira, source, prescription_item_id
        )
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
    SET subtotal_naira = v_subtotal,
        total_naira = v_total,
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

-- ------------------------------------------------------------------
-- 12. add_visit_charge: use unit_price_naira from services
-- ------------------------------------------------------------------

DROP FUNCTION IF EXISTS add_visit_charge(UUID, UUID, INTEGER);

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
    visit_id, service_id, quantity, unit_price_naira, added_by
  )
  VALUES (
    p_visit_id,
    p_service_id,
    p_quantity,
    v_service.unit_price_naira,
    auth.uid()
  )
  RETURNING * INTO v_new_charge;

  RETURN v_new_charge;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ------------------------------------------------------------------
-- 13. billing_summary function: naira column names
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION billing_summary(
  p_from_date TIMESTAMPTZ,
  p_to_date TIMESTAMPTZ
)
RETURNS TABLE (
  total_billed_naira INTEGER,
  total_collected_naira INTEGER,
  total_outstanding_naira INTEGER,
  paid_invoices INTEGER,
  unpaid_invoices INTEGER,
  void_invoices INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(total_naira), 0)::INTEGER,
    COALESCE(SUM(amount_paid_naira), 0)::INTEGER,
    COALESCE(SUM(total_naira - amount_paid_naira), 0)::INTEGER,
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
  total_naira INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.method,
    COUNT(*) AS payment_count,
    COALESCE(SUM(p.amount_naira), 0)::INTEGER AS total_naira
  FROM payments p
  JOIN invoices i ON i.id = p.invoice_id
  WHERE p.reversed = false
    AND p.paid_at >= p_from_date
    AND p.paid_at <= p_to_date
  GROUP BY p.method;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

NOTIFY pgrst, 'reload schema';
