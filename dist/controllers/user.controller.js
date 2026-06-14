"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUser = exports.updateUser = exports.createUser = exports.getUsers = void 0;
const supabase_1 = require("../config/supabase");
const zod_1 = require("zod");
const createUserSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Name must be at least 2 characters'),
    phone: zod_1.z.string().regex(/^\+[1-9]\d{1,14}$/, 'Phone number must be in E.164 format (e.g. +201228895185)'),
    email: zod_1.z.string().email('Invalid email address'),
    password: zod_1.z.string().min(6, 'Password must be at least 6 characters'),
    role: zod_1.z.enum(['leader', 'head', 'hr']),
    head_type: zod_1.z.enum(['head', 'vice_head']).optional().nullable(),
    track_id: zod_1.z.string().uuid().optional().nullable(),
});
const updateUserSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Name must be at least 2 characters'),
    phone: zod_1.z.string().regex(/^\+[1-9]\d{1,14}$/, 'Phone number must be in E.164 format (e.g. +201228895185)'),
    email: zod_1.z.string().email('Invalid email address'),
    password: zod_1.z.string().min(6, 'Password must be at least 6 characters').optional().nullable(),
    role: zod_1.z.enum(['leader', 'head', 'hr']),
    head_type: zod_1.z.enum(['head', 'vice_head']).optional().nullable(),
    track_id: zod_1.z.string().uuid().optional().nullable(),
    is_active: zod_1.z.boolean(),
});
const getUsers = async (req, res) => {
    try {
        const { role, head_type, track_id, search, page = '1', limit = '10' } = req.query;
        const client = (0, supabase_1.getSupabaseClient)(req.token);
        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const from = (pageNum - 1) * limitNum;
        const to = from + limitNum - 1;
        let query = client
            .from('users')
            .select('*, tracks(name)', { count: 'exact' });
        if (role) {
            query = query.eq('role', role);
        }
        if (head_type) {
            query = query.eq('head_type', head_type);
        }
        if (track_id) {
            query = query.eq('track_id', track_id);
        }
        if (search) {
            const searchStr = `%${search}%`;
            query = query.or(`name.ilike.${searchStr},email.ilike.${searchStr},phone.ilike.${searchStr}`);
        }
        const { data: users, count, error } = await query
            .order('name', { ascending: true })
            .range(from, to);
        if (error)
            throw error;
        return res.status(200).json({
            users,
            total: count || 0,
            page: pageNum,
            limit: limitNum,
            totalPages: count ? Math.ceil(count / limitNum) : 0,
        });
    }
    catch (err) {
        console.error('Get users error:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
exports.getUsers = getUsers;
const createUser = async (req, res) => {
    try {
        const parsed = createUserSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Validation error' });
        }
        const { name, phone, email, password, role, head_type, track_id } = parsed.data;
        // Enforce business rules
        if (role === 'head' && !track_id) {
            return res.status(400).json({ error: 'Heads must be assigned to a track' });
        }
        // 1. Create in Supabase Auth via Admin API
        const { data: authUser, error: authError } = await supabase_1.supabaseAdmin.auth.admin.createUser({
            email,
            phone,
            password,
            email_confirm: true,
            phone_confirm: true,
            user_metadata: {
                name,
                role,
                head_type,
                track_id: track_id || '',
                is_active: true,
            },
        });
        if (authError) {
            if (authError.message.includes('email_exists') || authError.message.includes('already registered')) {
                return res.status(400).json({ error: 'A user with this email or phone number already exists' });
            }
            throw authError;
        }
        // 2. The database trigger 'on_auth_user_created' automatically populates 'public.users'
        // We'll fetch the profile to return it to the frontend
        const { data: newProfile, error: profileError } = await supabase_1.supabaseAdmin
            .from('users')
            .select('*, tracks(name)')
            .eq('id', authUser.user.id)
            .single();
        if (profileError || !newProfile) {
            return res.status(500).json({ error: 'User created in auth but profile sync failed' });
        }
        // 3. Log administrative action
        await supabase_1.supabaseAdmin.from('activity_logs').insert({
            user_id: req.user?.id,
            action: 'Created User',
            entity_type: 'users',
            entity_id: newProfile.id,
            description: `Created user ${name} (${role}${head_type ? ' - ' + head_type : ''})`,
        });
        return res.status(201).json({
            message: 'User created successfully',
            user: newProfile,
        });
    }
    catch (err) {
        console.error('Create user error:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
exports.createUser = createUser;
const updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const parsed = updateUserSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Validation error' });
        }
        const { name, phone, email, password, role, head_type, track_id, is_active } = parsed.data;
        if (role === 'head' && !track_id) {
            return res.status(400).json({ error: 'Heads must be assigned to a track' });
        }
        // 1. Update auth.users first
        const authUpdateData = {
            email,
            phone,
            user_metadata: {
                name,
                role,
                head_type: track_id ? head_type : null,
                track_id: track_id || '',
                is_active,
            },
        };
        if (password) {
            authUpdateData.password = password;
        }
        const { error: authError } = await supabase_1.supabaseAdmin.auth.admin.updateUserById(id, authUpdateData);
        if (authError) {
            if (authError.message.includes('email_exists') || authError.message.includes('phone_exists')) {
                return res.status(400).json({ error: 'A user with this email or phone number already exists' });
            }
            throw authError;
        }
        // 2. Update public.users details
        const { data: updatedProfile, error: profileError } = await supabase_1.supabaseAdmin
            .from('users')
            .update({
            name,
            phone,
            email,
            role,
            head_type: role === 'head' ? head_type : null,
            track_id: role === 'head' ? track_id : null,
            is_active,
            updated_at: new Date().toISOString(),
        })
            .eq('id', id)
            .select('*, tracks(name)')
            .single();
        if (profileError || !updatedProfile) {
            throw profileError || new Error('Profile update failed');
        }
        // 3. Log administrative action
        await supabase_1.supabaseAdmin.from('activity_logs').insert({
            user_id: req.user?.id,
            action: 'Updated User',
            entity_type: 'users',
            entity_id: id,
            description: `Updated user ${name} (${role}${head_type ? ' - ' + head_type : ''})`,
        });
        return res.status(200).json({
            message: 'User updated successfully',
            user: updatedProfile,
        });
    }
    catch (err) {
        console.error('Update user error:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
exports.updateUser = updateUser;
const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        // Fetch user details first for logging
        const { data: user, error: getError } = await supabase_1.supabaseAdmin
            .from('users')
            .select('name, role')
            .eq('id', id)
            .single();
        if (getError || !user) {
            return res.status(404).json({ error: 'User not found' });
        }
        // Delete from Supabase Auth (cascades to public.users)
        const { error: deleteError } = await supabase_1.supabaseAdmin.auth.admin.deleteUser(id);
        if (deleteError)
            throw deleteError;
        // Log administrative action
        await supabase_1.supabaseAdmin.from('activity_logs').insert({
            user_id: req.user?.id,
            action: 'Deleted User',
            entity_type: 'users',
            entity_id: id,
            description: `Deleted user ${user.name} (${user.role})`,
        });
        return res.status(200).json({ message: 'User deleted successfully' });
    }
    catch (err) {
        console.error('Delete user error:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
exports.deleteUser = deleteUser;
