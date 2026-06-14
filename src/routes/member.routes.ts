import { Router } from 'express';
import { getMembers, createMember, updateMember, deleteMember } from '../controllers/member.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();

router.get('/', authenticate, getMembers);
router.post('/', authenticate, authorize(['head', 'hr']), createMember);
router.put('/:id', authenticate, authorize(['head', 'hr']), updateMember);
router.delete('/:id', authenticate, authorize(['head', 'hr']), deleteMember);

export default router;
