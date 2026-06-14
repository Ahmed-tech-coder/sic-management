import { Router } from 'express';
import { getTracks } from '../controllers/track.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.get('/', authenticate, getTracks);

export default router;
