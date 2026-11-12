import { useState, useEffect } from "react";
import {
  Button,
  Input,
  Table,
  Badge,
  Skeleton,
  Dialog,
  useToast,
} from "../../components/ui";
import { useVisit } from "./useVisit";
import type { Drug, PrescriptionItem } from "../drugs/types";
import { supabase } from "../../lib/supabase";
import { formatNaira } from "../../lib/formatters";

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
    cancelVisit,
    isSaving,
    vitals,
    consultation,
    prescriptions,
  } = useVisit(visitId);

  const { addToast } = useToast();

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
  const [isAddChargeOpen, setIsAddChargeOpen] = useState(false);

  // Charges (Stage 3)
  const [chargeServiceId, setChargeServiceId] = useState("");
  const [chargeQuantity, setChargeQuantity] = useState("1");
  const [chargeError, setChargeError] = useState("");
  const [allServices, setAllServices] = useState<any[]>([]);
  const [visitCharges, setVisitCharges] = useState<any[]>([]);

  // Load drug catalog for search
  useEffect(() => {
    const loadDrugs = async () => {
      const { data, error } = await supabase
        .from("drugs")
        .select("*")
        .eq("is_active", true);
      if (error) {
        addToast(`Failed to load drug catalog: ${error.message}`, "error");
        return;
      }
      if (data) {
        const drugs = data as Drug[];
        setAllDrugs(drugs);
        setFilteredDrugs(drugs);
      }
    };
    loadDrugs();
  }, [addToast]);

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
    if (prescriptions && prescriptionsForm.length === 0) {
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

    // Load services and existing charges for this visit
    if (visit) {
      (async () => {
        const { data } = await supabase
          .from("services")
          .select("*")
          .eq("is_active", true)
          .order("name", { ascending: true });
        if (data) setAllServices(data as any[]);

        const { data: charges } = await supabase
          .from("visit_charges")
          .select("*, services(name)")
          .eq("visit_id", visitId)
          .order("created_at", { ascending: true });
        if (charges) {
          setVisitCharges(
            charges.map((c: any) => ({
              ...c,
              service_name: c.services?.name || c.service_name || "Unknown Service",
            }))
          );
        }
      })();
    }
  }, [vitals, consultation, prescriptions, visit, visitId, prescriptionsForm.length]);

  const handleAddCharge = async (e: React.FormEvent) => {
    e.preventDefault();
    setChargeError("");
    const serviceId = chargeServiceId;
    const quantity = parseInt(chargeQuantity, 10);
    if (!serviceId) {
      setChargeError("Select a service.");
      addToast("Select a service.", "error");
      return;
    }
    if (isNaN(quantity) || quantity <= 0) {
      setChargeError("Enter a valid quantity.");
      addToast("Enter a valid quantity.", "error");
      return;
    }
    try {
      const { data: newCharge, error: rpcError } = await supabase.rpc("add_visit_charge", {
        p_visit_id: visitId,
        p_service_id: serviceId,
        p_quantity: quantity,
      });

      if (rpcError) {
        setChargeError(rpcError.message || "Failed to add charge.");
        addToast(rpcError.message || "Failed to add charge.", "error");
        return;
      }

      setChargeServiceId("");
      setChargeQuantity("1");

      // Optimistically add to local state so it appears immediately
      const service = allServices.find((s: any) => s.id === serviceId);
      const unitPrice = service?.unit_price_kobo || 0;
      const optimisticCharge = {
        id: newCharge?.id || `temp-${Date.now()}`,
        visit_id: visitId,
        service_id: serviceId,
        service_name: service?.name || "Unknown Service",
        quantity: quantity,
        unit_price_kobo: unitPrice,
        line_total_kobo: unitPrice * quantity,
        added_by: (window as any).userId,
        created_at: new Date().toISOString(),
      };
      setVisitCharges((prev: any[]) => [...prev, optimisticCharge]);

      // Refetch to sync with the server
      const { data: charges, error: refetchError } = await supabase
        .from("visit_charges")
        .select("*, services(name)")
        .eq("visit_id", visitId)
        .order("created_at", { ascending: true });

      if (refetchError) {
        addToast("Charge added, but failed to refresh the list. Please reload.", "error");
        return;
      }

      if (charges) {
        setVisitCharges(
          charges.map((c: any) => ({
            ...c,
            service_name: c.services?.name || c.service_name || "Unknown Service",
          }))
        );
      }
      addToast("Charge added successfully.", "success");
    } catch (err: any) {
      setChargeError(err.message || "Failed to add charge.");
      addToast(err.message || "Failed to add charge.", "error");
    }
  };

  const handleRemoveCharge = async (id: string) => {
    // Save previous state in case we need to revert
    const previousCharges = visitCharges;

    // Optimistically remove immediately
    setVisitCharges((prev: any[]) => prev.filter((c) => c.id !== id));

    try {
      const { error: deleteError } = await supabase
        .from("visit_charges")
        .delete()
        .eq("id", id);

      if (deleteError) {
        // Revert optimistic removal on server error
        setVisitCharges(previousCharges);
        addToast(deleteError.message || "Failed to remove charge from server.", "error");
        return;
      }

      addToast("Charge removed.", "success");

      // Refetch to sync with server
      const { data: charges, error: refetchError } = await supabase
        .from("visit_charges")
        .select("*, services(name)")
        .eq("visit_id", visitId)
        .order("created_at", { ascending: true });

      if (refetchError) {
        addToast("Charge removed, but failed to sync with server. Please reload.", "error");
        return;
      }

      if (charges) {
        setVisitCharges(
          charges.map((c: any) => ({
            ...c,
            service_name: c.services?.name || c.service_name || "Unknown Service",
          }))
        );
      }
    } catch (err: any) {
      // Revert optimistic removal on exception
      setVisitCharges(previousCharges);
      addToast(err.message || "Failed to remove charge.", "error");
    }
  };

  const handleCompleteVisit = async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      const userId = user?.id;

      if (!userId || authError) {
        throw new Error("User session not found. Please log in again.");
      }

      // 1. Insert or update the consultation
      const { error: consultError } = await supabase.from("consultations").upsert({
        visit_id: visitId,
        history: consultForm.history || "",
        examination: consultForm.examination || "",
        diagnosis: consultForm.diagnosis || "",
        plan: consultForm.plan || "",
        doctor_id: userId,
        updated_at: new Date().toISOString(),
      });
      if (consultError) throw consultError;

      // 2. Insert prescription items and capture their IDs (for invoice cross-reference)
      const prescriptionItemIds: Record<string, string> = {};
      if (prescriptionsForm.length > 0) {
        const prescriptionRows = prescriptionsForm.map((p) => ({
          visit_id: visitId,
          drug_id: p.drug_id,
          dose: p.dose || "",
          frequency: p.frequency || "",
          duration: p.duration || "",
          quantity: p.quantity || 1,
          instructions: p.instructions || "",
        }));
        const { data: insertedPrescriptions, error: presError } = await supabase
          .from("prescription_items")
          .insert(prescriptionRows)
          .select("id, drug_id");
        if (presError) throw presError;

        insertedPrescriptions?.forEach((pi) => {
          prescriptionItemIds[pi.drug_id] = pi.id;
        });
      }

      // 3. Find or create the invoice for this visit
      let invoiceId: string;
      const { data: existingInvoice, error: invFetchError } = await supabase
        .from("invoices")
        .select("id")
        .eq("visit_id", visitId)
        .maybeSingle();

      if (invFetchError) throw invFetchError;

      if (existingInvoice?.id) {
        invoiceId = existingInvoice.id;
        // Clear existing items to avoid duplicates on retry
        await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
      } else {
        // Get the active visit fee service
        const { data: feeService } = await supabase
          .from("services")
          .select("unit_price_kobo")
          .eq("is_visit_fee", true)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        const visitFee = feeService?.unit_price_kobo || 0;

        // Create invoice number client-side
        const invoiceNumber = `INV-${Math.floor(100000 + Math.random() * 900000)}`;

        const { data: newInvoice, error: invError } = await supabase
          .from("invoices")
          .insert({
            patient_id: (visit as any)?.patient_id,
            visit_id: visitId,
            invoice_number: invoiceNumber,
            status: "unpaid",
            subtotal_kobo: visitFee,
            discount_kobo: 0,
            total_kobo: visitFee,
            amount_paid_kobo: 0,
            created_by: userId,
          })
          .select("id")
          .single();

        if (invError) throw invError;
        invoiceId = newInvoice.id;

        // Add consultation fee line item
        if (visitFee > 0) {
          const { error: itemError } = await supabase.from("invoice_items").insert({
            invoice_id: invoiceId,
            description: "Consultation fee",
            quantity: 1,
            unit_price_kobo: visitFee,
            line_total_kobo: visitFee,
            source: "visit_fee",
          });
          if (itemError) throw itemError;
        }
      }

      // 4. Fetch fresh visit charges from database (not local state)
      const { data: charges } = await supabase
        .from("visit_charges")
        .select("*, services(name)")
        .eq("visit_id", visitId);

      if (charges && charges.length > 0) {
        const chargeRows = charges.map((c: any) => ({
          invoice_id: invoiceId,
          description: c.services?.name || "Service Charge",
          quantity: c.quantity || 1,
          unit_price_kobo: c.unit_price_kobo || 0,
          line_total_kobo: (c.quantity || 1) * (c.unit_price_kobo || 0),
          source: "service",
        }));
        const { error: chargeError } = await supabase
          .from("invoice_items")
          .insert(chargeRows);
        if (chargeError) throw chargeError;
      }

      // 5. Add prescribed drugs as invoice line items (snapshot price from drug catalog)
      for (const p of prescriptionsForm) {
        const { data: drug } = await supabase
          .from("drugs")
          .select("name, unit_price_kobo, strength")
          .eq("id", p.drug_id)
          .single();

        if (drug) {
          const qty = p.quantity || 1;
          const unitPrice = (drug as any).unit_price_kobo || 0;
          const description = `${drug.name}${drug.strength ? ` ${drug.strength}` : ""}`;

          const { error: drugItemError } = await supabase.from("invoice_items").insert({
            invoice_id: invoiceId,
            description,
            quantity: qty,
            unit_price_kobo: unitPrice,
            line_total_kobo: qty * unitPrice,
            source: "drug",
            prescription_item_id: prescriptionItemIds[p.drug_id] || null,
          });
          if (drugItemError) throw drugItemError;
        }
      }

      // 6. Recompute invoice totals from all line items
      const { data: allItems } = await supabase
        .from("invoice_items")
        .select("line_total_kobo")
        .eq("invoice_id", invoiceId);

      const subtotal = allItems?.reduce((sum, item) => sum + (item.line_total_kobo || 0), 0) || 0;

      await supabase
        .from("invoices")
        .update({
          subtotal_kobo: subtotal,
          total_kobo: subtotal,
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoiceId);

      // 7. Mark the visit as completed
      const { error: visitError } = await supabase
        .from("visits")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", visitId);

      if (visitError) throw visitError;

      addToast("Visit completed successfully!", "success");
    } catch (err: any) {
      console.error(err.message);
      addToast(`Error completing visit: ${err.message}`, "error");
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
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;

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
      addToast("Consultation saved successfully!", "success");
    } catch (err: any) {
      console.error(err.message);
      addToast(`Error saving consultation: ${err.message}`, "error");
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
                {consultation || visit.status === "in_consultation" ? (
                  <Button onClick={handleSaveConsultation} isLoading={isSaving}>
                    Save Draft
                  </Button>
                ) : (
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
        </div>
        <div
          className={`p-4 border rounded-card bg-card space-y-4 ${visit.status === "completed" || visit.status === "cancelled" ? "opacity-70 pointer-events-none" : ""}`}
        >
          <div className="space-y-2">
            <div className="relative w-full max-w-md">
              <Input
                placeholder="Search drug catalog..."
                className="w-full"
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
              {drugSearch.trim() !== "" && filteredDrugs.length > 0 && (
                <div className="absolute z-20 w-full bg-background border border-input rounded-control shadow-lg mt-1 max-h-48 overflow-y-auto">
                  {filteredDrugs.slice(0, 8).map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => {
                        setPrescriptionsForm([
                          ...prescriptionsForm,
                          {
                            drug_id: d.id,
                            dose: "",
                            frequency: "",
                            duration: "",
                            quantity: 1,
                            instructions: "",
                          },
                        ]);
                        setDrugSearch("");
                        setFilteredDrugs(allDrugs);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted hover:text-primary transition-colors border-b last:border-0"
                    >
                      <div className="font-medium">{d.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {d.strength} · {d.form} · {formatNaira((d as any).unit_price_naira ?? 0)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button
              onClick={() => {
                const drug =
                  filteredDrugs.find(
                    (d) => d.name.toLowerCase() === drugSearch.toLowerCase(),
                  ) || filteredDrugs[0];
                if (!drug) return;
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
                setDrugSearch("");
                setFilteredDrugs(allDrugs);
              }}
              className="w-full md:w-auto"
              disabled={filteredDrugs.length === 0 || drugSearch.trim() === ""}
            >
              Add Selected Drug
            </Button>
          </div>

          <div className="space-y-3">
            {prescriptionsForm.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-4">
                No drugs prescribed yet. Search and add one above.
              </div>
            ) : (
              <div className="space-y-2">
                {prescriptionsForm.map((item, idx) => {
                  const drug = allDrugs.find((d) => d.id === item.drug_id);
                  return (
                    <div
                      key={item.drug_id || idx}
                      className="p-3 border rounded-control bg-background flex flex-col md:flex-row md:items-center gap-3"
                    >
                      <div className="w-full md:w-48 flex flex-col gap-1">
                        <span className="text-sm font-medium text-foreground">
                          {drug?.name || "Unknown"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {drug?.strength || ""} · {drug?.form || ""}
                        </span>
                      </div>
                      <div className="flex flex-col md:flex-row md:gap-3 gap-2 w-full md:w-auto min-w-[120px]">
                        <Input
                          label="Dose"
                          className="w-full"
                          value={item.dose}
                          onChange={(e) =>
                            setPrescriptionsForm(
                              prescriptionsForm.map((p, i) =>
                                i === idx ? { ...p, dose: e.target.value } : p,
                              ),
                            )
                          }
                        />
                        <Input
                          label="Frequency"
                          className="w-full"
                          value={item.frequency}
                          onChange={(e) =>
                            setPrescriptionsForm(
                              prescriptionsForm.map((p, i) =>
                                i === idx
                                  ? { ...p, frequency: e.target.value }
                                  : p,
                              ),
                            )
                          }
                        />
                        <Input
                          label="Duration"
                          className="w-full"
                          value={item.duration}
                          onChange={(e) =>
                            setPrescriptionsForm(
                              prescriptionsForm.map((p, i) =>
                                i === idx
                                  ? { ...p, duration: e.target.value }
                                  : p,
                              ),
                            )
                          }
                        />
                        <Input
                          label="Qty"
                          type="number"
                          className="w-full"
                          value={String(item.quantity)}
                          onChange={(e) =>
                            setPrescriptionsForm(
                              prescriptionsForm.map((p, i) =>
                                i === idx
                                  ? {
                                      ...p,
                                      quantity: parseInt(e.target.value) || 1,
                                    }
                                  : p,
                              ),
                            )
                          }
                        />
                        <div className="md:flex-none flex items-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() =>
                              setPrescriptionsForm(
                                prescriptionsForm.filter((_, i) => i !== idx),
                              )
                            }
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Charges (Stage 3) — add billable services before the visit is completed. */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Charges</h2>
          {visit.status !== "completed" && visit.status !== "cancelled" && (
            <Button onClick={() => setIsAddChargeOpen(true)}>Add Charge</Button>
          )}
        </div>
        <div
          className={`p-4 border rounded-card bg-card space-y-4 ${visit.status === "completed" || visit.status === "cancelled" ? "opacity-70 pointer-events-none" : ""}`}
        >
          {chargeError && (
            <div className="text-sm text-destructive">{chargeError}</div>
          )}
          {visitCharges.length === 0 ? (
            <div className="text-sm text-muted-foreground">No charges added yet.</div>
          ) : (
            <Table
              columns={[
                { header: "Service", accessor: "service_name" },
                { header: "Qty", accessor: "quantity" },
                { header: "Unit Price", accessor: "unit_price_kobo" },
                { header: "Total", accessor: "line_total_kobo" },
                { header: "Action", accessor: "action" },
              ]}
              data={visitCharges.map((c: any) => ({
                ...c,
                unit_price_kobo: formatNaira(c.unit_price_kobo),
                line_total_kobo: formatNaira(
                  (c.quantity as number) * (c.unit_price_kobo as number),
                ),
                action: (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveCharge(c.id as string)}
                  >
                    Remove
                  </Button>
                ),
              }))}
            />
          )}
        </div>
      </section>

      {/* Complete Visit — final action at the very bottom of the page */}
      {visit.status !== "completed" && visit.status !== "cancelled" && (
        <div className="flex justify-end pt-6">
          <Button
            onClick={handleCompleteVisit}
            isLoading={isSaving}
            className="w-full md:w-auto"
          >
            Complete Visit
          </Button>
        </div>
      )}

      {/* Add Charge Dialog */}
      <Dialog
        isOpen={isAddChargeOpen}
        onClose={() => setIsAddChargeOpen(false)}
        title="Add Charge"
      >
        <form onSubmit={handleAddCharge} className="space-y-4">
          <div className="flex flex-col gap-1.5 w-full">
            <label className="text-sm font-medium text-foreground/80">Service</label>
            <select
              className="px-3 py-2 rounded-control border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              value={chargeServiceId}
              onChange={(e) => setChargeServiceId(e.target.value)}
              required
            >
              <option value="">Select a service</option>
              {allServices.map((s: any) => (
                <option key={s.id} value={s.id as string}>
                  {s.name} — {formatNaira(s.unit_price_kobo)}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Quantity"
              type="number"
              value={chargeQuantity}
              onChange={(e) => setChargeQuantity(e.target.value)}
              required
            />
          </div>
          <p className="text-xs text-muted-foreground">
            The charge is snapshot at the service's current price and added to
            the invoice when the visit is completed.
          </p>
          <Button type="submit" className="w-full" isLoading={isSaving}>
            Add Charge
          </Button>
        </form>
      </Dialog>
    </div>
  );
};
