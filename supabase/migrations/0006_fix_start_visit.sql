CREATE OR REPLACE FUNCTION start_visit(p_patient_id UUID, p_reason TEXT, p_user_id UUID)
RETURNS UUID AS $$
DECLARE
  v_visit_id UUID;
BEGIN
  -- Use the role check
  IF (SELECT role FROM profiles WHERE id = p_user_id) NOT IN ('nurse', 'doctor') THEN
    RAISE EXCEPTION 'Unauthorized: Only staff can start visits';
  END IF;

  INSERT INTO visits (patient_id, reason, created_by, status)
  VALUES (p_patient_id, p_reason, p_user_id, 'waiting_triage')
  RETURNING id INTO v_visit_id;

  RETURN v_visit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

NOTIFY pgrst, 'reload schema';
