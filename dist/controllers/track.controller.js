"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTracks = void 0;
const supabase_1 = require("../config/supabase");
const cache_1 = require("../utils/cache");
const getTracks = async (req, res) => {
    try {
        const cacheKey = 'tracks';
        const cachedData = cache_1.memoryCache.get(cacheKey);
        if (cachedData) {
            return res.status(200).json(cachedData);
        }
        const client = (0, supabase_1.getSupabaseClient)(req.token);
        const { data: tracks, error } = await client
            .from('tracks')
            .select('*')
            .order('name', { ascending: true });
        if (error)
            throw error;
        const responseData = { tracks };
        // Cache for 30 minutes
        cache_1.memoryCache.set(cacheKey, responseData, 30 * 60 * 1000);
        return res.status(200).json(responseData);
    }
    catch (err) {
        console.error('Get tracks error:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
exports.getTracks = getTracks;
