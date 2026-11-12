DROP FUNCTION IF EXISTS complete_visit(uuid, text, text, text, text, uuid, jsonb);

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
    v_prescriptions JSONB;
BEGIN
    SELECT * INTO v_visit FROM visits WHERE id = p_visit_id FOR UPDATE;

    IF v_visit.status = 'completed' OR v_visit.status = 'cancelled' THEN
        RAISE EXCEPTION 'Visit is already %.', v_visit.status;
    END IF;

    v_patient_id := v_visit.patient_id;

    SELECT * INTO v_existing_invoice FROM invoices WHERE visit_id = p_visit_id;

    IF NOT FOUND THEN
        SELECT * INTO v_visit_fee FROM services WHERE is_visit_fee = true AND is_active = true LIMIT 1;

        INSERT INTO invoices (patient_id, visit_id, invoice_number, status, subtotal_kobo, discount_kobo, total_kobo, amount_paid_kobo, created_by, created_at, updated_at)
        VALUES (v_patient_id, p_visit_id, 'INV-' || lpad(nextval('invoice_number_seq')::text, 6, '0'), 'unpaid', 0, 0, 0, 0, auth.uid(), now(), now())
        RETURNING id INTO v_invoice_id;

        IF FOUND THEN
            INSERT INTO invoice_items (invoice_id, description, quantity, unit_price_kobo, line_total_kobo, source)
            VALUES (v_invoice_id, 'Consultation fee', 1, v_visit_fee.unit_price_kobo, v_visit_fee.unit_price_kobo, 'visit_fee');
            v_subtotal := v_subtotal + v_visit_fee.unit_price_kobo;
        END IF;

        FOR charge IN
            SELECT vc.quantity, vc.unit_price_kobo, s.name
            FROM visit_charges vc JOIN services s ON s.id = vc.service_id
            WHERE vc.visit_id = p_visit_id
        LOOP
            INSERT INTO invoice_items (invoice_id, description, quantity, unit_price_kobo, line_total_kobo, source)
            VALUES (v_invoice_id, charge.name, charge.quantity, charge.unit_price_kobo, charge.quantity * charge.unit_price_kobo, 'service');
            v_subtotal := v_subtotal + (charge.quantity * charge.unit_price_kobo);
        END LOOP;

        -- Normalize p_prescriptions: array or double-encoded string -> jsonb array
        v_prescriptions := CASE
            WHEN jsonb_typeof(p_prescriptions) = 'array' THEN p_prescriptions
            WHEN jsonb_typeof(p_prescriptions) = 'string' THEN p_prescriptions::jsonb
            ELSE '[]'::jsonb
        END;

        FOR item IN SELECT * FROM jsonb_array_elements(v_prescriptions) LOOP
            DECLARE
                v_drug_id TEXT := item->>'drug_id';
                v_qty INTEGER := (item->>'quantity')::INTEGER;
                v_unit_price INTEGER := 0;
                v_drug_name TEXT := '';
            BEGIN
                SELECT name, unit_price_kobo INTO v_drug_name, v_unit_price FROM drugs WHERE id = v_drug_id::UUID;

                INSERT INTO invoice_items (invoice_id, description, quantity, unit_price_kobo, line_total_kobo, source, prescription_item_id)
                VALUES (v_invoice_id, v_drug_name || COALESCE(' ' || item->>'strength', ''), v_qty, v_unit_price, v_qty * v_unit_price, 'drug', (item->>'drug_id')::UUID);
                v_subtotal := v_subtotal + (v_qty * v_unit_price);
            END;
        END LOOP;

        v_total := GREATEST(v_subtotal, 0);
        UPDATE invoices SET subtotal_kobo = v_subtotal, total_kobo = v_total, updated_at = now() WHERE id = v_invoice_id;
    END IF;

    INSERT INTO consultations (visit_id, history, examination, diagnosis, plan, doctor_id)
    VALUES (p_visit_id, p_history, p_examination, p_diagnosis, p_plan, p_doctor_id)
    ON CONFLICT (visit_id) DO UPDATE SET
        history = EXCLUDED.history, examination = EXCLUDED.examination,
        diagnosis = EXCLUDED.diagnosis, plan = EXCLUDED.plan, updated_at = now();

    FOR item IN SELECT * FROM jsonb_array_elements(v_prescriptions) LOOP
        INSERT INTO prescription_items (visit_id, drug_id, dose, frequency, duration, quantity, instructions)
        VALUES (p_visit_id, (item->>'drug_id')::UUID, item->>'dose', item->>'frequency', item->>'duration', (item->>'quantity')::INTEGER, item->>'instructions');
    END LOOP;

    UPDATE visits SET status = 'completed', completed_at = now(), updated_at = now() WHERE id = p_visit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
