import { createOpenAPIApp, setupDocumentation } from './lib/openapi';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { HTTPException } from 'hono/http-exception';
import { supabaseMiddleware } from './middleware/auth.middleware';
import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { APIError } from './types/index';

// Import OpenAPI route definitions
import {
  getUserContextRoute,
  updateUserContextRoute,
  getUserProgressRoute
} from './api/v1/openapi/users-openapi';
import {
  createSessionRoute,
  getUserSessionsRoute
} from './api/v1/openapi/sessions-openapi';
import {
  joinRoomRoute,
  getActiveRoomsRoute
} from './api/v1/openapi/rooms-openapi';
import {
  agentProgressRoute,
  agentSessionRoute,
  agentUserContextRoute,
  agentHealthRoute,
} from './api/v1/openapi/agent-openapi';

// Import actual route handlers
import { usersRoutes, sessionsRoutes, roomsRoutes, agentRoutes } from './api/v1/routes/index';

// Create OpenAPI app
const app = createOpenAPIApp();

// Global middleware
app.use('*', logger());
app.use('*', cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'https://localhost:3000', 'http://localhost:5173'],
  credentials: true,
}));
app.use('*', supabaseMiddleware());

// Health check routes with OpenAPI
const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  tags: ['Health'],
  summary: 'Health check',
  description: 'Check API service health and status',
  responses: {
    200: {
      description: 'Service is healthy',
      content: {
        'application/json': {
          schema: z.object({
            status: z.string(),
            timestamp: z.string(),
            version: z.string(),
            database: z.string(),
            auth_providers: z.array(z.string()),
          }),
        },
      },
    },
  },
});

const rootRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Health'],
  summary: 'API information',
  description: 'Get basic API information and status',
  responses: {
    200: {
      description: 'API information',
      content: {
        'application/json': {
          schema: z.object({
            message: z.string(),
            version: z.string(),
            status: z.string(),
            timestamp: z.string(),
            documentation: z.object({
              openapi: z.string(),
              swagger: z.string(),
              scalar: z.string(),
            }),
          }),
        },
      },
    },
  },
});

// Register health routes
app.openapi(rootRoute, (c) => {
  return c.json({
    message: 'Japanese Language Tutor API',
    version: '1.0.0',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    documentation: {
      openapi: '/openapi.json',
      swagger: '/docs',
      scalar: '/scalar',
    },
  });
});

app.openapi(healthRoute, async (c) => {
  const authManager = c.get('authManager');
  const supabase = c.get('supabase');

  // Test database connection
  let dbStatus = 'healthy';
  try {
    const { error } = await supabase.from('users').select('count').limit(1);
    if (error) dbStatus = 'error';
  } catch (err) {
    dbStatus = 'unreachable';
  }

  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    database: dbStatus,
    auth_providers: authManager?.getProviderNames() || [],
  });
});

// Note: OpenAPI route definitions are automatically included through the app.route() calls below
// The actual implementations in users.js, sessions.js, rooms.js, and agent.js provide the OpenAPI schemas

// Setup API documentation
setupDocumentation(app);

// API routes (actual implementations)
app.route('/api/users', usersRoutes);
app.route('/api/sessions', sessionsRoutes);
app.route('/api/rooms', roomsRoutes);
app.route('/api/agent', agentRoutes);

// Global error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);

  if (err instanceof HTTPException) {
    const error: APIError = {
      error: {
        code: 'HTTP_ERROR',
        message: err.message,
      },
      timestamp: new Date().toISOString(),
    };
    return c.json(error, err.status);
  }

  const error: APIError = {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
    timestamp: new Date().toISOString(),
  };
  return c.json(error, 500);
});

// 404 handler
app.notFound((c) => {
  const error: APIError = {
    error: {
      code: 'NOT_FOUND',
      message: 'The requested endpoint was not found',
    },
    timestamp: new Date().toISOString(),
  };
  return c.json(error, 404);
});

export default app;
