import { Router } from 'express';
import { getActivityLogs } from '../controllers/log.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();

router.get('/', authenticate, authorize(['leader', 'hr']), getActivityLogs);

export default router;
