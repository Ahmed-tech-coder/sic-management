import { Router } from 'express';
import { getActivityLogs, deleteActivityLog, clearActivityLogs } from '../controllers/log.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();

router.get('/', authenticate, authorize(['leader', 'hr']), getActivityLogs);
router.delete('/:id', authenticate, authorize(['leader']), deleteActivityLog);
router.delete('/', authenticate, authorize(['leader']), clearActivityLogs);

export default router;
