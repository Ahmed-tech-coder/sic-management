"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActivityLogs = void 0;
const supabase_1 = require("../config/supabase");
const getActivityLogs = async (req, res) => {
    try {
        const { page = '1', limit = '10' } = req.query;
        const client = (0, supabase_1.getSupabaseClient)(req.token);
        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const from = (pageNum - 1) * limitNum;
        const to = from + limitNum - 1;
        const { data: logs, count, error } = await client
            .from('activity_logs')
            .select('*, users(name, role)', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(from, to);
        if (error)
            throw error;
        return res.status(200).json({
            logs,
            total: count || 0,
            page: pageNum,
            limit: limitNum,
            totalPages: count ? Math.ceil(count / limitNum) : 0,
        });
    }
    catch (err) {
        console.error('Get logs error:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
exports.getActivityLogs = getActivityLogs;
