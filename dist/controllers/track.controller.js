"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTracks = void 0;
const supabase_1 = require("../config/supabase");
const getTracks = async (req, res) => {
    try {
        const client = (0, supabase_1.getSupabaseClient)(req.token);
        const { data: tracks, error } = await client
            .from('tracks')
            .select('*')
            .order('name', { ascending: true });
        if (error)
            throw error;
        return res.status(200).json({ tracks });
    }
    catch (err) {
        console.error('Get tracks error:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
exports.getTracks = getTracks;
