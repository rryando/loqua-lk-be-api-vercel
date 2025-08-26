# Agent Bootstrap API Documentation

## Overview

The Agent Bootstrap API provides a **single, ultra-optimized endpoint** that replaces multiple startup calls with one comprehensive request. This endpoint delivers all necessary user context, statistics, and AI-generated summaries in a token-efficient format designed specifically for LLM agents.

## Key Benefits

- **🚀 85% faster startup** - Single API call instead of 4 separate calls
- **💾 90% fewer database queries** - One RPC call instead of 9+ queries
- **🎯 75% more token-efficient** - Algorithmic summaries (~50 tokens vs 200+)
- **⚡ Zero LLM overhead** - No external AI API calls for summaries
- **📊 Performance monitoring** - Built-in query and cache metrics

---

## Endpoint

### `GET /api/v1/agent/bootstrap/{user_id}`

**Replaces these legacy endpoints:**
- ~~`POST /api/v1/agent/user-token`~~
- ~~`POST /api/v1/agent/user/{user_id}/context`~~  
- ~~`GET /api/v1/conversations/{user_id}/summary`~~
- ~~`GET /api/v1/agent/pronunciation-evaluations/{user_id}/phrases`~~

---

## Authentication

**Required:** Agent Service Account JWT Token

```http
Authorization: Bearer <your_agent_service_jwt>
```

The agent must have appropriate permissions in the JWT payload.

---

## Request Parameters

### Path Parameters

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `user_id` | string | Yes      | User UUID to bootstrap agent for |

### Query Parameters  

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `include_raw_data` | string | No | `false` | Set to `"true"` to include structured raw data alongside AI summary |

### Request Examples

**Basic usage (AI summary only):**
```http
GET /api/v1/agent/bootstrap/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**With raw data for detailed operations:**
```http
GET /api/v1/agent/bootstrap/550e8400-e29b-41d4-a716-446655440000?include_raw_data=true
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Response Format

### Success Response (200 OK)

```json
{
  "success": true,
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-08-26T10:30:00.000Z",
  
  "ai_summary": {
    "compact_summary": "USER: Yuki (L2, 23d streak) | STATS: 15 convos, 12 evals, 7.8/10 avg | TOPICS: restaurant, business | STRONG: formal, numbers | FOCUS: particles, casual | RECENT: booking, appointment",
    "generated_at": "2025-08-26T10:30:00.000Z",
    "from_cache": true,
    "data_included": {
      "conversation_count": 15,
      "evaluation_count": 12,
      "session_count": 8,
      "has_user_context": true
    }
  },
  
  "user_auth": {
    "display_name": "Yuki Tanaka",
    "email": "yuki@example.com",
    "avatar_url": "https://example.com/avatar.jpg",
    "user_verified": true
  },
  
  "performance": {
    "total_queries": 1,
    "cache_hits": 1,
    "execution_time_ms": 45
  },
  
  "raw_data": {
    "user_context": {
      "user_id": "550e8400-e29b-41d4-a716-446655440000",
      "preferences": {
        "learning_level": "intermediate",
        "learning_goals": ["business_conversation", "travel"],
        "preferred_topics": ["restaurant", "hotel", "phone_calls"],
        "practice_frequency": "daily",
        "session_duration_preference": 30,
        "wants_formal_speech": true,
        "wants_kanji_practice": false,
        "wants_grammar_focus": true
      },
      "progress": {
        "total_sessions": 8,
        "total_conversation_time": 240,
        "words_learned": 45,
        "phrases_practiced": 67,
        "pronunciation_score_avg": 7.8,
        "grammar_points_covered": ["particles", "keigo", "conditionals"],
        "achievements_unlocked": ["week_streak", "first_conversation"],
        "last_session_date": "2025-08-25T14:00:00.000Z",
        "current_streak": 23
      },
      "session_history": [
        {
          "session_id": "session_123",
          "date": "2025-08-25T14:00:00.000Z",
          "duration_minutes": 25,
          "topics_covered": ["restaurant_booking", "phone_etiquette"]
        }
      ],
      "created_at": "2025-08-01T09:00:00.000Z",
      "updated_at": "2025-08-25T14:00:00.000Z"
    },
    
    "evaluated_phrases": [
      {
        "kanji": "予約をお願いします",
        "romaji": "yoyaku wo onegaishimasu",
        "topic": "restaurant",
        "last_evaluated": "2025-08-25T14:15:00.000Z",
        "best_score": 8.5
      },
      {
        "kanji": "電話に出る",
        "romaji": "denwa ni deru",
        "topic": "business",
        "last_evaluated": "2025-08-24T10:30:00.000Z",
        "best_score": 6.2
      }
    ],
    
    "recent_sessions": [
      {
        "session_id": "session_123",
        "duration_minutes": 25,
        "topics_covered": ["restaurant_booking", "phone_etiquette"],
        "created_at": "2025-08-25T14:00:00.000Z"
      }
    ]
  }
}
```

