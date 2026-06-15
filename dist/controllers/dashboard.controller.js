"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDashboardMetrics = void 0;
const supabase_1 = require("../config/supabase");
const cache_1 = require("../utils/cache");
const getDashboardMetrics = async (req, res) => {
    try {
        const role = req.user?.role;
        const trackId = req.user?.track_id;
        const cacheKey = `dashboard-metrics:${role}:${trackId || 'all'}`;
        // 1. Check in-memory cache
        const cachedData = cache_1.memoryCache.get(cacheKey);
        if (cachedData) {
            return res.status(200).json(cachedData);
        }
        const client = (0, supabase_1.getSupabaseClient)(req.token);
        // 2. Fetch tracks count (accessible to everyone)
        const { count: tracksCount, error: tracksError } = await client
            .from('tracks')
            .select('*', { count: 'exact', head: true });
        if (tracksError)
            throw tracksError;
        // 3. Fetch members count
        let membersQuery = client
            .from('technical_members')
            .select('*', { count: 'exact', head: true });
        if (role === 'head') {
            membersQuery = membersQuery.eq('track_id', trackId);
        }
        const { count: membersCount, error: membersError } = await membersQuery;
        if (membersError)
            throw membersError;
        // 4. Fetch evaluations count
        let evaluationsQuery = client
            .from('evaluations')
            .select('*, technical_members!inner(*)', { count: 'exact', head: true });
        if (role === 'head') {
            evaluationsQuery = evaluationsQuery.eq('technical_members.track_id', trackId);
        }
        const { count: evaluationsCount, error: evError } = await evaluationsQuery;
        if (evError)
            throw evError;
        const metrics = {
            tracksCount: tracksCount || 0,
            membersCount: membersCount || 0,
            evaluationsCount: evaluationsCount || 0,
        };
        // Cache metrics for 5 minutes (300,000 ms)
        cache_1.memoryCache.set(cacheKey, metrics, 5 * 60 * 1000);
        return res.status(200).json(metrics);
    }
    catch (err) {
        console.error('Get dashboard metrics error:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
exports.getDashboardMetrics = getDashboardMetrics;
