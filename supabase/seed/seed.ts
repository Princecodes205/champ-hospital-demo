// @ts-ignore
import { createClient } from "@supabase/supabase-js";
// @ts-ignore
import * as dotenv from "https://deno.land/std@0.200.0/dotenv/mod.ts";

// @ts-ignore
dotenv.load();

/**
 * This file is executed by the Deno runtime.
 * To stop the IDE (Node.js TS) from showing red lines,
 * we access Deno via the globalThis object.
 */
const env = (globalThis as any).Deno?.env;

const supabaseUrl = env?.get("SUPABASE_URL") || env?.get("VITE_SUPABASE_URL");
const supabaseKey = env?.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing environment variables: SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required.",
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seed() {
  const ownerUsername = env?.get("SEED_OWNER_USERNAME") || "admin";
  const ownerPassword = env?.get("SEED_OWNER_PASSWORD") || "password123";

  console.log("Seeding initial owner...");
  const { data: ownerUser, error: ownerError } =
    await supabase.auth.admin.createUser({
      email: `${ownerUsername}@staff.champhospital.internal`,
      password: ownerPassword,
      email_confirm: true,
      user_metadata: { username: ownerUsername },
    });

  if (ownerError || !ownerUser?.user)
    throw ownerError || new Error("Failed to create owner user");

  await supabase.from("profiles").insert({
    id: ownerUser.user.id,
    username: ownerUsername,
    full_name: "Hospital Owner",
    role: "owner",
    is_active: true,
  });

  console.log("Seeding demo staff...");
  const staff = [
    {
      username: "dr_smith",
      password: "password123",
      full_name: "Dr. Smith",
      role: "doctor",
    },
    {
      username: "nurse_jane",
      password: "password123",
      full_name: "Nurse Jane",
      role: "nurse",
    },
  ];

  for (const s of staff) {
    const { data: user, error: uErr } = await supabase.auth.admin.createUser({
      email: `${s.username}@staff.champhospital.internal`,
      password: s.password,
      email_confirm: true,
      user_metadata: { username: s.username },
    });
    if (uErr || !user?.user)
      throw uErr || new Error(`Failed to create user ${s.username}`);
    await supabase.from("profiles").insert({
      id: user.user.id,
      username: s.username,
      full_name: s.full_name,
      role: s.role,
      is_active: true,
    });
  }

  console.log("Seeding completed successfully.");
}

seed().catch(console.error);