### Response Field Descriptions

#### `ai_summary` (Always Present)
- **`compact_summary`** - Ultra-compact, token-efficient user context (~50 tokens)
- **`generated_at`** - When this summary was generated
- **`from_cache`** - Whether summary came from cache (performance indicator)
- **`data_included`** - Metadata about what data was used to generate summary

#### `user_auth` (Always Present)
- **`display_name`** - User's display name for personalization
- **`email`** - User's email (for identification)
- **`avatar_url`** - User's profile picture URL (nullable)
- **`user_verified`** - Whether user account is verified

#### `performance` (Always Present)
- **`total_queries`** - Number of database queries executed
- **`cache_hits`** - Number of cache hits (higher = better performance)
- **`execution_time_ms`** - Total API execution time in milliseconds

#### `raw_data` (Optional - only if `include_raw_data=true`)
- **`user_context`** - Full user preferences and progress data
- **`evaluated_phrases`** - Recent pronunciation evaluations (last 7 days)
- **`recent_sessions`** - Latest learning session summaries (last 10)

---

## Error Responses

### 400 Bad Request
```json
{
  "error": {
    "code": "INVALID_USER_ID",
    "message": "User ID must be a valid UUID"
  },
  "timestamp": "2025-08-26T10:30:00.000Z"
}
```

### 401 Unauthorized
```json
{
  "error": {
    "code": "INVALID_AGENT_TOKEN", 
    "message": "Invalid agent authentication token"
  },
  "timestamp": "2025-08-26T10:30:00.000Z"
}
```

### 404 Not Found
```json
{
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "User not found"
  },
  "timestamp": "2025-08-26T10:30:00.000Z"
}
```

### 500 Internal Server Error
```json
{
  "error": {
    "code": "SERVER_ERROR",
    "message": "Failed to bootstrap agent data",
    "details": "Database connection failed"
  },
  "timestamp": "2025-08-26T10:30:00.000Z"
}
```

---

## Usage Examples

### Python Agent Implementation

```python
import aiohttp
import asyncio

class LoquaAgentClient:
    def __init__(self, agent_jwt: str, base_url: str = "https://api.loqua.ai"):
        self.agent_jwt = agent_jwt
        self.base_url = base_url
        self.headers = {"Authorization": f"Bearer {agent_jwt}"}
    
    async def bootstrap_user(self, user_id: str, include_raw_data: bool = False) -> dict:
        """
        Bootstrap agent with user context in a single API call.
        Replaces multiple legacy endpoint calls.
        """
        params = {}
        if include_raw_data:
            params["include_raw_data"] = "true"
            
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{self.base_url}/api/v1/agent/bootstrap/{user_id}",
                headers=self.headers,
                params=params
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_data = await response.json()
                    raise Exception(f"Bootstrap failed: {error_data}")

# Usage in LiveKit Agent
async def on_participant_joined(participant):
    user_id = participant.attributes.get("user_id")
    
    # Single call to get all user context
    bootstrap_data = await agent_client.bootstrap_user(
        user_id=user_id,
        include_raw_data=True  # Get detailed data for complex operations
    )
    
    # Use the ultra-compact summary for LLM context
    user_context = bootstrap_data["ai_summary"]["compact_summary"]
    
    # Use raw data for detailed operations
    user_preferences = bootstrap_data["raw_data"]["user_context"]["preferences"]
    evaluated_phrases = bootstrap_data["raw_data"]["evaluated_phrases"]
    
    # Log performance metrics
    performance = bootstrap_data["performance"]
    print(f"Bootstrap completed in {performance['execution_time_ms']}ms "
          f"with {performance['total_queries']} queries, {performance['cache_hits']} cache hits")
```

### Node.js/TypeScript Implementation

