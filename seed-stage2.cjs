const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function seed() {
  console.log("🚀 Starting Resilient Stage 2 Seed...");

  // 1. Seed Drug Catalog
  const drugs = [
    {
      name: "Paracetamol",
      strength: "500mg",
      form: "Tablet",
      unit_price_kobo: 500,
    },
    {
      name: "Amoxicillin",
      strength: "500mg",
      form: "Capsule",
      unit_price_kobo: 1200,
    },
    {
      name: "Metformin",
      strength: "500mg",
      form: "Tablet",
      unit_price_kobo: 800,
    },
    {
      name: "Amlodipine",
      strength: "5mg",
      form: "Tablet",
      unit_price_kobo: 600,
    },
    {
      name: "Atorvastatin",
      strength: "20mg",
      form: "Tablet",
      unit_price_kobo: 1500,
    },
    {
      name: "Omeprazole",
      strength: "20mg",
      form: "Capsule",
      unit_price_kobo: 700,
    },
    {
      name: "Salbutamol",
      strength: "100mcg",
      form: "Inhaler",
      unit_price_kobo: 3000,
    },
    {
      name: "Diclofenac",
      strength: "50mg",
      form: "Tablet",
      unit_price_kobo: 400,
    },
    {
      name: "Cetirizine",
      strength: "10mg",
      form: "Tablet",
      unit_price_kobo: 300,
    },
    {
      name: "Ibuprofen",
      strength: "400mg",
      form: "Tablet",
      unit_price_kobo: 450,
    },
    {
      name: "Albendazole",
      strength: "400mg",
      form: "Tablet",
      unit_price_kobo: 200,
    },
    {
      name: "Glibenclamide",
      strength: "5mg",
      form: "Tablet",
      unit_price_kobo: 500,
    },
    {
      name: "Hydrochlorothiazide",
      strength: "25mg",
      form: "Tablet",
      unit_price_kobo: 300,
    },
    {
      name: "Loperamide",
      strength: "2mg",
      form: "Capsule",
      unit_price_kobo: 250,
    },
    {
      name: "Prednisolone",
      strength: "5mg",
      form: "Tablet",
      unit_price_kobo: 350,
    },
    {
      name: "Azithromycin",
      strength: "500mg",
      form: "Tablet",
      unit_price_kobo: 2000,
    },
    {
      name: "Ciprofloxacin",
      strength: "500mg",
      form: "Tablet",
      unit_price_kobo: 1800,
    },
    {
      name: "Fluconazole",
      strength: "150mg",
      form: "Capsule",
      unit_price_kobo: 1100,
    },
    {
      name: "Lansoprazole",
      strength: "30mg",
      form: "Capsule",
      unit_price_kobo: 900,
    },
    {
      name: "Furosemide",
      strength: "40mg",
      form: "Tablet",
      unit_price_kobo: 300,
    },
  ];

  console.log("Seeding drugs...");
  for (const drug of drugs) {
    await supabase.from("drugs").upsert(
      {
        name: drug.name,
        strength: drug.strength,
        form: drug.form,
        unit_price_kobo: drug.unit_price_kobo,
      },
      { onConflict: "name" },
    );
    await sleep(50);
  }

  // 2. Seed Fake Patients
  const firstNames = [
    "Chidi",
    "Amaka",
    "Olumide",
    "Zainab",
    "Emeka",
    "Blessing",
    "Tunde",
    "Fatima",
    "Nneka",
    "Kelechi",
  ];
  const lastNames = [
    "Okoro",
    "Adeyemi",
    "Bello",
    "Nwosu",
    "Eze",
    "Okonkwo",
    "Obi",
    "Yusuf",
    "Ibrahim",
    "Danjuma",
  ];

  console.log("Seeding patients...");
  for (let i = 1; i <= 40; i++) {
    const fn = firstNames[Math.floor(Math.random() * firstNames.length)];
    const ln = lastNames[Math.floor(Math.random() * lastNames.length)];
    const phone = `080${Math.floor(10000000 + Math.random() * 90000000)}`;

    const patient = {
      patient_number: `PT-${String(i).padStart(6, "0")}`,
      full_name: `${fn} ${ln}`,
      sex: i % 2 === 0 ? "Male" : "Female",
      date_of_birth: new Date(
        1950 + Math.random() * 50,
        Math.floor(Math.random() * 12),
        Math.floor(Math.random() * 28),
      )
        .toISOString()
        .split("T")[0],
      phone: phone,
      next_of_kin_name: `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`,
      next_of_kin_phone: `080${Math.floor(10000000 + Math.random() * 90000000)}`,
      blood_group: ["A+", "B+", "O+", "AB+", "O-"][
        Math.floor(Math.random() * 5)
      ],
    };

    await supabase
      .from("patients")
      .upsert(patient, { onConflict: "patient_number" });
    await sleep(50);
  }

  const { data: insertedPatients } = await supabase.from("patients").select();
  if (!insertedPatients) {
    console.error("Failed to fetch patients after seeding.");
    return;
  }

  // 3. Seed Visits
  console.log("Seeding visits...");
  const { data: staff } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("is_active", true);
  const doctors = staff.filter((s) => s.role === "doctor");
  const nurses = staff.filter((s) => s.role === "nurse");

  if (!doctors.length || !nurses.length) {
    console.error("❌ Need at least one doctor and one nurse to seed visits!");
    return;
  }

  for (const patient of insertedPatients) {
    const visitCount = Math.floor(Math.random() * 3) + 1;
    for (let j = 0; j < visitCount; j++) {
      const status = [
        "waiting_triage",
        "waiting_doctor",
        "in_consultation",
        "completed",
        "cancelled",
      ][Math.floor(Math.random() * 5)];
      const created_at = new Date();
      created_at.setDate(created_at.getDate() - Math.floor(Math.random() * 14));

      const { data: visit, error: vError } = await supabase
        .from("visits")
        .insert({
          patient_id: patient.id,
          status: status,
          reason: "General checkup",
          created_by: nurses[0].id,
          created_at: created_at.toISOString(),
          assigned_doctor_id: status === "completed" ? doctors[0].id : null,
        })
        .select()
        .single();

      if (vError) {
        console.error(
          `Error inserting visit for ${patient.patient_number}:`,
          vError.message,
        );
        continue;
      }

      if (visit && status === "completed") {
        await supabase.from("vitals").insert({
          visit_id: visit.id,
          temperature_c: 36.5 + Math.random(),
          bp_systolic: 110 + Math.floor(Math.random() * 30),
          bp_diastolic: 70 + Math.floor(Math.random() * 20),
          pulse_bpm: 60 + Math.floor(Math.random() * 40),
          spo2_percent: 95 + Math.floor(Math.random() * 5),
          weight_kg: 60 + Math.random() * 40,
          height_cm: 160 + Math.random() * 20,
          recorded_by: nurses[0].id,
        });
        await supabase.from("consultations").insert({
          visit_id: visit.id,
          history: "Patient reports mild fever",
          examination: "Lungs clear, Heart sounds normal",
          diagnosis: "Common Cold",
          plan: "Rest and hydration",
          doctor_id: doctors[0].id,
        });
      }
      await sleep(50);
    }
  }

  console.log("✅ Stage 2 Seeding completed successfully!");
}

seed().catch(console.error);
