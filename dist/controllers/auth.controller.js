"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logout = exports.getMe = exports.login = void 0;
const supabase_1 = require("../config/supabase");
const zod_1 = require("zod");
const loginSchema = zod_1.z.union([
    zod_1.z.object({
        email: zod_1.z.string().email('Invalid email address'),
        password: zod_1.z.string().min(6, 'Password must be at least 6 characters'),
    }),
    zod_1.z.object({
        phone: zod_1.z.string().regex(/^\+[1-9]\d{1,14}$/, 'Phone number must be in E.164 format (e.g. +2012...)'),
        password: zod_1.z.string().min(6, 'Password must be at least 6 characters'),
    }),
]);
const login = async (req, res) => {
    try {
        console.log('Received login payload:', {
            ...req.body,
            password: req.body.password ? '[REDACTED]' : undefined,
        });
        const parsed = loginSchema.safeParse(req.body);
        if (!parsed.success) {
            console.log('Validation failed:', parsed.error.issues[0]?.message);
            return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Validation error' });
        }
        const data = parsed.data;
        let authResult;
        let identifierType;
        const authClient = (0, supabase_1.getSupabaseClient)();
        if ('email' in data) {
            identifierType = 'email';
            console.log(`Attempting email authentication for: ${data.email}`);
            authResult = await authClient.auth.signInWithPassword({
                email: data.email,
                password: data.password,
            });
        }
        else {
            identifierType = 'phone';
            console.log(`Attempting phone authentication for: ${data.phone}`);
            authResult = await authClient.auth.signInWithPassword({
                phone: data.phone,
                password: data.password,
            });
        }
        const { data: authData, error: authError } = authResult;
        if (authError || !authData.session || !authData.user) {
            console.log('Supabase authentication failed:', authError?.message);
            const errorMsg = identifierType === 'email'
                ? 'Invalid email or password'
                : 'Invalid phone number or password';
            return res.status(401).json({ error: errorMsg });
        }
        console.log(`Supabase authentication succeeded. User ID: ${authData.user.id}`);
        // 3. Fetch profile
        const { data: profile, error: profileError } = await supabase_1.supabaseAdmin
            .from('users')
            .select('*, tracks(name)')
            .eq('id', authData.user.id)
            .single();
        if (profileError || !profile) {
            console.warn(`Profile sync delayed or missing for user ${authData.user.id}. Error:`, profileError);
            // Construct fallback user object using Auth metadata
            const meta = authData.user.user_metadata || {};
            const fallbackUser = {
                id: authData.user.id,
                name: meta.name || 'SIC User',
                phone: authData.user.phone || '',
                email: authData.user.email || '',
                role: meta.role || 'head',
                head_type: meta.head_type || null,
                track_id: meta.track_id || null,
                track_name: undefined,
                is_active: meta.is_active !== false,
            };
            return res.status(200).json({
                message: 'Logged in successfully (profile sync pending)',
                token: authData.session.access_token,
                user: fallbackUser,
            });
        }
        if (!profile.is_active) {
            console.log(`Account is deactivated for user: ${profile.name} (${authData.user.id})`);
            return res.status(403).json({ error: 'This account has been deactivated' });
        }
        return res.status(200).json({
            message: 'Logged in successfully',
            token: authData.session.access_token,
            user: {
                id: profile.id,
                name: profile.name,
                phone: profile.phone,
                email: profile.email,
                role: profile.role === 'head' && profile.tracks?.name === 'HR' ? 'hr' : profile.role,
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
