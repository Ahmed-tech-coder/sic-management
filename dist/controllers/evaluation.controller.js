"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportEvaluations = exports.deleteEvaluation = exports.updateEvaluation = exports.createEvaluation = exports.getEvaluations = void 0;
const supabase_1 = require("../config/supabase");
const zod_1 = require("zod");
const createEvaluationSchema = zod_1.z.object({
    task_name: zod_1.z.string().min(2, 'Task name must be at least 2 characters'),
    technical_member_id: zod_1.z.string().uuid('Invalid technical member ID'),
    score: zod_1.z.number().min(0, 'Score must be at least 0').max(100, 'Score cannot exceed 100'),
    notes: zod_1.z.string().optional().nullable(),
});
const updateEvaluationSchema = zod_1.z.object({
    task_name: zod_1.z.string().min(2, 'Task name must be at least 2 characters'),
    technical_member_id: zod_1.z.string().uuid('Invalid technical member ID'),
    score: zod_1.z.number().min(0, 'Score must be at least 0').max(100, 'Score cannot exceed 100'),
    notes: zod_1.z.string().optional().nullable(),
});
const getEvaluations = async (req, res) => {
    try {
        const { track_id, search, page = '1', limit = '10' } = req.query;
        const client = (0, supabase_1.getSupabaseClient)(req.token);
        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const from = (pageNum - 1) * limitNum;
        const to = from + limitNum - 1;
        let query = client
            .from('evaluations')
            .select('*, technical_members!inner(*, tracks!inner(name)), evaluator:users(*)', { count: 'exact' });
        // 2. Enforce track constraints based on role
        if (req.user?.role === 'head') {
            query = query.eq('technical_members.track_id', req.user.track_id);
        }
        else if (track_id) {
            // Leader/HR can filter by track
            query = query.eq('technical_members.track_id', track_id);
        }
        // 3. Search filter
        if (search) {
            const searchStr = `%${search}%`;
            query = query.or(`task_name.ilike.${searchStr},technical_members.name.ilike.${searchStr}`);
        }
        const { data: evaluations, count, error } = await query
            .order('created_at', { ascending: false })
            .range(from, to);
        if (error)
            throw error;
        return res.status(200).json({
            evaluations,
            total: count || 0,
            page: pageNum,
            limit: limitNum,
            totalPages: count ? Math.ceil(count / limitNum) : 0,
        });
    }
    catch (err) {
        console.error('Get evaluations error:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
exports.getEvaluations = getEvaluations;
const createEvaluation = async (req, res) => {
    try {
        const parsed = createEvaluationSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Validation error' });
        }
        const { task_name, technical_member_id, score, notes } = parsed.data;
        const client = (0, supabase_1.getSupabaseClient)(req.token);
        // 1. Fetch member to check if they exist and match the Head's track
        const { data: member, error: memberError } = await client
            .from('technical_members')
            .select('track_id, name')
            .eq('id', technical_member_id)
            .single();
        if (memberError || !member) {
            return res.status(404).json({ error: 'Technical member not found or access denied' });
        }
        // Verify Head is creating evaluation for their own track
        if (req.user?.role === 'head' && member.track_id !== req.user.track_id) {
            return res.status(403).json({ error: 'Forbidden: You can only evaluate members of your own track' });
        }
        // 2. Create evaluation
        const { data: evaluation, error } = await client
            .from('evaluations')
            .insert({
            task_name,
            technical_member_id,
            evaluator_id: req.user?.id,
            score,
            notes: notes || null,
        })
            .select('*, technical_members(name, track_id)')
            .single();
        if (error)
            throw error;
        // Log admin action
        await supabase_1.supabaseAdmin.from('activity_logs').insert({
            user_id: req.user?.id,
            action: 'Created Evaluation',
            entity_type: 'evaluations',
            entity_id: evaluation.id,
            description: `Evaluated ${member.name} for task "${task_name}" with score ${score}/100`,
        });
        return res.status(201).json({
            message: 'Evaluation created successfully',
            evaluation,
        });
    }
    catch (err) {
        console.error('Create evaluation error:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
exports.createEvaluation = createEvaluation;
const updateEvaluation = async (req, res) => {
    try {
        const { id } = req.params;
        const parsed = updateEvaluationSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Validation error' });
        }
        const { task_name, technical_member_id, score, notes } = parsed.data;
        const client = (0, supabase_1.getSupabaseClient)(req.token);
        // 1. Fetch existing evaluation
        const { data: existingEvaluation, error: evalError } = await client
            .from('evaluations')
            .select('*, technical_members(track_id)')
            .eq('id', id)
            .single();
        if (evalError || !existingEvaluation) {
            return res.status(404).json({ error: 'Evaluation not found or access denied' });
        }
        // 2. Fetch new member track (if member changed)
        const { data: member, error: memberError } = await client
            .from('technical_members')
            .select('track_id, name')
            .eq('id', technical_member_id)
            .single();
        if (memberError || !member) {
            return res.status(404).json({ error: 'Technical member not found' });
        }
        // Verify Head is evaluating their own track
        if (req.user?.role === 'head' && member.track_id !== req.user.track_id) {
            return res.status(403).json({ error: 'Forbidden: You can only evaluate members of your own track' });
        }
        // 3. Update evaluation
        const { data: evaluation, error } = await client
            .from('evaluations')
            .update({
            task_name,
            technical_member_id,
            score,
            notes: notes || null,
            updated_at: new Date().toISOString(),
        })
            .eq('id', id)
            .select('*, technical_members(name)')
            .single();
        if (error)
            throw error;
        // Log admin action
        await supabase_1.supabaseAdmin.from('activity_logs').insert({
            user_id: req.user?.id,
            action: 'Updated Evaluation',
            entity_type: 'evaluations',
            entity_id: id,
            description: `Updated evaluation for ${member.name} - task "${task_name}" - score ${score}/100`,
        });
        return res.status(200).json({
            message: 'Evaluation updated successfully',
            evaluation,
        });
    }
    catch (err) {
        console.error('Update evaluation error:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
exports.updateEvaluation = updateEvaluation;
const deleteEvaluation = async (req, res) => {
    try {
        const { id } = req.params;
        const client = (0, supabase_1.getSupabaseClient)(req.token);
        // Fetch existing evaluation details for logging
        const { data: evaluation, error: fetchError } = await client
            .from('evaluations')
            .select('task_name, technical_members(name)')
            .eq('id', id)
            .single();
        if (fetchError || !evaluation) {
            return res.status(404).json({ error: 'Evaluation not found or access denied' });
        }
        const { error } = await client
            .from('evaluations')
            .delete()
            .eq('id', id);
        if (error)
            throw error;
        // Log admin action
        await supabase_1.supabaseAdmin.from('activity_logs').insert({
            user_id: req.user?.id,
            action: 'Deleted Evaluation',
            entity_type: 'evaluations',
            entity_id: id,
            description: `Deleted evaluation of ${Array.isArray(evaluation.technical_members) ? evaluation.technical_members[0]?.name : evaluation.technical_members?.name || 'Unknown'} for task "${evaluation.task_name}"`,
        });
        return res.status(200).json({ message: 'Evaluation deleted successfully' });
    }
    catch (err) {
        console.error('Delete evaluation error:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
exports.deleteEvaluation = deleteEvaluation;
const exportEvaluations = async (req, res) => {
    try {
        const { track_id } = req.query;
        const client = (0, supabase_1.getSupabaseClient)(req.token);
        let query = client
            .from('evaluations')
            .select('*, technical_members!inner(*, tracks!inner(name)), evaluator:users(name)');
        if (track_id) {
            query = query.eq('technical_members.track_id', track_id);
        }
        const { data: evaluations, error } = await query.order('created_at', { ascending: false });
        if (error)
            throw error;
        // 2. Generate CSV
        const headers = ['Task Name', 'Technical Member', 'Track', 'Evaluator', 'Score', 'Notes', 'Created Date'];
        const rows = (evaluations || []).map((ev) => [
            ev.task_name,
            ev.technical_members?.name,
            ev.technical_members?.tracks?.name,
            ev.evaluator?.name || 'System',
            ev.score,
            ev.notes || '',
            new Date(ev.created_at).toLocaleDateString(),
        ]);
        // CSV format escape double quotes
        const csvContent = [
            headers.join(','),
            ...rows.map((row) => row
                .map((value) => {
                const strValue = String(value).replace(/"/g, '""');
                return strValue.includes(',') || strValue.includes('\n') || strValue.includes('"')
                    ? `"${strValue}"`
                    : strValue;
            })
                .join(',')),
        ].join('\n');
        res.setHeader('Content-Disposition', `attachment; filename=Evaluations_Report.csv`);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        return res.status(200).send(csvContent);
    }
    catch (err) {
        console.error('Export evaluations error:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
exports.exportEvaluations = exportEvaluations;
