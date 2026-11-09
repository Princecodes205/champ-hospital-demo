-- Drop the incorrectly named function if it exists
DROP FUNCTION IF EXISTS routine_vitals(uuid,numeric,integer,integer,integer,integer,integer,numeric,numeric,uuid);

-- Re-create the function with the correct name: record_vitals
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

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
