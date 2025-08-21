# JavaScript Server API Specification for Japanese Tutor Agent

This document specifies the API endpoints required in your JavaScript (Hono) server to support the Japanese Language Tutor Agent's user context management and persistence.

## Overview

The Python agent will make HTTP requests to your JS server to:
1. **Retrieve user contexts** (preferences, progress) 
2. **Store/update user data** after sessions
3. **Handle authentication** and user management
4. **Generate LiveKit room tokens** for client connections

## Base Configuration

```typescript
// Environment variables needed in your JS server
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret  
LIVEKIT_URL=wss://your-livekit-instance.com

// Database connection (Supabase, etc.)
DATABASE_URL=your_supabase_url
DATABASE_KEY=your_supabase_key
```

## Required API Endpoints

### 1. User Context Management

#### GET `/api/users/{user_id}/context`
Retrieve complete user context including preferences and progress.

**Request:**
```http
GET /api/users/user123/context
Authorization: Bearer {auth_token}
```

**Response:**
```typescript
interface UserContextResponse {
  user_id: string;
  preferences: {
    learning_level: "absolute_beginner" | "beginner" | "elementary" | "intermediate" | "upper_intermediate" | "advanced";
    learning_goals: Array<"conversation" | "travel" | "business" | "anime_manga" | "culture" | "jlpt_prep" | "general">;
    preferred_topics: string[];
    practice_frequency: string;
    session_duration_preference: number;
    wants_formal_speech: boolean;
    wants_kanji_practice: boolean;
    wants_grammar_focus: boolean;
  };
  progress: {
    total_sessions: number;
    total_conversation_time: number;
    words_learned: number;
    phrases_practiced: number;
    pronunciation_score_avg: number;
    grammar_points_covered: string[];
    achievements_unlocked: string[];
    last_session_date: string | null;
    current_streak: number;
  };
  session_history: Array<{
    session_id: string;
    date: string;
    duration_minutes: number;
    topics_covered: string[];
    // ... other session data
  }>;
  created_at: string;
  updated_at: string;
}
```

**Error Responses:**
- `404`: User not found (new user)
- `401`: Unauthorized
- `500`: Server error

#### PUT `/api/users/{user_id}/context`
Create or update user context.

**Request:**
```http
PUT /api/users/user123/context
Authorization: Bearer {auth_token}
Content-Type: application/json

{
  "preferences": { /* UserPreferences object */ },
  "progress": { /* UserProgress object */ },
  "session_history": [ /* Session objects */ ]
}
```

**Response:**
```typescript
interface UpdateContextResponse {
  success: boolean;
  user_id: string;
  updated_at: string;
}
```

### 2. Session Management

#### POST `/api/sessions`
Create a new learning session record.

**Request:**
```http
POST /api/sessions
Authorization: Bearer {auth_token}
Content-Type: application/json

{
  "user_id": "user123",
  "session_id": "uuid-session-id",
  "duration_minutes": 25,
  "topics_covered": ["food", "greetings"],
  "new_vocabulary": ["こんにちは", "ありがとう"],
  "grammar_points": ["は particle", "です ending"],
  "pronunciation_practice_count": 5,
  "overall_performance": "Good progress!",
  "achievements": ["First Session", "Pronunciation Star"],
  "next_session_recommendations": ["Continue pronunciation practice"]
}
```

**Response:**
```typescript
interface SessionResponse {
  success: boolean;
  session_id: string;
  created_at: string;
}
```

### 3. LiveKit Room Token Generation

#### POST `/api/rooms/join`
Generate LiveKit room token for client connection.

**Request:**
```http
POST /api/rooms/join
Authorization: Bearer {auth_token}
Content-Type: application/json

{
  "user_id": "user123",
  "room_name": "japanese-lesson-456"
}
```

**Response:**
```typescript
interface RoomTokenResponse {
  token: string;
  room_url: string;
  room_name: string;
  expires_at: string;
}
```

**Implementation Example (Hono):**
```typescript
import { AccessToken } from 'livekit-server-sdk';

app.post('/api/rooms/join', async (c) => {
  const { user_id, room_name } = await c.req.json();
  
  // Verify user authentication
  const user = await authenticateUser(c);
  
  // Generate LiveKit token
  const token = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    {
      identity: user_id,
      name: user.display_name,
    }
  );
  
  token.addGrant({
    room: room_name,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  
  return c.json({
    token: await token.toJwt(),
    room_url: process.env.LIVEKIT_URL,
    room_name,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  });
});
```

### 4. Progress Analytics

#### GET `/api/users/{user_id}/progress`
Get detailed progress analytics for dashboards.

