import { supabaseAdmin } from "../config/supabase";

async function run() {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("*, tracks(name)")
    .eq("email", "omar@hr.com")
    .single();

  if (error) {
    console.error("Error fetching user:", error);
  } else {
    console.log("Omar's profile in DB:", data);
  }
}

run();
