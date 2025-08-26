import { OpenAPIHono } from '@hono/zod-openapi';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { UsersController } from '../controllers/users.controller.js';
import {
    getUserContextRoute,
    updateUserContextRoute,
    getUserProgressRoute
} from '../openapi/users-openapi.js';
import {
    getUserPronunciationEvaluationsRoute,
    getUserEvaluatedPhrasesRoute,
    getUserPronunciationAudioRoute,
} from '../openapi/users-pronunciation-openapi.js';

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

// GET /api/users/{user_id}/pronunciation-evaluations
users.openapi(getUserPronunciationEvaluationsRoute, async (c) => {
    // Apply auth middleware
    const authResult = await requireAuth()(c, async () => { });
    if (authResult) return authResult;

    return UsersController.getPronunciationEvaluations(c);
});

// GET /api/users/{user_id}/pronunciation-evaluations/phrases
users.openapi(getUserEvaluatedPhrasesRoute, async (c) => {
    // Apply auth middleware
    const authResult = await requireAuth()(c, async () => { });
    if (authResult) return authResult;

    return UsersController.getEvaluatedPhrases(c);
});

// POST /api/users/{user_id}/pronunciation-evaluations/{evaluation_id}/listen
users.openapi(getUserPronunciationAudioRoute, async (c) => {
    // Apply auth middleware
    const authResult = await requireAuth()(c, async () => { });
    if (authResult) return authResult;

    return UsersController.generatePronunciationAudio(c);
});

export default users;
