import { Response } from 'express';
import { getSupabaseClient } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

export const getTracks = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const client = getSupabaseClient(req.token);
    const { data: tracks, error } = await client
      .from('tracks')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;

    return res.status(200).json({ tracks });
  } catch (err) {
    console.error('Get tracks error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
