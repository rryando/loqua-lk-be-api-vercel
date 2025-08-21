import { OpenAPIHono } from '@hono/zod-openapi';
import { requireAuth } from '../../../middleware/auth.middleware';
import { SessionsController } from '../controllers/sessions.controller';
import {
    createSessionRoute,
    getUserSessionsRoute
} from '../openapi/sessions-openapi';

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
