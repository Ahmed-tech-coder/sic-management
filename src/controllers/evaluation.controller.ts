import { Response } from 'express';
import { supabaseAdmin, getSupabaseClient } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { z } from 'zod';
import { Readable } from 'stream';
import { auditEmitter } from '../utils/auditLogger';
import { memoryCache } from '../utils/cache';

const createEvaluationSchema = z.object({
  task_name: z.string().min(2, 'Task name must be at least 2 characters'),
  technical_member_id: z.string().uuid('Invalid technical member ID'),
  score: z.number().min(0, 'Score must be at least 0'),
  max_score: z.number().min(1, 'Max score must be at least 1').default(100),
  notes: z.string().optional().nullable(),
}).refine(data => data.score <= (data.max_score ?? 100), {
  message: 'Score cannot exceed the task max score',
  path: ['score'],
});

const updateEvaluationSchema = z.object({
  task_name: z.string().min(2, 'Task name must be at least 2 characters'),
  technical_member_id: z.string().uuid('Invalid technical member ID'),
  score: z.number().min(0, 'Score must be at least 0'),
  max_score: z.number().min(1, 'Max score must be at least 1').default(100),
  notes: z.string().optional().nullable(),
}).refine(data => data.score <= (data.max_score ?? 100), {
  message: 'Score cannot exceed the task max score',
  path: ['score'],
});