**Request:**
```http
GET /api/users/user123/progress
Authorization: Bearer {auth_token}
```

**Response:**
```typescript
interface ProgressAnalytics {
  total_stats: {
    sessions_completed: number;
    total_study_time: number;
    vocabulary_learned: number;
    current_streak: number;
    level_progression: string[];
  };
  recent_activity: Array<{
    date: string;
    session_count: number;
    study_minutes: number;
    topics_covered: string[];
  }>;
  achievements: Array<{
    id: string;
    title: string;
    description: string;
    unlocked_at: string;
    icon?: string;
  }>;
  next_milestones: Array<{
    title: string;
    progress: number;
    target: number;
  }>;
}
```

### 5. Content Management (Optional)

#### GET `/api/content/vocabulary/{topic}`
Get vocabulary for specific topics.

#### GET `/api/content/grammar/{level}`
Get grammar points for user level.

#### GET `/api/content/cultural-insights`
Get cultural insights for lessons.

## Database Schema (Supabase)

### Users Table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR UNIQUE NOT NULL,
  email VARCHAR,
  display_name VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### User Contexts Table
```sql
CREATE TABLE user_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR REFERENCES users(user_id),
  preferences JSONB NOT NULL,
  progress JSONB NOT NULL,
  session_history JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Learning Sessions Table
```sql
CREATE TABLE learning_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR REFERENCES users(user_id),
  session_id VARCHAR UNIQUE NOT NULL,
  duration_minutes INTEGER,
  topics_covered TEXT[],
  new_vocabulary TEXT[],
  grammar_points TEXT[],
  pronunciation_practice_count INTEGER DEFAULT 0,
  overall_performance TEXT,
  achievements TEXT[],
  session_data JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Achievements Table
```sql
CREATE TABLE achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR REFERENCES users(user_id),
  achievement_id VARCHAR NOT NULL,
  title VARCHAR NOT NULL,
  description TEXT,
  data JSONB,
  unlocked_at TIMESTAMP DEFAULT NOW()
);
```

## Authentication Integration

### User ID Extraction
The agent expects the user ID to be available through:

1. **Room Metadata** (recommended):
```typescript
// When creating LiveKit room token
const roomMetadata = JSON.stringify({ user_id: authenticatedUserId });
token.addGrant({
  room: room_name,
  roomJoin: true,
  // ... other permissions
});
```

2. **JWT Claims**:
```typescript
// In your auth token
{
  "sub": "user123",
  "user_id": "user123",
  // ... other claims
}
```

## Error Handling

### Standard Error Format
```typescript
interface APIError {
  error: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
}
```

### Common Error Codes
- `USER_NOT_FOUND`: User doesn't exist (404)
- `INVALID_CONTEXT`: Invalid user context data (400)
- `AUTH_REQUIRED`: Authentication required (401)
- `INSUFFICIENT_PERMISSIONS`: User lacks permissions (403)
- `RATE_LIMITED`: Too many requests (429)
- `SERVER_ERROR`: Internal server error (500)

## Implementation Checklist

### Phase 1: Basic Integration
- [ ] User context GET/PUT endpoints
- [ ] LiveKit room token generation
- [ ] Basic error handling
- [ ] User authentication

### Phase 2: Advanced Features
- [ ] Session tracking endpoints
- [ ] Progress analytics
- [ ] Achievement system
- [ ] Content management APIs

### Phase 3: Production Readiness
- [ ] Rate limiting
- [ ] Comprehensive logging
- [ ] Performance monitoring
- [ ] Error alerting
- [ ] Data backup/recovery

## Example Integration Flow

1. **Client App** requests room token from JS server
2. **JS Server** generates LiveKit token with user metadata
3. **Client** connects to LiveKit room using token
4. **Python Agent** joins room, extracts user_id from metadata
5. **Python Agent** calls JS server to get user context
6. **Agent** personalizes conversation based on context
7. **Agent** sends system messages to client via data channel
8. **Agent** updates progress via JS server at session end

## Testing

### API Testing
```bash
# Test user context retrieval
curl -H "Authorization: Bearer token" \
     http://localhost:3000/api/users/test123/context

# Test room token generation  
curl -X POST -H "Content-Type: application/json" \
     -H "Authorization: Bearer token" \
     -d '{"user_id":"test123","room_name":"test-room"}' \
     http://localhost:3000/api/rooms/join
```

### Agent Integration Testing
```bash
# Set API URL in agent environment
export USER_CONTEXT_API_URL=http://localhost:3000/api

# Test agent with API integration
uv run python src/agent.py console
```

This API specification provides everything needed to integrate the Japanese Language Tutor Agent with your Hono/JavaScript server and Supabase database.