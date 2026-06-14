"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setActiveSeason = exports.createSeason = exports.getSeasons = void 0;
const supabase_1 = require("../config/supabase");
const zod_1 = require("zod");
const createSeasonSchema = zod_1.z.object({
    name: zod_1.z.string().min(3, 'Season name must be at least 3 characters'),
});
const getSeasons = async (req, res) => {
    try {
        const client = (0, supabase_1.getSupabaseClient)(req.token);
        const { data: seasons, error } = await client
            .from('seasons')
            .select('*')
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        return res.status(200).json({ seasons });
    }
    catch (err) {
        console.error('Get seasons error:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
exports.getSeasons = getSeasons;
const createSeason = async (req, res) => {
    try {
        const parsed = createSeasonSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Validation error' });
        }
        const { name } = parsed.data;
        const client = (0, supabase_1.getSupabaseClient)(req.token);
        // Call insert using the user client (RLS enforces leader role)
        const { data: newSeason, error } = await client
            .from('seasons')
            .insert({ name, is_active: false })
            .select()
            .single();
        if (error) {
            if (error.code === '23505') {
                return res.status(400).json({ error: 'A season with this name already exists' });
            }
            throw error;
        }
        // Log admin action
        await supabase_1.supabaseAdmin.from('activity_logs').insert({
            user_id: req.user?.id,
            action: 'Created Season',
            entity_type: 'seasons',
            entity_id: newSeason.id,
            description: `Created season "${name}"`,
        });
        return res.status(201).json({ message: 'Season created successfully', season: newSeason });
    }
    catch (err) {
        console.error('Create season error:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
exports.createSeason = createSeason;
const setActiveSeason = async (req, res) => {
    try {
        const { id } = req.params;
        const client = (0, supabase_1.getSupabaseClient)(req.token);
        // First check if season exists
        const { data: season, error: checkError } = await client
            .from('seasons')
            .select('*')
            .eq('id', id)
            .single();
        if (checkError || !season) {
            return res.status(404).json({ error: 'Season not found' });
        }
        // Set is_active to true. Trigger in database will automatically deactivate other seasons.
        const { data: updatedSeason, error } = await client
            .from('seasons')
            .update({ is_active: true })
            .eq('id', id)
            .select()
            .single();
        if (error)
            throw error;
        // Log admin action
        await supabase_1.supabaseAdmin.from('activity_logs').insert({
            user_id: req.user?.id,
            action: 'Set Active Season',
            entity_type: 'seasons',
            entity_id: id,
            description: `Set season "${season.name}" as active`,
        });
        return res.status(200).json({ message: 'Season activated successfully', season: updatedSeason });
    }
    catch (err) {
        console.error('Set active season error:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
exports.setActiveSeason = setActiveSeason;
