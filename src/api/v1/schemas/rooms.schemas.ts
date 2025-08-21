import { z } from 'zod';

// Room Join Request Schema
export const RoomJoinSchema = z.object({
    user_id: z.string(),
    room_name: z.string(),
});

// Room Token Response Schema
export const RoomTokenResponseSchema = z.object({
    token: z.string(),
    room_url: z.string(),
    room_name: z.string(),
    expires_at: z.string(),
    session_id: z.string(),
});

// Active Rooms Response Schema
export const ActiveRoomsResponseSchema = z.object({
    active_rooms: z.array(z.object({
        room_name: z.string(),
        participant_count: z.number(),
        created_at: z.string(),
    })),
});
