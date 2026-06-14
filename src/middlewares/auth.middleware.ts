import { Request, Response, NextFunction } from 'express';
import { getSupabaseClient, supabaseAdmin } from '../config/supabase';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    name: string;
    phone: string;
    email: string;
    role: 'leader' | 'head' | 'hr';
    head_type?: 'head' | 'vice_head';
    track_id?: string;
    track_name?: string;
    is_active: boolean;
  };
  token?: string;
}

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const client = getSupabaseClient(token);

    // Verify token with Supabase Auth
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
    }

    // Get profile from public.users table using supabaseAdmin (safe because user token is verified)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('*, tracks(name)')
      .eq('id', user.id)
      .eq('is_active', true)
      .single();

    if (profileError || !profile) {
      return res.status(403).json({ error: 'Forbidden: User profile not found or inactive' });
    }

    // Attach to request object
    req.user = {
      id: profile.id,
      name: profile.name,
      phone: profile.phone,
      email: profile.email,
      role: profile.role === 'head' && profile.tracks?.name === 'HR' ? 'hr' : profile.role,
      head_type: profile.head_type,
      track_id: profile.track_id,
      track_name: profile.tracks?.name,
      is_active: profile.is_active,
    };
    req.token = token;

    return next();
  } catch (err) {
    console.error('Auth Middleware Error:', err);
    return res.status(500).json({ error: 'Internal Server Error during authentication' });
  }
};

// Middleware to restrict access to specific roles
export const authorize = (allowedRoles: ('leader' | 'head' | 'hr')[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: User not authenticated' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: `Forbidden: Access restricted to ${allowedRoles.join(' or ')}` });
    }

    return next();
  };
};