```typescript
interface BootstrapResponse {
  success: boolean;
  user_id: string;
  timestamp: string;
  ai_summary: {
    compact_summary: string;
    generated_at: string;
    from_cache: boolean;
    data_included: {
      conversation_count: number;
      evaluation_count: number;
      session_count: number;
      has_user_context: boolean;
    };
  };
  user_auth: {
    display_name: string | null;
    email: string | null;
    avatar_url: string | null;
    user_verified: boolean;
  };
  performance: {
    total_queries: number;
    cache_hits: number;
    execution_time_ms: number;
  };
  raw_data?: {
    user_context?: any;
    evaluated_phrases?: any[];
    recent_sessions?: any[];
  };
}

class LoquaAgentSDK {
  constructor(private agentJWT: string, private baseUrl: string = 'https://api.loqua.ai') {}

  async bootstrapUser(userId: string, includeRawData: boolean = false): Promise<BootstrapResponse> {
    const params = new URLSearchParams();
    if (includeRawData) {
      params.append('include_raw_data', 'true');
    }

    const response = await fetch(
      `${this.baseUrl}/api/v1/agent/bootstrap/${userId}?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${this.agentJWT}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Bootstrap failed: ${JSON.stringify(error)}`);
    }

    return await response.json();
  }
}

// Usage example
const agent = new LoquaAgentSDK(process.env.AGENT_JWT!);

// In your agent's participant join handler
async function handleParticipantJoined(participant: any) {
  const userId = participant.metadata.user_id;
  
  try {
    const bootstrap = await agent.bootstrapUser(userId, true);
    
    // Use compact summary for LLM context (saves tokens!)
    const llmContext = bootstrap.ai_summary.compact_summary;
    
    // Use detailed data for business logic
    const userLevel = bootstrap.raw_data?.user_context?.preferences?.learning_level;
    const strengths = extractTopics(llmContext, 'STRONG');
    const focusAreas = extractTopics(llmContext, 'FOCUS');
    
    console.log(`User ${bootstrap.user_auth.display_name} bootstrapped in ${bootstrap.performance.execution_time_ms}ms`);
    
  } catch (error) {
    console.error('Bootstrap failed:', error);
  }
}
```

---

## Performance Optimization Tips

### 1. **Cache Strategy**
- Use `include_raw_data=false` for frequent context checks (faster, cached)
- Use `include_raw_data=true` only when you need detailed user data
- Cache responses on your agent side for repeated access within the same session

### 2. **Token Optimization**
- The `ai_summary.compact_summary` is designed for LLM context - use it directly
- Parse structured information from the summary format:
  ```
  USER: Name (Level, Streak) | STATS: X convos, Y evals, Z.Z/10 avg | TOPICS: topic1, topic2 | STRONG: strength1, strength2 | FOCUS: focus1, focus2 | RECENT: recent1, recent2
  ```

### 3. **Error Handling**
```python
async def robust_bootstrap(user_id: str, max_retries: int = 3):
    for attempt in range(max_retries):
        try:
            return await agent_client.bootstrap_user(user_id)
        except Exception as e:
            if attempt == max_retries - 1:
                # Fallback to basic user info
                return await fallback_user_context(user_id)
            await asyncio.sleep(0.5 * (2 ** attempt))  # Exponential backoff
```

### 4. **Monitoring**
Monitor the `performance` section to track:
- **Query efficiency**: Should typically be 1 query
- **Cache hit ratio**: Higher is better
- **Execution time**: Should be under 200ms for cached responses

---

## Migration Guide

### From Legacy Endpoints

**Before (4 API calls):**
```python
# Legacy approach - SLOW ❌
user_token = await get_user_token(room_name, user_id, agent_id)
user_context = await get_user_context(user_id)  
user_summary = await get_user_summary(user_id)
evaluated_phrases = await get_evaluated_phrases(user_id)

# Total: ~2-3 seconds, 9+ database queries
```

**After (1 API call):**
```python
# Optimized approach - FAST ✅
bootstrap = await bootstrap_user(user_id, include_raw_data=True)

# Extract everything you need
user_context = bootstrap["raw_data"]["user_context"]
ai_summary = bootstrap["ai_summary"]["compact_summary"]  
evaluated_phrases = bootstrap["raw_data"]["evaluated_phrases"]

# Total: ~200ms, 1 database query
```

### Response Mapping

| Legacy Endpoint | New Bootstrap Field | Notes |
|----------------|--------------------| ------|
| `get_user_token()` | `user_auth` | No longer need separate token endpoint |
| `get_user_context()` | `raw_data.user_context` | Exact same structure |
| `get_user_summary()` | `ai_summary.compact_summary` | More compact, token-efficient |
| `get_evaluated_phrases()` | `raw_data.evaluated_phrases` | Same data, better performance |

---

## Rate Limits

- **Standard agents**: 100 requests/minute per agent
- **Premium agents**: 1000 requests/minute per agent
- **Burst limit**: 10 requests/second

---

## Support

For technical support and questions:
- **Documentation**: [Agent API Docs](https://docs.loqua.ai/agent-api)
- **GitHub Issues**: [loqua-api/issues](https://github.com/loqua/loqua-api/issues)  
- **Discord**: [#agent-development](https://discord.gg/loqua-devs)
- **Email**: agent-support@loqua.ai

---

## Changelog

### v1.0.0 (2025-08-26)
- 🎉 **Initial release** of unified bootstrap endpoint
- ⚡ **85% performance improvement** over legacy endpoints  
- 🎯 **Token-efficient summaries** (~50 tokens vs 200+)
- 📊 **Built-in performance monitoring**
- 🔄 **Smart caching** with automatic invalidation