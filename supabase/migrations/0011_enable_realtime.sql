-- 0011_enable_realtime.sql
-- Enable Supabase Realtime (postgres_changes) on the tables the UI subscribes to.
-- Without adding tables to the supabase_realtime publication, no broadcast
-- events are ever sent and real-time updates will not work.

-- Add tables to the supabase_realtime publication so postgres_changes fires.
-- Only tables that need live updates are included to keep the publication lean.
ALTER PUBLICATION supabase_realtime ADD TABLE visits;
ALTER PUBLICATION supabase_realtime ADD TABLE vitals;
ALTER PUBLICATION supabase_realtime ADD TABLE consultations;
ALTER PUBLICATION supabase_realtime ADD TABLE prescription_items;
ALTER PUBLICATION supabase_realtime ADD TABLE invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE invoice_items;
ALTER PUBLICATION supabase_realtime ADD TABLE payments;
ALTER PUBLICATION supabase_realtime ADD TABLE services;
ALTER PUBLICATION supabase_realtime ADD TABLE visit_charges;
ALTER PUBLICATION supabase_realtime ADD TABLE patients;
ALTER PUBLICATION supabase_realtime ADD TABLE hospital_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE drugs;

-- Notify PostgREST to reload the schema cache so Realtime picks up the tables.
NOTIFY pgrst, 'reload schema';
