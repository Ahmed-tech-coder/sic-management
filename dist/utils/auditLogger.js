"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditEmitter = void 0;
const events_1 = require("events");
const supabase_1 = require("../config/supabase");
class AuditEmitter extends events_1.EventEmitter {
    constructor() {
        super();
        // Register background worker listener
        this.on('log', this.handleLog);
    }
    async handleLog(payload) {
        try {
            const { userId, action, entityType, entityId, description } = payload;
            const { error } = await supabase_1.supabaseAdmin.from('activity_logs').insert({
                user_id: userId || null,
                action,
                entity_type: entityType,
                entity_id: entityId,
                description,
            });
            if (error) {
                console.error('Async audit logging failed in database:', error.message);
            }
        }
        catch (err) {
            console.error('Critical failure in async audit logging event listener:', err);
        }
    }
    /**
     * Dispatches a log execution to the background event listener without blocking.
     */
    emitLog(payload) {
        this.emit('log', payload);
    }
}
exports.auditEmitter = new AuditEmitter();
