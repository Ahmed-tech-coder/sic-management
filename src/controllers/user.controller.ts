import { Response } from 'express';
import { supabaseAdmin, getSupabaseClient } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { z } from 'zod';

const createUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Phone number must be in E.164 format (e.g. +201228895185)'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['leader', 'head', 'hr']),
  head_type: z.enum(['head', 'vice_head']).optional().nullable(),
  track_id: z.string().uuid().optional().nullable(),
});

const updateUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Phone number must be in E.164 format (e.g. +201228895185)'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters').optional().nullable(),
  role: z.enum(['leader', 'head', 'hr']),
  head_type: z.enum(['head', 'vice_head']).optional().nullable(),
  track_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean(),
});

export const getUsers = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { role, head_type, track_id, search, page = '1', limit = '10' } = req.query;
    const client = getSupabaseClient(req.token);

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    let query = client
      .from('users')
      .select('*, tracks(name)', { count: 'exact' });

    if (role) {
      query = query.eq('role', role);
    }
    if (head_type) {
      query = query.eq('head_type', head_type);
    }
    if (track_id) {
      query = query.eq('track_id', track_id);
    }

    if (search) {
      const searchStr = `%${search}%`;
      query = query.or(`name.ilike.${searchStr},email.ilike.${searchStr},phone.ilike.${searchStr}`);
    }

    const { data: users, count, error } = await query
      .order('name', { ascending: true })
      .range(from, to);

    if (error) throw error;

    return res.status(200).json({
      users,
      total: count || 0,
      page: pageNum,
      limit: limitNum,
      totalPages: count ? Math.ceil(count / limitNum) : 0,
    });
  } catch (err) {
    console.error('Get users error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const createUser = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Validation error' });
    }

    const { name, phone, email, password, role, head_type, track_id } = parsed.data;

    // Enforce business rules
    if (role === 'head' && !track_id) {
      return res.status(400).json({ error: 'Heads must be assigned to a track' });
    }

    // 1. Create in Supabase Auth via Admin API
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      phone,
      password,
      email_confirm: true,
      phone_confirm: true,
      user_metadata: {
        name,
        role,
        head_type,
        track_id: track_id || '',
        is_active: true,
      },
    });

    if (authError) {
      if (authError.message.includes('email_exists') || authError.message.includes('already registered')) {
        return res.status(400).json({ error: 'A user with this email or phone number already exists' });
      }
      throw authError;
    }

    // 2. The database trigger 'on_auth_user_created' automatically populates 'public.users'
    // We'll fetch the profile to return it to the frontend
    const { data: newProfile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('*, tracks(name)')
      .eq('id', authUser.user.id)
      .single();

    if (profileError || !newProfile) {
      return res.status(500).json({ error: 'User created in auth but profile sync failed' });
    }

    // 3. Log administrative action
    await supabaseAdmin.from('activity_logs').insert({
      user_id: req.user?.id,
      action: 'Created User',
      entity_type: 'users',
      entity_id: newProfile.id,
      description: `Created user ${name} (${role}${head_type ? ' - ' + head_type : ''})`,
    });

    return res.status(201).json({
      message: 'User created successfully',
      user: newProfile,
    });
  } catch (err) {
    console.error('Create user error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const updateUser = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Validation error' });
    }

    const { name, phone, email, password, role, head_type, track_id, is_active } = parsed.data;

    if (role === 'head' && !track_id) {
      return res.status(400).json({ error: 'Heads must be assigned to a track' });
    }

    // 1. Update auth.users first
    const authUpdateData: any = {
      email,
      phone,
      user_metadata: {
        name,
        role,
        head_type: track_id ? head_type : null,
        track_id: track_id || '',
        is_active,
      },
    };

    if (password) {
      authUpdateData.password = password;
    }

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(id as string, authUpdateData);
    if (authError) {
      if (authError.message.includes('email_exists') || authError.message.includes('phone_exists')) {
        return res.status(400).json({ error: 'A user with this email or phone number already exists' });
      }
      throw authError;
    }

    // 2. Update public.users details
    const { data: updatedProfile, error: profileError } = await supabaseAdmin
      .from('users')
      .update({
        name,
        phone,
        email,
        role,
        head_type: role === 'head' ? head_type : null,
        track_id: role === 'head' ? track_id : null,
        is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*, tracks(name)')
      .single();

    if (profileError || !updatedProfile) {
      throw profileError || new Error('Profile update failed');
    }

    // 3. Log administrative action
    await supabaseAdmin.from('activity_logs').insert({
      user_id: req.user?.id,
      action: 'Updated User',
      entity_type: 'users',
      entity_id: id,
      description: `Updated user ${name} (${role}${head_type ? ' - ' + head_type : ''})`,
    });

    return res.status(200).json({
      message: 'User updated successfully',
      user: updatedProfile,
    });
  } catch (err) {
    console.error('Update user error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const deleteUser = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Fetch user details first for logging
    const { data: user, error: getError } = await supabaseAdmin
      .from('users')
      .select('name, role')
      .eq('id', id)
      .single();

    if (getError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete from Supabase Auth (cascades to public.users)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(id as string);
    if (deleteError) throw deleteError;

    // Log administrative action
    await supabaseAdmin.from('activity_logs').insert({
      user_id: req.user?.id,
      action: 'Deleted User',
      entity_type: 'users',
      entity_id: id,
      description: `Deleted user ${user.name} (${user.role})`,
    });

    return res.status(200).json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Delete user error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
