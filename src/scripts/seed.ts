import { supabaseAdmin } from "../config/supabase";

const DEFAULT_TRACKS = [
  "Frontend Development",
  "Backend Development",
  "Artificial Intelligence",
  "Cybersecurity",
  "Data Analysis",
  "UI / UX",
  "HR",
];

interface SeedUser {
  email: string;
  phone: string;
  password?: string;
  name: string;
  role: 'leader' | 'head' | 'hr';
  head_type?: 'head' | 'vice_head' | null;
  track_id?: string | null;
  is_active: boolean;
}

const normalizePhoneToDigits = (phone: string | undefined): string => {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
};

async function ensureUserExists(user: SeedUser, authUsers: any[]) {
  // Check existence ONLY in authUsers list first
  const existingAuthUser = authUsers.find((u) => {
    const emailMatch = !!(u.email && user.email && u.email.toLowerCase().trim() === user.email.toLowerCase().trim());
    const phoneMatch = !!(u.phone && user.phone && normalizePhoneToDigits(u.phone) === normalizePhoneToDigits(user.phone));
    return emailMatch || phoneMatch;
  });

  let userId: string;

  if (existingAuthUser) {
    console.log(`[SKIP] Auth user already exists: ${user.name} (${user.email} / phone: ${user.phone})`);
    userId = existingAuthUser.id;
  } else {
    console.log(`[CREATE] Creating Auth user: ${user.name} (${user.email})...`);
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: user.email,
      phone: user.phone,
      password: user.password || "Password123!",
      phone_confirm: true,
      email_confirm: true,
      user_metadata: {
        name: user.name,
        role: user.role,
        head_type: user.head_type || null,
        track_id: user.track_id || "",
        is_active: user.is_active,
      },
    });

    if (authError) {
      console.error(`[ERROR] Failed to create Auth user for ${user.email}:`, authError.message);
      throw authError;
    }

    if (!authData.user) {
      throw new Error(`Auth user creation returned empty data for ${user.email}`);
    }

    userId = authData.user.id;
    console.log(`[CREATE] Auth user created successfully for ${user.name} (ID: ${userId})`);
  }

  // Ensure public.users profile exists (create if missing)
  const { data: profile, error: profileCheckError } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (profileCheckError) {
    console.error(`[ERROR] Failed to check profile for ${user.email}:`, profileCheckError);
    throw profileCheckError;
  }

  if (!profile) {
    console.log(`[SYNC] Profile missing in public.users for ${user.name}. Creating...`);
    const { error: profileInsertError } = await supabaseAdmin
      .from("users")
      .insert({
        id: userId,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        head_type: user.head_type || null,
        track_id: user.track_id || null,
        is_active: user.is_active,
      });

    if (profileInsertError) {
      console.error(`[ERROR] Failed to sync profile for ${user.email}:`, profileInsertError);
      throw profileInsertError;
    }
    console.log(`[SYNC] Profile created/synced successfully in public.users for ${user.name}`);
  } else {
    console.log(`[SKIP] Profile already exists in public.users for ${user.name}`);
  }
}

async function seed() {
  console.log("Starting database seeding...");

  try {
    // 1. Seed active season if none exists
    const { data: existingSeasons, error: seasonCheckError } =
      await supabaseAdmin.from("seasons").select("id");

    if (seasonCheckError) throw seasonCheckError;

    let activeSeasonId = "";
    if (!existingSeasons || existingSeasons.length === 0) {
      console.log("Creating default Season 2026...");
      const { data: newSeason, error: seasonInsertError } = await supabaseAdmin
        .from("seasons")
        .insert({ name: "Season 2026", is_active: true })
        .select()
        .single();

      if (seasonInsertError) throw seasonInsertError;
      activeSeasonId = newSeason.id;
      console.log("Default season created:", newSeason.name);
    } else {
      console.log("Seasons already exist.");
    }

    // 2. Seed default tracks
    const { data: existingTracks, error: trackCheckError } = await supabaseAdmin
      .from("tracks")
      .select("name");

    if (trackCheckError) throw trackCheckError;

    const existingTrackNames = existingTracks?.map((t) => t.name) || [];
    const tracksToInsert = DEFAULT_TRACKS.filter(
      (t) => !existingTrackNames.includes(t),
    );

    if (tracksToInsert.length > 0) {
      console.log(`Inserting ${tracksToInsert.length} new tracks...`);
      const { error: trackInsertError } = await supabaseAdmin
        .from("tracks")
        .insert(tracksToInsert.map((name) => ({ name })));

      if (trackInsertError) throw trackInsertError;
      console.log("Tracks inserted successfully.");
    } else {
      console.log("All default tracks already exist.");
    }

    // 3. Seed Leader account
    const leaderPhone = "+201228895185";
    const leaderEmail = "leader@sic-communinty.com";
    const leaderPassword = "Password123!";
    const leaderName = "SIC Leader";

    // Fetch all existing Auth users
    console.log("Fetching existing Auth users...");
    const { data: usersList, error: authListError } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000
    });
    if (authListError) throw authListError;

    const authUsers = usersList?.users || [];
    console.log(`Fetched ${authUsers.length} existing Auth users.`);

    const leaderUser: SeedUser = {
      email: leaderEmail,
      phone: leaderPhone,
      password: leaderPassword,
      name: leaderName,
      role: "leader",
      is_active: true,
    };

    await ensureUserExists(leaderUser, authUsers);

    console.log("Database seeding completed successfully.");
  } catch (err) {
    console.error("Error seeding database:", err);
  }
}

seed();
