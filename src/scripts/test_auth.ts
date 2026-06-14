import { supabaseAdmin } from "../config/supabase";

async function run() {
  console.log("Testing with email/password (leader@sic-communinty.com)...");
  const emailRes = await supabaseAdmin.auth.signInWithPassword({
    email: "leader@sic-communinty.com",
    password: "Password123!"
  });
  console.log("Email error:", emailRes.error?.message, "status:", emailRes.error?.status);
  console.log("Email user ID:", emailRes.data?.user?.id);
}

run();
