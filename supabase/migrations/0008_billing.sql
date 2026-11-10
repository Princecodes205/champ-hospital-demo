-- 0008_billing.sql
-- Billing system built with the "paid in full, single payment" business rule.
-- Every invoice is settled in a single payment; there are no balances or deposits.

-- 1. Invoice status enum: unpaid, paid, void only.
CREATE TYPE invoice_status AS ENUM ('unpaid', 'paid', 'void');

-- 2. Invoices table
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE RESTRICT NOT NULL,
  visit_id UUID REFERENCES visits(id) ON DELETE SET NULL,
  invoice_number TEXT UNIQUE NOT NULL,
  status invoice_status DEFAULT 'unpaid' NOT NULL,
  subtotal_kobo INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_kobo >= 0),
  discount_kobo INTEGER NOT NULL DEFAULT 0 CHECK (discount_kobo >= 0),
  total_kobo INTEGER NOT NULL DEFAULT 0 CHECK (total_kobo >= 0),
  amount_paid_kobo INTEGER NOT NULL DEFAULT 0 CHECK (amount_paid_kobo >= 0),
  paid_at TIMESTAMPTZ,
  paid_by UUID REFERENCES auth.users(id),
  voided_at TIMESTAMPTZ,
  voided_reason TEXT,
  voided_by UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- Invariant: paid means fully paid (amount == total); unpaid/void means nothing paid.
  CONSTRAINT invoices_status_amount_check CHECK (
    (status = 'paid' AND amount_paid_kobo = total_kobo) OR
    (status IN ('unpaid', 'void') AND amount_paid_kobo = 0)
  )
);

-- 3. Invoice line items
CREATE TABLE invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE NOT NULL,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_kobo INTEGER NOT NULL CHECK (unit_price_kobo >= 0),
  line_total_kobo INTEGER NOT NULL CHECK (line_total_kobo >= 0),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 4. Payments table (amount_kobo always equals the invoice total at time of payment)
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE RESTRICT NOT NULL,
  amount_kobo INTEGER NOT NULL CHECK (amount_kobo > 0),
  method TEXT NOT NULL CHECK (method IN ('cash', 'transfer', 'pos')),
  reference TEXT,
  idempotency_key TEXT UNIQUE NOT NULL,
  reversed BOOLEAN DEFAULT false NOT NULL,
  reversed_at TIMESTAMPTZ,
  reversed_reason TEXT,
  reversed_by UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 5. Indexes
CREATE INDEX idx_invoices_patient ON invoices(patient_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_visit ON invoices(visit_id);
CREATE INDEX idx_invoices_number ON invoices(invoice_number);
CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_payments_idempotency ON payments(idempotency_key);
CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);

-- 6. RLS
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Staff can read/manage invoices and items; owner can read all.
CREATE POLICY "Staff can manage invoices" ON invoices
  FOR ALL TO authenticated
  USING (get_my_role() IN ('nurse', 'doctor', 'owner'));
CREATE POLICY "Owner can read all invoices" ON invoices
  FOR SELECT TO authenticated
  USING (get_my_role() = 'owner');

CREATE POLICY "Staff can manage invoice items" ON invoice_items
  FOR ALL TO authenticated
  USING (get_my_role() IN ('nurse', 'doctor', 'owner'));

CREATE POLICY "Staff can read payments" ON payments
  FOR SELECT TO authenticated
  USING (get_my_role() IN ('nurse', 'doctor', 'owner'));
CREATE POLICY "Only billing functions manage payments" ON payments
  FOR ALL TO authenticated
  USING (false);

-- 7. Helper: recompute invoice totals from its items + discount
CREATE OR REPLACE FUNCTION recompute_invoice_totals(p_invoice_id UUID)
RETURNS VOID AS $$
DECLARE
  v_subtotal INTEGER;
  v_discount INTEGER;
  v_total INTEGER;
BEGIN
  SELECT COALESCE(SUM(line_total_kobo), 0),
         COALESCE((SELECT discount_kobo FROM invoices WHERE id = p_invoice_id), 0)
  INTO v_subtotal, v_discount
  FROM invoice_items
  WHERE invoice_id = p_invoice_id;

  v_total := GREATEST(v_subtotal - v_discount, 0);

  UPDATE invoices
  SET subtotal_kobo = v_subtotal,
      total_kobo = v_total,
      updated_at = now()
  WHERE id = p_invoice_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 8. record_payment(invoice_id, method, reference, idempotency_key)
