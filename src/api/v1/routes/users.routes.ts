import { OpenAPIHono } from '@hono/zod-openapi';
import { requireAuth } from '../../../middleware/auth.middleware';
import { UsersController } from '../controllers/users.controller';
import {
    getUserContextRoute,
    updateUserContextRoute,
    getUserProgressRoute
} from '../openapi/users-openapi';

const users = new OpenAPIHono();

// GET /api/users/{user_id}/context
users.openapi(getUserContextRoute, async (c) => {
    // Apply auth middleware
    const authResult = await requireAuth()(c, async () => { });
    if (authResult) return authResult;

    return UsersController.getUserContext(c);
});

// PUT /api/users/{user_id}/context
users.openapi(updateUserContextRoute, async (c) => {
    // Apply auth middleware

    const authResult = await requireAuth()(c, async () => { });
    if (authResult) return authResult;

    return UsersController.updateUserContext(c);
});

// GET /api/users/{user_id}/progress
users.openapi(getUserProgressRoute, async (c) => {
    console.log(c)

    // Apply auth middleware
    const authResult = await requireAuth()(c, async () => { });
    if (authResult) return authResult;

    return UsersController.getUserProgress(c);
});

export default users;
