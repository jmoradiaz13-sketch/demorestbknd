const router = require('express').Router();
const ctrl = require('../controllers/cashClosing.controller');
const authMiddleware = require('../middleware/auth.middleware');
const role = require('../middleware/role.middleware');

router.post('/open', authMiddleware, role('admin', 'cajero'), ctrl.open);
router.put('/:id/close', authMiddleware, role('admin', 'cajero'), ctrl.close);
router.post('/:id/movements', authMiddleware, role('admin', 'cajero'), ctrl.addMovement);
router.get('/', authMiddleware, role('admin'), ctrl.getAll);
router.get('/current', authMiddleware, role('admin', 'cajero'), ctrl.getCurrent);

module.exports = router;
