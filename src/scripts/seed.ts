import { supabaseAdmin } from '../config/supabase';

const DEFAULT_TRACKS = [
  'Frontend Development',
  'Backend Development',
  'Artificial Intelligence',
  'Cybersecurity',
  'Data Analysis',
  'UI / UX',
  'HR',
];

async function seed() {
  console.log('Starting database seeding...');

  try {
    // 1. Seed active season if none exists
    const { data: existingSeasons, error: seasonCheckError } = await supabaseAdmin
      .from('seasons')
      .select('id');

    if (seasonCheckError) throw seasonCheckError;

    let activeSeasonId = '';
    if (!existingSeasons || existingSeasons.length === 0) {
      console.log('Creating default Season 2026...');
      const { data: newSeason, error: seasonInsertError } = await supabaseAdmin
        .from('seasons')
        .insert({ name: 'Season 2026', is_active: true })
        .select()
        .single();

      if (seasonInsertError) throw seasonInsertError;
      activeSeasonId = newSeason.id;
      console.log('Default season created:', newSeason.name);
    } else {
      console.log('Seasons already exist.');
    }

    // 2. Seed default tracks
    const { data: existingTracks, error: trackCheckError } = await supabaseAdmin
      .from('tracks')
      .select('name');

    if (trackCheckError) throw trackCheckError;

    const existingTrackNames = existingTracks?.map((t) => t.name) || [];
    const tracksToInsert = DEFAULT_TRACKS.filter((t) => !existingTrackNames.includes(t));

    if (tracksToInsert.length > 0) {
      console.log(`Inserting ${tracksToInsert.length} new tracks...`);
      const { error: trackInsertError } = await supabaseAdmin
        .from('tracks')
        .insert(tracksToInsert.map((name) => ({ name })));

      if (trackInsertError) throw trackInsertError;
      console.log('Tracks inserted successfully.');
    } else {
      console.log('All default tracks already exist.');
    }

    // 3. Seed Leader account
    const leaderPhone = '01000000000';
    const leaderEmail = 'leader@sic.com';
    const leaderPassword = 'Password123!';
    const leaderName = 'SIC Leader';

    const { data: existingLeader, error: leaderCheckError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('phone', leaderPhone)
      .maybeSingle();

    if (leaderCheckError && leaderCheckError.code !== 'PGRST116') {
      throw leaderCheckError;
    }

    if (!existingLeader) {
      console.log('Creating primary Leader account...');

      // Check if user already exists in auth.users by email to prevent sign-up conflicts
      // We can search or try to create, if it fails because it exists, we can delete or link it.
      // Since it's clean setup, we createUser:
      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: leaderEmail,
        phone: leaderPhone,
        password: leaderPassword,
        phone_confirm: true,
        email_confirm: true,
        user_metadata: {
          name: leaderName,
          role: 'leader',
          is_active: true,
        },
      });

      if (authError) {
        // If it already exists in auth, try to delete it first and recreate to keep things clean
        if (authError.message.includes('already registered') || authError.message.includes('already exists')) {
          console.log('Auth user exists but not profile. Syncing or recreating...');
          // Clean up first
          const { data: usersList } = await supabaseAdmin.auth.admin.listUsers();
          const existingAuthUser = usersList.users.find(u => u.email === leaderEmail || u.phone === leaderPhone);
          if (existingAuthUser) {
            await supabaseAdmin.auth.admin.deleteUser(existingAuthUser.id);
            // Recreate
            const { data: newAuthUser, error: retryError } = await supabaseAdmin.auth.admin.createUser({
              email: leaderEmail,
              phone: leaderPhone,
              password: leaderPassword,
              phone_confirm: true,
              email_confirm: true,
              user_metadata: {
                name: leaderName,
                role: 'leader',
                is_active: true,
              },
            });
            if (retryError) throw retryError;
            console.log('Leader account successfully recreated and synced:', newAuthUser.user?.id);
          }
        } else {
          throw authError;
        }
      } else {
        console.log('Leader account successfully created:', authUser.user?.id);
      }
    } else {
      console.log('Leader account already exists.');
    }

    console.log('Database seeding completed successfully.');
  } catch (err) {
    console.error('Error seeding database:', err);
  }
}

seed();
