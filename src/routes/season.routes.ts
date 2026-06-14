import { Router } from 'express';
import { getSeasons, createSeason, setActiveSeason } from '../controllers/season.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();

router.get('/', authenticate, getSeasons);
router.post('/', authenticate, authorize(['leader']), createSeason);
router.put('/:id/active', authenticate, authorize(['leader']), setActiveSeason);

export default router;
