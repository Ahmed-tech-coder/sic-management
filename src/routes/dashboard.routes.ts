import { Router } from 'express';
import { getDashboardMetrics } from '../controllers/dashboard.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.get('/metrics', authenticate, getDashboardMetrics);

export default router;
