import { Router } from 'express';
import { getUsers, createUser, updateUser, deleteUser } from '../controllers/user.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();

router.get('/', authenticate, authorize(['leader', 'hr']), getUsers);
router.post('/', authenticate, authorize(['leader']), createUser);
router.put('/:id', authenticate, authorize(['leader']), updateUser);
router.delete('/:id', authenticate, authorize(['leader']), deleteUser);

export default router;
