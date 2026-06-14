"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSupabaseClient = exports.supabaseAdmin = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    console.error('Missing Supabase environment variables! Please check your backend/.env file.');
}
// Admin client that bypasses RLS (for creating auth users, system actions, etc.)
exports.supabaseAdmin = (0, supabase_js_1.createClient)(supabaseUrl || '', supabaseServiceKey || '', {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
    },
});
// User client factory to propagate user JWT for Row Level Security (RLS)
const getSupabaseClient = (token) => {
    if (!token) {
        return (0, supabase_js_1.createClient)(supabaseUrl || '', supabaseAnonKey || '', {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
            },
        });
    }
    return (0, supabase_js_1.createClient)(supabaseUrl || '', supabaseAnonKey || '', {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
        global: {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        },
    });
};
exports.getSupabaseClient = getSupabaseClient;
