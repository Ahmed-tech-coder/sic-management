"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const track_controller_1 = require("../controllers/track.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
router.get('/', auth_middleware_1.authenticate, track_controller_1.getTracks);
exports.default = router;
