"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionRateLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
/**
 * Extracts and caches session user info from either req.user or the Bearer token directly.
 * Useful for rate limiting since it executes before routes are fully authenticated.
 */
const getSessionUser = (req) => {
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
            const decoded = jsonwebtoken_1.default.decode(token);
            if (decoded && decoded.sub) {
                // Resolve user role from supabase metadata
                const role = decoded.role || decoded.user_metadata?.role || 'head';
                req.cachedSessionUser = {
                    id: decoded.sub,
                    role: role,
                };
                return req.cachedSessionUser;
            }
        }
        catch (err) {
            // Fail silently and return null (will fallback to IP)
        }
    }
    return null;
};
exports.sessionRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: (req) => {
        const user = getSessionUser(req);
        if (user) {
            if (user.role === 'leader') {
                return 1000; // Leader accounts get high throughput
            }
            return 500; // Heads & HR get 500 requests per 15 mins
        }
        return 150; // Anonymous / Guest IP sessions (e.g., login, health-check)
    },
    keyGenerator: (req) => {
        const user = getSessionUser(req);
        if (user) {
            return `user:${user.id}`;
        }
        return `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
    },
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
});
