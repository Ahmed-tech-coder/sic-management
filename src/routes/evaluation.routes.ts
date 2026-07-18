import { Router } from 'express';
import {
  getEvaluations,
  createEvaluation,
  updateEvaluation,
  deleteEvaluation,
  exportEvaluations,
  importEvaluations,
} from '../controllers/evaluation.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();

router.get('/', authenticate, getEvaluations);
router.get('/export', authenticate, authorize(['head', 'leader', 'hr']), exportEvaluations);
router.post('/import', authenticate, authorize(['head']), importEvaluations);
router.post('/', authenticate, authorize(['head']), createEvaluation);
router.put('/:id', authenticate, authorize(['head']), updateEvaluation);
router.delete('/:id', authenticate, authorize(['head']), deleteEvaluation);

export default router;
