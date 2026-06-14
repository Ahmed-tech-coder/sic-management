"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_1 = require("../config/supabase");
async function run() {
    const { data, error } = await supabase_1.supabaseAdmin
        .from("users")
        .select("*, tracks(name)")
        .eq("email", "omar@hr.com")
        .single();
    if (error) {
        console.error("Error fetching user:", error);
    }
    else {
        console.log("Omar's profile in DB:", data);
    }
}
run();
