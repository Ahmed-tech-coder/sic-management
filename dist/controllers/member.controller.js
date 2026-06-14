"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteMember = exports.updateMember = exports.createMember = exports.getMembers = void 0;
const supabase_1 = require("../config/supabase");
const zod_1 = require("zod");
const createMemberSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Name must be at least 2 characters'),
    phone: zod_1.z.string().min(8, 'Phone number must be at least 8 characters'),
    email: zod_1.z.string().email('Invalid email address'),
    track_id: zod_1.z.string().uuid().optional().nullable(),
});
const updateMemberSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Name must be at least 2 characters'),
    phone: zod_1.z.string().min(8, 'Phone number must be at least 8 characters'),
    email: zod_1.z.string().email('Invalid email address'),
    track_id: zod_1.z.string().uuid().optional().nullable(),
});
const getMembers = async (req, res) => {
    try {
        const { track_id, season_id, search, page = '1', limit = '10' } = req.query;
        const client = (0, supabase_1.getSupabaseClient)(req.token);
        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const from = (pageNum - 1) * limitNum;
        const to = from + limitNum - 1;
        // 1. Resolve Season ID (default to active season if not specified)
        let targetSeasonId = season_id;
        if (!targetSeasonId) {
            const { data: activeSeason, error: seasonError } = await supabase_1.supabaseAdmin
                .from('seasons')
                .select('id')
                .eq('is_active', true)
                .maybeSingle();
            if (seasonError)
                throw seasonError;
            if (!activeSeason) {
                return res.status(400).json({ error: 'No active season found. Please create and activate a season first.' });
            }
            targetSeasonId = activeSeason.id;
        }
        let query = client
            .from('technical_members')
            .select('*, tracks(name), seasons(name)', { count: 'exact' })
            .eq('season_id', targetSeasonId);
        // 2. Enforce track constraints based on role
        if (req.user?.role === 'head') {
            query = query.eq('track_id', req.user.track_id);
        }
        else if (track_id) {
            // Leader/HR can filter by track_id
            query = query.eq('track_id', track_id);
        }
        // 3. Search filter
        if (search) {
            const searchStr = `%${search}%`;
            query = query.or(`name.ilike.${searchStr},email.ilike.${searchStr},phone.ilike.${searchStr}`);
        }
        const { data: members, count, error } = await query
            .order('name', { ascending: true })
            .range(from, to);
        if (error)
            throw error;
        return res.status(200).json({
            members,
            total: count || 0,
            page: pageNum,
            limit: limitNum,
            totalPages: count ? Math.ceil(count / limitNum) : 0,
        });
    }
    catch (err) {
        console.error('Get members error:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
exports.getMembers = getMembers;
const createMember = async (req, res) => {
    try {
        const parsed = createMemberSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Validation error' });
        }
        const { name, phone, email } = parsed.data;
        let { track_id } = parsed.data;
        // 1. Resolve Track ID based on role
        if (req.user?.role === 'head') {
            track_id = req.user.track_id;
        }
        else if (!track_id) {
            // HR must supply track_id
            return res.status(400).json({ error: 'Track must be specified' });
        }
        // 2. Resolve Active Season ID
        const { data: activeSeason, error: seasonError } = await supabase_1.supabaseAdmin
            .from('seasons')
            .select('id')
            .eq('is_active', true)
            .maybeSingle();
        if (seasonError || !activeSeason) {
            return res.status(400).json({ error: 'No active season found. Cannot create member.' });
        }
        const client = (0, supabase_1.getSupabaseClient)(req.token);
        // 3. Insert technical member
        const { data: member, error } = await client
            .from('technical_members')
            .insert({
            name,
            phone,
            email,
            track_id,
            season_id: activeSeason.id,
        })
            .select('*, tracks(name)')
            .single();
        if (error) {
            if (error.code === '23505') {
                return res.status(400).json({ error: 'A technical member with this email or phone number already exists' });
            }
            throw error;
        }
        // Log admin action
        await supabase_1.supabaseAdmin.from('activity_logs').insert({
            user_id: req.user?.id,
            action: 'Added Technical Member',
            entity_type: 'technical_members',
            entity_id: member.id,
            description: `Added technical member ${name} to track ${member.tracks?.name}`,
        });
        return res.status(201).json({
            message: 'Technical member added successfully',
            member,
        });
    }
    catch (err) {
        console.error('Create member error:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
exports.createMember = createMember;
const updateMember = async (req, res) => {
    try {
        const { id } = req.params;
        const parsed = updateMemberSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Validation error' });
        }
        const { name, phone, email } = parsed.data;
        let { track_id } = parsed.data;
        const client = (0, supabase_1.getSupabaseClient)(req.token);
        // Fetch existing member details to check permission and track changes
        const { data: existingMember, error: fetchError } = await client
            .from('technical_members')
            .select('*')
            .eq('id', id)
            .single();
        if (fetchError || !existingMember) {
            return res.status(404).json({ error: 'Technical member not found or access denied' });
        }
        // Enforce track constraints based on role
        if (req.user?.role === 'head') {
            track_id = req.user.track_id; // head cannot change track of member
        }
        else if (!track_id) {
            track_id = existingMember.track_id;
        }
        const { data: member, error } = await client
            .from('technical_members')
            .update({
            name,
            phone,
            email,
            track_id,
            updated_at: new Date().toISOString(),
        })
            .eq('id', id)
            .select('*, tracks(name)')
            .single();
        if (error) {
            if (error.code === '23505') {
                return res.status(400).json({ error: 'A technical member with this email or phone number already exists' });
            }
            throw error;
        }
        // Log admin action
        await supabase_1.supabaseAdmin.from('activity_logs').insert({
            user_id: req.user?.id,
            action: 'Updated Technical Member',
            entity_type: 'technical_members',
            entity_id: id,
            description: `Updated technical member ${name}`,
        });
        return res.status(200).json({
            message: 'Technical member updated successfully',
            member,
        });
    }
    catch (err) {
        console.error('Update member error:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
exports.updateMember = updateMember;
const deleteMember = async (req, res) => {
    try {
        const { id } = req.params;
        const client = (0, supabase_1.getSupabaseClient)(req.token);
        // Fetch existing member details for logging and permission check
        const { data: member, error: fetchError } = await client
            .from('technical_members')
            .select('name, track_id')
            .eq('id', id)
            .single();
        if (fetchError || !member) {
            return res.status(404).json({ error: 'Technical member not found or access denied' });
        }
        const { error } = await client
            .from('technical_members')
            .delete()
            .eq('id', id);
        if (error)
            throw error;
        // Log admin action
        await supabase_1.supabaseAdmin.from('activity_logs').insert({
            user_id: req.user?.id,
            action: 'Deleted Technical Member',
            entity_type: 'technical_members',
            entity_id: id,
            description: `Deleted technical member ${member.name}`,
        });
        return res.status(200).json({ message: 'Technical member deleted successfully' });
    }
    catch (err) {
        console.error('Delete member error:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
exports.deleteMember = deleteMember;