--    No amount parameter: amount is always the invoice total from the DB.
--    Idempotent: same key returns the original payment; different key on a paid invoice is rejected.
--    Rejects void or already-paid invoices. Uses row lock (SELECT ... FOR UPDATE).
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

  -- At this point the invoice is unpaid. Create the payment for the full total.
  INSERT INTO payments (
    invoice_id, amount_kobo, method, reference, idempotency_key, created_by
  )
  VALUES (
    p_invoice_id,
    v_invoice.total_kobo,
    p_method,
    p_reference,
    p_idempotency_key,
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

-- 9. apply_discount(invoice_id, discount_kobo, reason)
--    Only allowed while the invoice is unpaid. Paid => reverse first.
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
      updated_at = now()
  WHERE id = p_invoice_id;

  PERFORM recompute_invoice_totals(p_invoice_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 10. add_invoice_line(invoice_id, description, quantity, unit_price_kobo)
--     Only allowed while the invoice is unpaid.
CREATE OR REPLACE FUNCTION add_invoice_line(
  p_invoice_id UUID,
  p_description TEXT,
  p_quantity INTEGER,
  p_unit_price_kobo INTEGER
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
    invoice_id, description, quantity, unit_price_kobo, line_total_kobo
  )
  VALUES (
    p_invoice_id,
    p_description,
    p_quantity,
    p_unit_price_kobo,
    p_quantity * p_unit_price_kobo
  )
  RETURNING * INTO v_new_item;

  PERFORM recompute_invoice_totals(p_invoice_id);

  RETURN v_new_item;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 11. reverse_payment(p_payment_id, p_reason, p_reversed_by)
--     Owner only. Marks the payment reversed (never deletes), returns invoice to unpaid.
CREATE OR REPLACE FUNCTION reverse_payment(
  p_payment_id UUID,
  p_reason TEXT,
  p_reversed_by UUID
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
      reversed_by = p_reversed_by
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

-- 12. void_invoice(p_invoice_id, p_reason, p_voided_by)
--     Only unpaid invoices can be voided.
CREATE OR REPLACE FUNCTION void_invoice(
  p_invoice_id UUID,
  p_reason TEXT,
  p_voided_by UUID
)
RETURNS invoices AS $$
DECLARE
  v_status invoice_status;
  v_caller_role user_role;
BEGIN
  SELECT get_my_role() INTO v_caller_role;
  IF v_caller_role <> 'owner' THEN
    RAISE EXCEPTION 'Unauthorized: Only the owner can void invoices.';
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
      voided_at = now(),
      voided_reason = p_reason,
      voided_by = p_voided_by,
      updated_at = now()
  WHERE id = p_invoice_id
  RETURNING *;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 13. billing_summary view
--     Total billed, total collected, total outstanding (sum of unpaid invoices), collected by method.
CREATE OR REPLACE VIEW billing_summary AS
SELECT
  COUNT(*) FILTER (WHERE status = 'paid') AS paid_invoices,
  COUNT(*) FILTER (WHERE status = 'unpaid') AS unpaid_invoices,
  COUNT(*) FILTER (WHERE status = 'void') AS void_invoices,
  COALESCE(SUM(total_kobo) FILTER (WHERE status = 'paid'), 0) AS total_billed_kobo,
  COALESCE(SUM(amount_paid_kobo), 0) AS total_collected_kobo,
  COALESCE(SUM(total_kobo) FILTER (WHERE status = 'unpaid'), 0) AS total_outstanding_kobo,
  COALESCE(SUM(amount_paid_kobo) FILTER (WHERE status = 'paid' AND NOT EXISTS (
    SELECT 1 FROM payments p2 WHERE p2.invoice_id = invoices.id AND p2.reversed
  )), 0) AS total_collected_net_kobo
FROM invoices;

-- Collected by payment method (non-reversed payments only).
CREATE OR REPLACE VIEW billing_summary_by_method AS
SELECT
  p.method,
  COUNT(*) AS payment_count,
  COALESCE(SUM(p.amount_kobo), 0) AS total_kobo
FROM payments p
WHERE p.reversed = false
GROUP BY p.method;

NOTIFY pgrst, 'reload schema';
