import { OpenAPIHono } from '@hono/zod-openapi';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { SessionsController } from '../controllers/sessions.controller.js';
import {
    createSessionRoute,
    getUserSessionsRoute
} from '../openapi/sessions-openapi.js';

const sessions = new OpenAPIHono();

// POST /api/sessions
sessions.openapi(createSessionRoute, async (c) => {
    // Apply auth middleware
    const authResult = await requireAuth()(c, async () => { });
    if (authResult) return authResult;

    return SessionsController.createSession(c);
});

// GET /api/sessions - Get current user's sessions
sessions.openapi(getUserSessionsRoute, async (c) => {
    // Apply auth middleware
    const authResult = await requireAuth()(c, async () => { });
    if (authResult) return authResult;

    return SessionsController.getUserSessions(c);
});

export default sessions;
