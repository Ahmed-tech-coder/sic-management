import { Router } from 'express';
import {
  getEvaluations,
  createEvaluation,
  updateEvaluation,
  deleteEvaluation,
  exportEvaluations,
} from '../controllers/evaluation.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();

router.get('/', authenticate, getEvaluations);
router.get('/export', authenticate, authorize(['leader', 'hr']), exportEvaluations);
router.post('/', authenticate, authorize(['head']), createEvaluation);
router.put('/:id', authenticate, authorize(['head']), updateEvaluation);
router.delete('/:id', authenticate, authorize(['head']), deleteEvaluation);

export default router;
