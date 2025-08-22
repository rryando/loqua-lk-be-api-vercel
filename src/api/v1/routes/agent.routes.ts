import { OpenAPIHono } from '@hono/zod-openapi';
import {
    agentAuthMiddleware,
    validateAgentContext,
    requireAgentPermission,
} from '../../../middleware/agent.middleware';
import { AgentController } from '../controllers/agent.controller';
import {
    agentProgressRoute,
    agentSessionRoute,
    agentUserContextRoute,
    agentHealthRoute,
    notLoggedInHealthRoute,
} from '../openapi/agent-openapi';

const agent = new OpenAPIHono();

// POST /agent/progress - Update user progress during session
agent.openapi(agentProgressRoute, async (c, next) => {
    // Apply middleware manually
    await agentAuthMiddleware()(c, async () => { });
    await validateAgentContext()(c, async () => { });
    await requireAgentPermission('user.progress')(c, async () => { });

    return AgentController.updateProgress(c);
});

// POST /agent/sessions - Create session on behalf of user
agent.openapi(agentSessionRoute, async (c, next) => {
    // Apply middleware manually
    await agentAuthMiddleware()(c, async () => { });
    await validateAgentContext()(c, async () => { });
    await requireAgentPermission('session.create')(c, async () => { });

    return AgentController.createSession(c);
});

// POST /agent/user/{user_id}/context - Get user context for agent
agent.openapi(agentUserContextRoute, async (c, next) => {
    // Apply middleware manually
    await agentAuthMiddleware()(c, async () => { });
    await validateAgentContext()(c, async () => { });
    await requireAgentPermission('user.context')(c, async () => { });

    return AgentController.getUserContext(c);
});

// POST /agent/health - Agent health check
agent.openapi(agentHealthRoute, async (c, next) => {
    // Apply middleware manually
    await agentAuthMiddleware()(c, async () => { });
    await validateAgentContext()(c, async () => { });

    return AgentController.healthCheck(c);
});

agent.openapi(notLoggedInHealthRoute, async (c, next) => {
    return c.json({
        status: 'healthy' as const,
        timestamp: new Date().toISOString(),
    });
});


export default agent;
