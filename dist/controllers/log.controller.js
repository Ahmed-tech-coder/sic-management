"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearActivityLogs = exports.deleteActivityLog = exports.getActivityLogs = void 0;
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
const deleteActivityLog = async (req, res) => {
    try {
        const { id } = req.params;
        const client = (0, supabase_1.getSupabaseClient)(req.token);
        const { error } = await client
            .from('activity_logs')
            .delete()
            .eq('id', id);
        if (error)
            throw error;
        return res.status(200).json({ message: 'Activity log deleted successfully' });
    }
    catch (err) {
        console.error('Delete log error:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
exports.deleteActivityLog = deleteActivityLog;
const clearActivityLogs = async (req, res) => {
    try {
        const client = (0, supabase_1.getSupabaseClient)(req.token);
        // Delete all logs by matching created_at after year 1970
        const { error } = await client
            .from('activity_logs')
            .delete()
            .gt('created_at', '1970-01-01T00:00:00Z');
        if (error)
            throw error;
        return res.status(200).json({ message: 'All activity logs cleared successfully' });
    }
    catch (err) {
        console.error('Clear logs error:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
exports.clearActivityLogs = clearActivityLogs;
