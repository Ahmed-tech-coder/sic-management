import { Response } from 'express';
import { supabaseAdmin, getSupabaseClient } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

export const getActivityLogs = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { page = '1', limit = '10' } = req.query;
    const client = getSupabaseClient(req.token);

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    const { data: logs, count, error } = await client
      .from('activity_logs')
      .select('*, users(name, role)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    return res.status(200).json({
      logs,
      total: count || 0,
      page: pageNum,
      limit: limitNum,
      totalPages: count ? Math.ceil(count / limitNum) : 0,
    });
  } catch (err) {
    console.error('Get logs error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const deleteActivityLog = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Use supabaseAdmin to bypass RLS restrictions on deletion
    const { error } = await supabaseAdmin
      .from('activity_logs')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return res.status(200).json({ message: 'Activity log deleted successfully' });
  } catch (err) {
    console.error('Delete log error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const clearActivityLogs = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Use supabaseAdmin to bypass RLS restrictions on deletion
    const { error } = await supabaseAdmin
      .from('activity_logs')
      .delete()
      .gt('created_at', '1970-01-01T00:00:00Z');

    if (error) throw error;

    return res.status(200).json({ message: 'All activity logs cleared successfully' });
  } catch (err) {
    console.error('Clear logs error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