export const getEvaluations = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { track_id, search, task, page = '1', limit = '10' } = req.query;
    const client = getSupabaseClient(req.token);

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const from = (pageNum - 1) * limitNum;
    const to = from + limitNum - 1;

    // Fetch unique task names for filters (filtered by track)
    let taskQuery = client
      .from('evaluations')
      .select('task_name, technical_members!inner(track_id)');

    if (req.user?.role === 'head') {
      taskQuery = taskQuery.eq('technical_members.track_id', req.user.track_id);
    } else if (track_id) {
      taskQuery = taskQuery.eq('technical_members.track_id', track_id);
    }
    const { data: allTasks } = await taskQuery;
    const uniqueTasks = Array.from(new Set((allTasks || []).map((t: any) => t.task_name))).sort();

    let query = client
      .from('evaluations')
      .select('*, technical_members!inner(*, tracks!inner(name)), evaluator:users(*)', { count: 'exact' });

    // 2. Enforce track constraints based on role
    if (req.user?.role === 'head') {
      query = query.eq('technical_members.track_id', req.user.track_id);
    } else if (track_id) {
      // Leader/HR can filter by track
      query = query.eq('technical_members.track_id', track_id);
    }

    // 3. Task filter
    if (task) {
      query = query.eq('task_name', task);
    }

    // 4. Search filter (cross-table OR workaround for PostgREST limitation)
    if (search) {
      const searchStr = `%${search}%`;
      // Resolve member IDs matching the search name
      const { data: members } = await client
        .from('technical_members')
        .select('id')
        .ilike('name', searchStr);

      const matchingMemberIds = (members || []).map((m) => m.id);

      if (matchingMemberIds.length > 0) {
        query = query.or(`task_name.ilike.${searchStr},technical_member_id.in.(${matchingMemberIds.join(',')})`);
      } else {
        query = query.ilike('task_name', searchStr);
      }
    }

    const { data: evaluations, count, error } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    return res.status(200).json({
      evaluations,
      tasks: uniqueTasks,
      total: count || 0,
      page: pageNum,
      limit: limitNum,
      totalPages: count ? Math.ceil(count / limitNum) : 0,
    });
  } catch (err) {
    console.error('Get evaluations error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const createEvaluation = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = createEvaluationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Validation error' });
    }

    const { task_name, technical_member_id, score, max_score, notes } = parsed.data;
    const client = getSupabaseClient(req.token);

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

    // Check for duplicate: same student + same task
    const { data: existingEval } = await client
      .from('evaluations')
      .select('id')
      .eq('technical_member_id', technical_member_id)
      .eq('task_name', task_name)
      .maybeSingle();

    if (existingEval) {
      return res.status(409).json({ error: `This student has already been evaluated for "${task_name}"` });
    }

    // 2. Create evaluation
    const { data: evaluation, error } = await client
      .from('evaluations')
      .insert({
        task_name,
        technical_member_id,
        evaluator_id: req.user?.id,
        score,
        max_score: max_score ?? 100,
        notes: notes || null,
      })
      .select('*, technical_members(name, track_id)')
      .single();

    if (error) throw error;

    // Log admin action asynchronously
    auditEmitter.emitLog({
      userId: req.user?.id || '',
      action: 'Created Evaluation',
      entityType: 'evaluations',
      entityId: evaluation.id,
      description: `Evaluated ${member.name} for task "${task_name}" with score ${score}/${max_score ?? 100}`,
    });

    // Invalidate dashboard metrics cache
    memoryCache.clearPattern(/^dashboard-metrics:/);

    return res.status(201).json({
      message: 'Evaluation created successfully',
      evaluation,
    });
  } catch (err) {
    console.error('Create evaluation error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const updateEvaluation = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const parsed = updateEvaluationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Validation error' });
    }

    const { task_name, technical_member_id, score, max_score, notes } = parsed.data;
    const client = getSupabaseClient(req.token);

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
        max_score: max_score ?? 100,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*, technical_members(name)')
      .single();

    if (error) throw error;

    // Log admin action asynchronously
    auditEmitter.emitLog({
      userId: req.user?.id || '',
      action: 'Updated Evaluation',
      entityType: 'evaluations',
      entityId: id as string,
      description: `Updated evaluation for ${member.name} - task "${task_name}" - score ${score}/${max_score ?? 100}`,
    });

    // Invalidate dashboard metrics cache
    memoryCache.clearPattern(/^dashboard-metrics:/);

    return res.status(200).json({
      message: 'Evaluation updated successfully',
      evaluation,
    });
  } catch (err) {
    console.error('Update evaluation error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const deleteEvaluation = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const client = getSupabaseClient(req.token);

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

    if (error) throw error;

    // Log admin action asynchronously
    auditEmitter.emitLog({
      userId: req.user?.id || '',
      action: 'Deleted Evaluation',
      entityType: 'evaluations',
      entityId: id as string,
      description: `Deleted evaluation of ${Array.isArray(evaluation.technical_members) ? evaluation.technical_members[0]?.name : (evaluation.technical_members as any)?.name || 'Unknown'} for task "${evaluation.task_name}"`,
    });

    // Invalidate dashboard metrics cache
    memoryCache.clearPattern(/^dashboard-metrics:/);

    return res.status(200).json({ message: 'Evaluation deleted successfully' });
  } catch (err) {
    console.error('Delete evaluation error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Helper generator function for CSV streaming to achieve O(1) memory footprint
async function* getEvaluationsCsvGenerator(client: any, trackId: any, search?: string, task?: string) {
  yield 'Person Name,Task Name,Score\n';

  let page = 0;
  const limit = 500;
  let hasMore = true;

  while (hasMore) {
    const from = page * limit;
    const to = from + limit - 1;

    let query = client
      .from('evaluations')
      .select('task_name, score, technical_members!inner(name, track_id)');

    if (trackId) {
      query = query.eq('technical_members.track_id', trackId);
    }

    if (task) {
      query = query.eq('task_name', task);
    }

    if (search) {
      const searchStr = `%${search}%`;
      const { data: members } = await client
        .from('technical_members')
        .select('id')
        .ilike('name', searchStr);

      const matchingMemberIds = (members || []).map((m: any) => m.id);

      if (matchingMemberIds.length > 0) {
        query = query.or(`task_name.ilike.${searchStr},technical_member_id.in.(${matchingMemberIds.join(',')})`);
      } else {
        query = query.ilike('task_name', searchStr);
      }
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      hasMore = false;
      break;
    }

    for (const ev of data) {
      const row = [
        ev.technical_members?.name || '',
        ev.task_name,
        ev.score,
      ];

      const csvRow = row
        .map((value) => {
          const strValue = String(value ?? '').replace(/"/g, '""');
          return strValue.includes(',') || strValue.includes('\n') || strValue.includes('\r') || strValue.includes('"')
            ? `"${strValue}"`
            : strValue;
        })
        .join(',') + '\n';

      yield csvRow;
    }

    if (data.length < limit) {
      hasMore = false;
    } else {
      page++;
    }
  }
}

export const exportEvaluations = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { track_id, search, task } = req.query;
    const client = getSupabaseClient(req.token);

    const effectiveTrackId = req.user?.role === 'head' ? req.user.track_id : track_id;

    res.setHeader('Content-Disposition', `attachment; filename=Evaluations_Report.csv`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');

    const csvStream = Readable.from(getEvaluationsCsvGenerator(client, effectiveTrackId, search as string | undefined, task as string | undefined));

    csvStream.on('error', (err) => {
      console.error('CSV Stream processing error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal Server Error during streaming' });
      } else {
        res.end();
      }
    });

    csvStream.pipe(res);
  } catch (err) {
    console.error('Export evaluations error:', err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
};

// Bulk import evaluations from parsed CSV data
const importRowSchema = z.object({
  assessment_name: z.string().min(1, 'Assessment name is required'),
  student_name: z.string().min(1, 'Student name is required'),
  total_grade: z.number().min(1, 'Total grade must be at least 1'),
  student_grade: z.number().min(0, 'Student grade must be at least 0'),
});

export const importEvaluations = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { rows } = req.body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'No data rows provided' });
    }

    if (rows.length > 500) {
      return res.status(400).json({ error: 'Cannot import more than 500 rows at once' });
    }

    const client = getSupabaseClient(req.token);
    const trackId = req.user?.track_id;

    // 1. Fetch all members across all tracks for name matching
    const { data: trackMembers, error: membersError } = await client
      .from('technical_members')
      .select('id, name, track_id');

    if (membersError) throw membersError;

    // Build a name -> id lookup map (case-insensitive, trimmed)
    const memberMap = new Map<string, string>();
    for (const m of trackMembers || []) {
      memberMap.set(m.name.trim().toLowerCase(), m.id);
    }

    // 2. Pre-process rows to find students that need to be auto-created
    const missingNames = new Set<string>();
    for (const raw of rows) {
      const name = raw.student_name?.toString().trim().toLowerCase();
      if (name && !memberMap.has(name)) {
        missingNames.add(raw.student_name?.toString().trim());
      }
    }

    // Auto-create missing students in the head's track
    if (missingNames.size > 0) {
      const newMembers = Array.from(missingNames).map((name) => {
        const cleanName = name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase() || 'student';
        const uniqueSuffix = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        // Generate a 10-digit numeric string for phone
        const randomPhone = `01${Math.floor(10000000 + Math.random() * 90000000)}`;
        return {
          name,
          track_id: trackId,
          email: `${cleanName}_${uniqueSuffix}@temporary.com`,
          phone: randomPhone,
        };
      });

      const { data: createdMembers, error: createError } = await client
        .from('technical_members')
        .insert(newMembers)
        .select('id, name');

      if (createError) {
        console.error('Auto-create members error details:', createError);
        throw createError;
      }

      // Add newly created members to the lookup map
      for (const m of createdMembers || []) {
        memberMap.set(m.name.trim().toLowerCase(), m.id);
      }
    }

    // 3. Fetch existing evaluations for duplicate detection
    const memberIds = Array.from(memberMap.values());
    const existingSet = new Set<string>();
    if (memberIds.length > 0) {
      const { data: existingEvals } = await client
        .from('evaluations')
        .select('task_name, technical_member_id')
        .in('technical_member_id', memberIds);

      for (const ev of existingEvals || []) {
        existingSet.add(`${ev.technical_member_id}::${ev.task_name.trim().toLowerCase()}`);
      }
    }

    // Track duplicates within the CSV itself
    const csvSeenSet = new Set<string>();

    const results: { row: number; status: 'success' | 'error'; error?: string }[] = [];
    const insertPayloads: any[] = [];

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      const parsed = importRowSchema.safeParse({
        assessment_name: raw.assessment_name?.toString().trim(),
        student_name: raw.student_name?.toString().trim(),
        total_grade: Number(raw.total_grade),
        student_grade: Number(raw.student_grade),
      });

      if (!parsed.success) {
        results.push({ row: i + 1, status: 'error', error: parsed.error.issues[0]?.message || 'Validation error' });
        continue;
      }

      const { assessment_name, student_name, total_grade, student_grade } = parsed.data;

      if (student_grade > total_grade) {
        results.push({ row: i + 1, status: 'error', error: `Student grade (${student_grade}) exceeds total grade (${total_grade})` });
        continue;
      }

      const memberId = memberMap.get(student_name.toLowerCase());
      if (!memberId) {
        results.push({ row: i + 1, status: 'error', error: `Could not resolve student "${student_name}"` });
        continue;
      }

      // Check for duplicate in existing DB records
      const dupeKey = `${memberId}::${assessment_name.trim().toLowerCase()}`;
      if (existingSet.has(dupeKey)) {
        results.push({ row: i + 1, status: 'error', error: `"${student_name}" already evaluated for "${assessment_name}"` });
        continue;
      }

      // Check for duplicate within the same CSV file
      if (csvSeenSet.has(dupeKey)) {
        results.push({ row: i + 1, status: 'error', error: `Duplicate entry in CSV: "${student_name}" for "${assessment_name}"` });
        continue;
      }
      csvSeenSet.add(dupeKey);

      insertPayloads.push({
        index: i,
        data: {
          task_name: assessment_name,
          technical_member_id: memberId,
          evaluator_id: req.user?.id,
          score: student_grade,
          max_score: total_grade,
          notes: null,
        },
      });
    }

    // 2. Bulk insert valid rows
    if (insertPayloads.length > 0) {
      const { data: inserted, error: insertError } = await client
        .from('evaluations')
        .insert(insertPayloads.map((p) => p.data))
        .select('id');

      if (insertError) {
        // If bulk insert fails, mark all as error
        for (const p of insertPayloads) {
          results.push({ row: p.index + 1, status: 'error', error: 'Database insert failed' });
        }
      } else {
        for (const p of insertPayloads) {
          results.push({ row: p.index + 1, status: 'success' });
        }

        // Log admin action
        auditEmitter.emitLog({
          userId: req.user?.id || '',
          action: 'Imported Evaluations',
          entityType: 'evaluations',
          entityId: '',
          description: `Bulk imported ${inserted.length} evaluations from CSV`,
        });

        // Invalidate caches
        memoryCache.clearPattern(/^dashboard-metrics:/);
      }
    }

    // Sort results by row number
    results.sort((a, b) => a.row - b.row);

    const successCount = results.filter((r) => r.status === 'success').length;
    const errorCount = results.filter((r) => r.status === 'error').length;

    return res.status(200).json({
      message: `Import completed: ${successCount} succeeded, ${errorCount} failed`,
      successCount,
      errorCount,
      totalRows: rows.length,
      results,
    });
  } catch (err) {
    console.error('Import evaluations error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
