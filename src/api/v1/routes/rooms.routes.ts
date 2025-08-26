import { OpenAPIHono } from '@hono/zod-openapi';
import { requireAuth } from '../../../middleware/auth.middleware.js';
import { RoomsController } from '../controllers/rooms.controller.js';
import {
    joinRoomRoute,
    getActiveRoomsRoute
} from '../openapi/rooms-openapi.js';

const rooms = new OpenAPIHono();

// POST /api/rooms/join
rooms.openapi(joinRoomRoute, async (c) => {
    // Apply auth middleware
    const authResult = await requireAuth()(c, async () => { });
    if (authResult) return authResult;

    return RoomsController.joinRoom(c);
});

// GET /api/rooms/active - Get active rooms for user (optional endpoint)
rooms.openapi(getActiveRoomsRoute, async (c) => {
    // Apply auth middleware
    const authResult = await requireAuth()(c, async () => { });
    if (authResult) return authResult;

    return RoomsController.getActiveRooms(c);
});

export default rooms;
