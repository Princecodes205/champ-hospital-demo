-- DROP existing functions to avoid parameter name mismatch errors
DROP FUNCTION IF EXISTS record_vitals(uuid,numeric,integer,integer,integer,integer,integer,numeric,numeric,uuid);
DROP FUNCTION IF EXISTS begin_consultation(uuid,uuid);
DROP FUNCTION IF EXISTS complete_visit(uuid,text,text,text,text,uuid,jsonb);

-- 1. Record Vitals
CREATE OR REPLACE FUNCTION record_vitals(
  p_visit_id UUID,
  p_temperature_c NUMERIC,
  p_bp_systolic INTEGER,
  p_bp_diastolic INTEGER,
  p_pulse_bpm INTEGER,
  p_respiratory_rate INTEGER,
  p_spo2_percent INTEGER,
  p_weight_kg NUMERIC,
  p_height_cm NUMERIC,
  p_recorded_by UUID
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO vitals (
    visit_id, temperature_c, bp_systolic, bp_diastolic, pulse_bpm, 
    respiratory_rate, spo2_percent, weight_kg, height_cm, recorded_by
  )
  VALUES (
    p_visit_id, p_temperature_c, p_bp_systolic, p_bp_diastolic, p_pulse_bpm, 
    p_respiratory_rate, p_spo2_percent, p_weight_kg, p_height_cm, p_recorded_by
  )
  ON CONFLICT (visit_id) DO UPDATE SET
    temperature_c = EXCLUDED.temperature_c,
    bp_systolic = EXCLUDED.bp_systolic,
    bp_diastolic = EXCLUDED.bp_diastolic,
    pulse_bpm = EXCLUDED.pulse_bpm,
    respiratory_rate = EXCLUDED.respiratory_rate,
    spo2_percent = EXCLUDED.spo2_percent,
    weight_kg = EXCLUDED.weight_kg,
    height_cm = EXCLUDED.height_cm,
    recorded_by = EXCLUDED.recorded_by,
    recorded_at = now();

  UPDATE visits SET status = 'waiting_doctor', updated_at = now() WHERE id = p_visit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Begin Consultation
CREATE OR REPLACE FUNCTION begin_consultation(p_visit_id UUID, p_doctor_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE visits 
  SET status = 'in_consultation', 
      assigned_doctor_id = p_doctor_id, 
      updated_at = now() 
  WHERE id = p_visit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Complete Visit
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
  item JSONB;
BEGIN
  -- Insert or Update Consultation
  INSERT INTO consultations (visit_id, history, examination, diagnosis, plan, doctor_id)
  VALUES (p_visit_id, p_history, p_examination, p_diagnosis, p_plan, p_doctor_id)
  ON CONFLICT (visit_id) DO UPDATE SET
    history = EXCLUDED.history,
    examination = EXCLUDED.examination,
    diagnosis = EXCLUDED.diagnosis,
    plan = EXCLUDED.plan,
    updated_at = now();

  -- Insert Prescriptions
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

  UPDATE visits SET status = 'completed', completed_at = now(), updated_at = now() WHERE id = p_visit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
