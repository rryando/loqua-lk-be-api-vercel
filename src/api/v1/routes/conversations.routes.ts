import { OpenAPIHono } from '@hono/zod-openapi';
import { ConversationsController } from '../controllers/conversations.controller';
import {
    storeConversationsRoute,
    getUserSummaryRoute,
} from '../openapi/conversations-openapi';

const conversations = new OpenAPIHono();

// POST /conversations - Store conversation data
conversations.openapi(storeConversationsRoute, async (c) => {
    return ConversationsController.storeConversations(c);
});

// GET /users/{user_id}/summary - Get AI-generated user summary
conversations.openapi(getUserSummaryRoute, async (c) => {
    return ConversationsController.getUserSummary(c);
});

export default conversations;