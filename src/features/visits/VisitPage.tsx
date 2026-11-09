import { useState, useEffect } from "react";
import {
  Button,
  Input,
  Table,
  Badge,
  Skeleton,
  Dialog,
} from "../../components/ui";
import { useVisit } from "./useVisit";
import type { Drug, PrescriptionItem } from "../drugs/types";
import { supabase } from "../../lib/supabase";

export const VisitPage = ({
  visitId,
  userRole,
}: {
  visitId: string;
  userRole: string;
}) => {
  const {
    visit,
    isLoading,
    saveVitals,
    beginConsultation,
    completeVisit,
    cancelVisit,
    isSaving,
    vitals,
    consultation,
    prescriptions,
  } = useVisit(visitId);

  // Local state for forms
  const [vitalsForm, setVitalsForm] = useState({
    temperature_c: "",
    bp_systolic: "",
    bp_diastolic: "",
    pulse_bpm: "",
    respiratory_rate: "",
    spo2_percent: "",
    weight_kg: "",
    height_cm: "",
  });
  const [vitalsErrors, setVitalsErrors] = useState<Record<string, string>>({});
  const [consultForm, setConsultForm] = useState({
    history: "",
    examination: "",
    diagnosis: "",
    plan: "",
  });
  const [prescriptionsForm, setPrescriptionsForm] = useState<
    PrescriptionItem[]
  >([]);
  const [drugSearch, setDrugSearch] = useState("");
  const [allDrugs, setAllDrugs] = useState<Drug[]>([]);
  const [filteredDrugs, setFilteredDrugs] = useState<Drug[]>([]);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  // Load drug catalog for search
  useEffect(() => {
    const loadDrugs = async () => {
      const { data } = await supabase
        .from("drugs")
        .select("*")
        .eq("is_active", true);
      if (data) {
        const drugs = data as Drug[];
        setAllDrugs(drugs);
        setFilteredDrugs(drugs);
      }
    };
    loadDrugs();
  }, []);

  // Load existing data into forms when visit data changes
  useEffect(() => {
    if (vitals) {
      setVitalsForm({
        temperature_c: vitals.temperature_c?.toString() || "",
        bp_systolic: vitals.bp_systolic?.toString() || "",
        bp_diastolic: vitals.bp_diastolic?.toString() || "",
        pulse_bpm: vitals.pulse_bpm?.toString() || "",
        respiratory_rate: vitals.respiratory_rate?.toString() || "",
        spo2_percent: vitals.spo2_percent?.toString() || "",
        weight_kg: vitals.weight_kg?.toString() || "",
        height_cm: vitals.height_cm?.toString() || "",
      });
    }
    if (consultation) {
      setConsultForm({
        history: consultation.history || "",
        examination: consultation.examination || "",
        diagnosis: consultation.diagnosis || "",
        plan: consultation.plan || "",
      });
    }
    if (prescriptions) {
      setPrescriptionsForm(
        prescriptions.map((p) => ({
          drug_id: p.drug_id,
          dose: p.dose || "",
          frequency: p.frequency || "",
          duration: p.duration || "",
          quantity: p.quantity || 1,
          instructions: p.instructions || "",
        })),
      );
    }
  }, [vitals, consultation, prescriptions]);

  const handleCompleteVisit = async () => {
    try {
      const userId = (window as any).userId;
      if (!userId) {
        throw new Error("User session not found. Please log in again.");
      }

      await completeVisit({
        history: consultForm.history || "",
        examination: consultForm.examination || "",
        diagnosis: consultForm.diagnosis || "",
        plan: consultForm.plan || "",
        doctor_id: userId,
        prescriptions: prescriptionsForm,
      });
      console.log("Visit completed successfully!");
    } catch (err: any) {
      console.error(err.message);
    }
  };

  const calculateBMI = () => {
    const w = parseFloat(vitalsForm.weight_kg);
    const h = parseFloat(vitalsForm.height_cm) / 100;
    if (!w || !h) return null;
    return (w / (h * h)).toFixed(1);
  };

  const handleSaveVitals = async () => {
    setVitalsErrors({});
    const errors: Record<string, string> = {};
    let hasError = false;

    const rules: Record<string, { min: number; max: number; example: string }> =
      {
        temperature_c: { min: 30, max: 45, example: "36.5" },
        bp_systolic: { min: 40, max: 300, example: "120" },
        bp_diastolic: { min: 30, max: 200, example: "80" },
        pulse_bpm: { min: 30, max: 250, example: "72" },
        respiratory_rate: { min: 5, max: 60, example: "16" },
        spo2_percent: { min: 50, max: 100, example: "98" },
        weight_kg: { min: 0.1, max: 600, example: "70" },
        height_cm: { min: 10, max: 300, example: "170" },
      };

    Object.entries(rules).forEach(([field, rule]) => {
      const value = vitalsForm[field as keyof typeof vitalsForm];
      if (value !== "") {
        const num = parseFloat(value);
        if (isNaN(num) || num < rule.min || num > rule.max) {
          errors[field] =
            `Enter a real value between ${rule.min} and ${rule.max} (e.g. ${rule.example})`;
          hasError = true;
        }
      }
    });

    if (hasError) {
      setVitalsErrors(errors);
      return;
    }

    try {
      await saveVitals({
        ...vitalsForm,
        recorded_by: (window as any).userId,
      });
    } catch (err: any) {
      console.error(err.message);
    }
  };

  const handleSaveConsultation = async () => {
    try {
      const userId = (window as any).userId;
      if (!userId) {
        throw new Error("User session not found. Please log in again.");
      }

      const payload = {
        history: consultForm.history || "",
        examination: consultForm.examination || "",
        diagnosis: consultForm.diagnosis || "",
        plan: consultForm.plan || "",
        doctor_id: userId,
      };

      const { error } = await supabase.from("consultations").upsert({
        visit_id: visitId,
        ...payload,
        updated_at: new Date().toISOString(),
      });

      if (error) throw error;
      console.log("Consultation saved successfully!");
    } catch (err: any) {
      console.error(err.message);
    }
  };

  const handleCancelVisit = async () => {
    if (!cancelReason.trim()) {
      setCancelReason("Reason is required");
      return;
    }

    try {
      await cancelVisit(cancelReason);
      setCancelDialogOpen(false);
      setCancelReason("");
    } catch (err: any) {
      console.error("Cancellation failed:", err);
    }
  };

  if (isLoading)
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (!visit) return <div className="p-8 text-center">Visit not found.</div>;
    const cancelReasonText = (
      visit as typeof visit & { cancel_reason?: string | null }
    ).cancel_reason;

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between border-b pb-4">
        <div className="flex flex-col">
          <h1 className="text-2xl font-bold">Clinical Visit</h1>
          <p className="text-sm text-muted-foreground">
            Patient: {visit.patients?.full_name} (
            {visit.patients?.patient_number})
          </p>
          {visit.created_at && (
            <p className="text-xs text-muted-foreground mt-1">
              Created: {new Date(visit.created_at).toLocaleString()}
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <Badge
            variant={
              visit.status === "completed"
                ? "success"
                : visit.status === "cancelled"
                  ? "neutral"
                  : "neutral"
            }
          >
            {visit.status.replace("_", " ")}
          </Badge>
          {visit.status !== "completed" && visit.status !== "cancelled" && (
            <Button
              variant="danger"
              onClick={() => setCancelDialogOpen(true)}
              className="h-7 px-2 text-xs"
            >
              Cancel Visit
            </Button>
          )}
        </div>
      </div>
      {visit.status === "cancelled" && cancelReasonText && (
        <div className="p-4 border border-destructive/30 bg-destructive/5 rounded-card">
          <div className="flex items-start gap-2">
            <span className="text-destructive font-bold text-xs uppercase tracking-wider">
              Reason:
            </span>
            <p className="text-sm text-foreground/80">{cancelReasonText}</p>
          </div>
        </div>
      )}
      <Dialog
        isOpen={cancelDialogOpen}
        onClose={() => setCancelDialogOpen(false)}
        title="Cancel Visit"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Please provide a reason for cancelling this visit. This action
            cannot be undone.
          </p>
          <Input
            label="Reason for Cancellation"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="e.g., Patient no-show, duplicate record..."
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setCancelDialogOpen(false)}>
              Keep Visit
            </Button>
            <Button
              variant="danger"
              onClick={handleCancelVisit}
              isLoading={isSaving}
            >
              Confirm Cancellation
            </Button>
          </div>
        </div>
      </Dialog>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Vitals</h2>
          {visit.status !== "completed" && visit.status !== "cancelled" && (
            <Button onClick={handleSaveVitals} isLoading={isSaving}>
              Save Vitals & Send to Doctor
            </Button>
          )}
        </div>
        <div
          className={`p-4 border rounded-card bg-card grid grid-cols-2 md:grid-cols-4 gap-4 ${visit.status === "completed" || visit.status === "cancelled" ? "opacity-70 pointer-events-none" : ""}`}
        >
          <Input
            label="Temp (°C)"
            type="number"
            value={vitalsForm.temperature_c}
            error={vitalsErrors.temperature_c}
            onChange={(e) =>
              setVitalsForm({ ...vitalsForm, temperature_c: e.target.value })
            }
          />
          <Input
            label="BP Systolic"
            type="number"
            value={vitalsForm.bp_systolic}
            error={vitalsErrors.bp_systolic}
            onChange={(e) =>
              setVitalsForm({ ...vitalsForm, bp_systolic: e.target.value })
            }
          />
          <Input
            label="BP Diastolic"
            type="number"
            value={vitalsForm.bp_diastolic}
            error={vitalsErrors.bp_diastolic}
            onChange={(e) =>
              setVitalsForm({ ...vitalsForm, bp_diastolic: e.target.value })
            }
          />
          <Input
            label="Pulse (bpm)"
            type="number"
            value={vitalsForm.pulse_bpm}
            error={vitalsErrors.pulse_bpm}
            onChange={(e) =>
              setVitalsForm({ ...vitalsForm, pulse_bpm: e.target.value })
            }
          />
          <Input
            label="SpO2 (%)"
            type="number"
            value={vitalsForm.spo2_percent}
            error={vitalsErrors.spo2_percent}
            onChange={(e) =>
              setVitalsForm({ ...vitalsForm, spo2_percent: e.target.value })
            }
          />
          <Input
            label="Resp. Rate"
            type="number"
            value={vitalsForm.respiratory_rate}
            error={vitalsErrors.respiratory_rate}
            onChange={(e) =>
              setVitalsForm({ ...vitalsForm, respiratory_rate: e.target.value })
            }
          />
          <Input
            label="Weight (kg)"
            type="number"
            value={vitalsForm.weight_kg}
            error={vitalsErrors.weight_kg}
            onChange={(e) =>
              setVitalsForm({ ...vitalsForm, weight_kg: e.target.value })
            }
          />
          <Input
            label="Height (cm)"
            type="number"
            value={vitalsForm.height_cm}
            error={vitalsErrors.height_cm}
            onChange={(e) =>
              setVitalsForm({ ...vitalsForm, height_cm: e.target.value })
            }
          />
          <div className="col-span-full p-3 bg-muted rounded-control flex justify-between items-center">
            <span className="text-sm font-medium">Computed BMI:</span>
            <span className="text-lg font-bold text-primary">
              {calculateBMI() || "--"} kg/m²
            </span>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Consultation</h2>
          {(userRole === "doctor" || userRole === "owner") &&
            visit.status !== "completed" &&
            visit.status !== "cancelled" && (
              <div className="flex gap-2">
                <Button onClick={handleSaveConsultation} isLoading={isSaving}>
                  Save Draft
                </Button>
                {visit.status === "waiting_doctor" && (
                  <Button
                    onClick={() => beginConsultation((window as any).userId)}
                    isLoading={isSaving}
                  >
                    Start Consultation
                  </Button>
                )}
              </div>
            )}
        </div>
        <div
          className={`p-4 border rounded-card bg-card space-y-4 ${userRole === "nurse" || visit.status === "completed" || visit.status === "cancelled" ? "opacity-70 pointer-events-none" : ""}`}
        >
          <div className="grid grid-cols-1 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">History</label>
              <textarea
                className="p-2 rounded-control border bg-background text-foreground h-24 focus:ring-2 focus:ring-primary/50 outline-none"
                value={consultForm.history}
                onChange={(e) =>
                  setConsultForm({ ...consultForm, history: e.target.value })
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Examination</label>
              <textarea
                className="p-2 rounded-control border bg-background text-foreground h-24 focus:ring-2 focus:ring-primary/50 outline-none"
                value={consultForm.examination}
                onChange={(e) =>
                  setConsultForm({
                    ...consultForm,
                    examination: e.target.value,
                  })
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Diagnosis</label>
              <textarea
                className="p-2 rounded-control border bg-background text-foreground h-24 focus:ring-2 focus:ring-primary/50 outline-none"
                value={consultForm.diagnosis}
                onChange={(e) =>
                  setConsultForm({ ...consultForm, diagnosis: e.target.value })
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Plan</label>
              <textarea
                className="p-2 rounded-control border bg-background text-foreground h-24 focus:ring-2 focus:ring-primary/50 outline-none"
                value={consultForm.plan}
                onChange={(e) =>
                  setConsultForm({ ...consultForm, plan: e.target.value })
                }
              />
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Prescriptions</h2>
          {visit.status !== "completed" && visit.status !== "cancelled" && (
            <Button onClick={handleCompleteVisit} isLoading={isSaving}>
              Complete Visit
            </Button>
          )}
        </div>
        <div
          className={`p-4 border rounded-card bg-card space-y-4 ${visit.status === "completed" || visit.status === "cancelled" ? "opacity-70 pointer-events-none" : ""}`}
        >
          <div className="flex gap-2">
            <Input
              placeholder="Search drug catalog..."
              className="flex-1"
              value={drugSearch}
              onChange={(e) => {
                const val = e.target.value;
                setDrugSearch(val);
                const filtered =
                  allDrugs.filter((d: any) =>
                    d.name.toLowerCase().includes(val.toLowerCase()),
                  ) || [];
                setFilteredDrugs(filtered);
              }}
            />
            <select
              className="px-3 py-2 rounded-control border bg-background text-foreground"
              onChange={(e) => {
                const drug = filteredDrugs.find((d) => d.id === e.target.value);
                if (drug) {
                  setPrescriptionsForm([
                    ...prescriptionsForm,
                    {
                      drug_id: drug.id,
                      dose: "",
                      frequency: "",
                      duration: "",
                      quantity: 1,
                      instructions: "",
                    },
                  ]);
                }
              }}
            >
              <option value="">Select Drug</option>
              {filteredDrugs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.strength})
                </option>
              ))}
            </select>
          </div>

          <Table
            columns={[
              { header: "Drug", accessor: "drug_name" },
              { header: "Dose", accessor: "dose" },
              { header: "Freq", accessor: "frequency" },
              { header: "Dur", accessor: "duration" },
              { header: "Qty", accessor: "quantity" },
              { header: "Action", accessor: "remove" },
            ]}
            data={prescriptionsForm.map((item, idx) => ({
              ...item,
              drug_name:
                filteredDrugs.find((d) => d.id === item.drug_id)?.name ||
                "Unknown",
              remove: (
                <Button
                  variant="ghost"
                  onClick={() =>
                    setPrescriptionsForm(
                      prescriptionsForm.filter((_, i) => i !== idx),
                    )
                  }
                >
                  ✕
                </Button>
              ),
            }))}
          />
        </div>
      </section>
    </div>
  );
};
