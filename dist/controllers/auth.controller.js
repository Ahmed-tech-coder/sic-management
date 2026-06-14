"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logout = exports.getMe = exports.login = void 0;
const supabase_1 = require("../config/supabase");
const zod_1 = require("zod");
const loginSchema = zod_1.z.object({
    phone: zod_1.z.string().min(8, 'Phone number must be at least 8 characters'),
    password: zod_1.z.string().min(6, 'Password must be at least 6 characters'),
});
const login = async (req, res) => {
    try {
        const parsed = loginSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Validation error' });
        }
        const { phone, password } = parsed.data;
        // 1. Resolve email from phone number
        const { data: userProfile, error: lookupError } = await supabase_1.supabaseAdmin
            .from('users')
            .select('email, is_active')
            .eq('phone', phone)
            .single();
        if (lookupError || !userProfile) {
            return res.status(401).json({ error: 'Invalid phone number or password' });
        }
        if (!userProfile.is_active) {
            return res.status(403).json({ error: 'This account has been deactivated' });
        }
        // 2. Sign in using email resolved from the phone lookup
        const { data: authData, error: authError } = await supabase_1.supabaseAdmin.auth.signInWithPassword({
            email: userProfile.email,
            password: password,
        });
        if (authError || !authData.session) {
            return res.status(401).json({ error: 'Invalid phone number or password' });
        }
        // 3. Fetch full profile
        const { data: profile, error: profileError } = await supabase_1.supabaseAdmin
            .from('users')
            .select('*, tracks(name)')
            .eq('id', authData.user.id)
            .single();
        if (profileError || !profile) {
            return res.status(401).json({ error: 'User profile not found' });
        }
        return res.status(200).json({
            message: 'Logged in successfully',
            token: authData.session.access_token,
            user: {
                id: profile.id,
                name: profile.name,
                phone: profile.phone,
                email: profile.email,
                role: profile.role,
                head_type: profile.head_type,
                track_id: profile.track_id,
                track_name: profile.tracks?.name,
                is_active: profile.is_active,
            },
        });
    }
    catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
exports.login = login;
const getMe = async (req, res) => {
    return res.status(200).json({ user: req.user });
};
exports.getMe = getMe;
const logout = async (req, res) => {
    // Client is expected to discard the token, but we can call Supabase signout just in case
    try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            const client = (0, supabase_1.getSupabaseClient)(token);
            await client.auth.signOut();
        }
        return res.status(200).json({ message: 'Logged out successfully' });
    }
    catch (err) {
        console.error('Logout error:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
exports.logout = logout;
