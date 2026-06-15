import { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';

/**
 * Extracts and caches session user info from either req.user or the Bearer token directly.
 * Useful for rate limiting since it executes before routes are fully authenticated.
 */
const getSessionUser = (req: Request) => {
  if (req.user) {
    return req.user;
  }
  if (req.cachedSessionUser) {
    return req.cachedSessionUser;
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.decode(token) as { sub?: string; user_metadata?: any; role?: string } | null;
      if (decoded && decoded.sub) {
        // Resolve user role from supabase metadata
        const role = decoded.role || decoded.user_metadata?.role || 'head';
        
        req.cachedSessionUser = {
          id: decoded.sub,
          role: role as 'leader' | 'head' | 'hr',
        };
        return req.cachedSessionUser;
      }
    } catch (err) {
      // Fail silently and return null (will fallback to IP)
    }
  }

  return null;
};

export const sessionRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (req: Request) => {
    const user = getSessionUser(req);
    if (user) {
      if (user.role === 'leader') {
        return 1000; // Leader accounts get high throughput
      }
      return 500; // Heads & HR get 500 requests per 15 mins
    }
    return 150; // Anonymous / Guest IP sessions (e.g., login, health-check)
  },
  keyGenerator: (req: Request) => {
    const user = getSessionUser(req);
    if (user) {
      return `user:${user.id}`;
    }
    return `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
  validate: {
    defaultKeys: false,
  },
});
