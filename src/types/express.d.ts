export {};

declare global {
  namespace Express {
    interface Request {
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
      cachedSessionUser?: {
        id: string;
        role: 'leader' | 'head' | 'hr';
      };
    }
  }
}
