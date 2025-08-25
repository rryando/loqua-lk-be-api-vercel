# Conversation Storage & User Summary API Integration Guide

This guide covers the new conversation storage and AI-powered user summary system for agent integration.

## Overview

The conversation storage and summary system provides:
- **Conversation Storage**: Store user/assistant messages for analysis
- **AI-Powered Summaries**: Generate compact user profiles for agent personalization
- **Intelligent Caching**: Cost-effective OpenAI usage with long-term caching
- **Agent Optimization**: Summaries optimized for LLM consumption

## API Endpoints

### 1. Store Conversations

**Endpoint**: `POST /api/v1/conversations`
**Purpose**: Store conversation messages for summary generation
**Authentication**: Bearer JWT token required

#### Request Format

```http
POST /api/v1/conversations
Authorization: Bearer your-jwt-token
Content-Type: application/json

{
  "conversations": [
    {
      "userId": "550e8400-e29b-41d4-a716-446655440000",
      "sessionId": "session-2025-01-25-001",
      "message": "Hello, I want to practice Japanese pronunciation",
      "role": "user",
      "metadata": {
        "timestamp": "2025-01-25T10:30:00Z",
        "source": "voice_chat"
      }
    },
    {
      "userId": "550e8400-e29b-41d4-a716-446655440000",
      "sessionId": "session-2025-01-25-001", 
      "message": "こんにちは！発音の練習をしましょう。まず「こんにちは」と言ってみてください。",
      "role": "assistant",
      "metadata": {
        "timestamp": "2025-01-25T10:30:05Z",
        "generated_tokens": 245
      }
    }
  ]
}
```

#### Request Schema

```typescript
interface StoreConversationRequest {
  conversations: ConversationEntry[]
}

interface ConversationEntry {
  userId: string           // UUID format required
  sessionId: string        // Session identifier for grouping
  message: string          // Message content (1+ characters)
  role: 'user' | 'assistant'  // Message sender
  metadata?: object        // Optional additional data
}
```

#### Response Examples

**Success Response (201)**:
```json
{
  "success": true,
  "message": "Conversations stored successfully",
  "stored_count": 2,
  "session_ids": ["session-2025-01-25-001"],
  "timestamp": "2025-01-25T10:30:10.123Z"
}
```

**Error Response (400)**:
```json
{
  "error": {
    "code": "INVALID_CONVERSATION_DATA",
    "message": "Each conversation must have userId, sessionId, message, and role"
  },
  "timestamp": "2025-01-25T10:30:10.123Z"
}
```

**Error Response (401)**:
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Valid JWT token required"
  },
  "timestamp": "2025-01-25T10:30:10.123Z"
}
```

### 2. Get User Summary

**Endpoint**: `GET /api/v1/users/{user_id}/summary`
**Purpose**: Get AI-generated comprehensive user summary for agent personalization
**Authentication**: Bearer JWT token required

#### Request Format

```http
GET /api/v1/users/550e8400-e29b-41d4-a716-446655440000/summary
Authorization: Bearer your-jwt-token
```

#### Response Examples

**Success Response (200) - Fresh Generation**:
```json
{
  "success": true,
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "compactSummary": "**Learning Profile**: Beginner-level Japanese learner (3 weeks) focusing on conversational skills and pronunciation. Shows consistent engagement with 2-3 sessions weekly, 25-minute preference.\n\n**Communication Style**: Polite, curious learner who asks clarifying questions. Prefers step-by-step explanations and appreciates encouragement. Responds well to structured practice with immediate feedback.\n\n**Progress Indicators**: Strong motivation with 8-day current streak. Vocabulary: 45 words learned, pronunciation: 23 phrases practiced (avg score 7.2/10). Struggles with long vowel sounds and pitch accent. Comfortable with hiragana, working on katakana.\n\n**Knowledge Areas**: Greetings, basic introductions, family terms, food vocabulary. Grammar: present tense, basic particles (は、を、に). Cultural interest in traditional customs and modern anime/manga.\n\n**Learning Preferences**: Visual learner who benefits from romaji initially. Wants formal speech patterns for business context. Enjoys storytelling practice and cultural discussions. Responds positively to gamification elements.\n\n**Optimal Approach**: Start sessions with achievement review. Use graduated difficulty with pronunciation drills. Incorporate cultural context in vocabulary. Provide frequent positive reinforcement. Focus on practical conversational scenarios.",
  "generatedAt": "2025-01-25T10:45:22.456Z",
  "fromCache": false,
  "dataIncluded": {
    "conversationCount": 34,
    "evaluationCount": 23,
    "sessionCount": 12,
    "hasUserContext": true
  }
}
```

**Success Response (200) - From Cache**:
```json
{
  "success": true,
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "compactSummary": "**Learning Profile**: Beginner-level Japanese learner...",
  "generatedAt": "2025-01-25T08:15:33.789Z",
  "fromCache": true,
  "dataIncluded": {
    "conversationCount": 31,
    "evaluationCount": 20,
    "sessionCount": 11,
    "hasUserContext": true
  }
}
```

**Error Response (404)**:
```json
{
  "error": {
    "code": "NO_DATA_AVAILABLE",
    "message": "No data available to generate summary for this user"
  },
  "timestamp": "2025-01-25T10:45:22.456Z"
}
```

## Integration Examples

### Python Agent Integration

```python
import asyncio
import httpx
from typing import List, Dict, Any

class ConversationSummaryClient:
    def __init__(self, base_url: str, jwt_token: str):
        self.base_url = base_url
        self.headers = {
            "Authorization": f"Bearer {jwt_token}",
            "Content-Type": "application/json"
        }
        self.client = httpx.AsyncClient()
    
    async def store_conversations(self, conversations: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Store conversation messages"""
        payload = {"conversations": conversations}
        
        response = await self.client.post(
            f"{self.base_url}/api/v1/conversations",
            headers=self.headers,
            json=payload
        )
        response.raise_for_status()
        return response.json()
    
    async def get_user_summary(self, user_id: str) -> Dict[str, Any]:
        """Get user summary for personalization"""
        response = await self.client.get(
            f"{self.base_url}/api/v1/users/{user_id}/summary",
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()

# Usage Example
async def agent_workflow():
    client = ConversationSummaryClient("https://api.yourapp.com", "your-jwt-token")
    user_id = "550e8400-e29b-41d4-a716-446655440000"
    session_id = "session-2025-01-25-001"
    
    # 1. Get user summary at session start
    summary_data = await client.get_user_summary(user_id)
    user_summary = summary_data["compactSummary"]
    
    # Use summary for LLM context
    system_prompt = f"""
    You are a Japanese tutor. Here's what you know about this user:
    
    {user_summary}
    
    Adapt your teaching style accordingly.
    """
    
    # 2. During conversation, collect messages
    conversation_batch = []
    
    # User says something
    user_message = "How do you say 'good morning' in Japanese?"
    conversation_batch.append({
        "userId": user_id,
        "sessionId": session_id,
        "message": user_message,
        "role": "user"
    })
    
    # Agent responds
    agent_response = "おはようございます (ohayou gozaimasu) - Good morning!"
    conversation_batch.append({
        "userId": user_id,
        "sessionId": session_id,
        "message": agent_response,
        "role": "assistant"
    })
    
    # 3. Store conversations periodically or at session end
    if len(conversation_batch) >= 10:  # Batch storage
        await client.store_conversations(conversation_batch)
        conversation_batch.clear()
```

### Node.js Integration

```javascript
class ConversationSummaryAPI {
    constructor(baseUrl, jwtToken) {
        this.baseUrl = baseUrl;
        this.headers = {
            'Authorization': `Bearer ${jwtToken}`,
            'Content-Type': 'application/json'
        };
    }
    
    async storeConversations(conversations) {
        const response = await fetch(`${this.baseUrl}/api/v1/conversations`, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify({ conversations })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }
        
        return await response.json();
    }
    
    async getUserSummary(userId) {
        const response = await fetch(`${this.baseUrl}/api/v1/users/${userId}/summary`, {
            method: 'GET',
            headers: this.headers
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }
        
        return await response.json();
    }
}

// Usage example
const api = new ConversationSummaryAPI('https://api.yourapp.com', 'your-jwt-token');

// Get summary for personalization
const summaryData = await api.getUserSummary('550e8400-e29b-41d4-a716-446655440000');
console.log('User learning profile:', summaryData.compactSummary);

// Store conversation
await api.storeConversations([
    {
        userId: '550e8400-e29b-41d4-a716-446655440000',
        sessionId: 'session-123',
        message: 'I need help with pronunciation',
        role: 'user'
    }
]);
```

## Best Practices

### 1. Conversation Storage

**Batch Storage**: Store conversations in batches (5-50 messages) for efficiency:
```python
# Good: Batch storage
conversations = collect_session_messages()  # 10-20 messages
await store_conversations(conversations)

# Avoid: Single message storage
await store_conversations([single_message])  # Inefficient
```

**Session Grouping**: Use meaningful session IDs:
```python
# Good: Descriptive session IDs
session_id = f"tutoring-{user_id}-{date}-{session_number}"

# Good: Consistent format
session_id = f"session-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
```

**Metadata Usage**: Include relevant context:
```python
conversation = {
    "userId": user_id,
    "sessionId": session_id,
    "message": "こんにちは",
    "role": "user",
    "metadata": {
        "pronunciation_score": 8.5,
        "confidence_level": "high",
        "correction_needed": False,
        "topic": "greetings"
    }
}
```

### 2. Summary Usage

**Cache Awareness**: Handle both cached and fresh responses:
```python
summary_data = await get_user_summary(user_id)

if summary_data["fromCache"]:
    print(f"Using cached summary from {summary_data['generatedAt']}")
else:
    print("Generated fresh summary")

# Always use the summary regardless of cache status
user_summary = summary_data["compactSummary"]
```

**Session Start Pattern**: Get summary before conversation:
```python
async def start_tutoring_session(user_id: str):
    # 1. Get user summary first
    summary_data = await get_user_summary(user_id)
    
    # 2. Initialize LLM with user context
    llm_context = create_personalized_context(summary_data["compactSummary"])
    
    # 3. Begin conversation with personalized approach
    return start_conversation(llm_context)
```

**Error Handling**: Handle new users gracefully:
```python
try:
    summary_data = await get_user_summary(user_id)
    user_summary = summary_data["compactSummary"]
except Exception as e:
    if "NO_DATA_AVAILABLE" in str(e):
        # New user - use default approach
        user_summary = "New user - assess learning level and preferences"
    else:
        raise e
```

## Performance Characteristics

### Response Times
- **Store Conversations**: 50-200ms (depends on batch size)
- **Get Summary (cached)**: 50-100ms
- **Get Summary (fresh)**: 2-4 seconds (OpenAI processing)

### Caching Behavior
- **Cache Duration**: 48 hours maximum
- **Cache Invalidation**: Triggered when user data changes
- **Cost Optimization**: ~1-2 OpenAI calls per user per day

### Rate Limits
- **Conversation Storage**: 100 requests/minute per user
- **Summary Generation**: 10 requests/minute per user (most will hit cache)

## Error Handling

### Common Error Codes

| Code | Description | Resolution |
|------|-------------|------------|
| `INVALID_REQUEST` | Missing or malformed request body | Check request format |
| `INVALID_CONVERSATION_DATA` | Invalid conversation entry | Validate required fields |
| `INVALID_USER_ID` | Invalid UUID format | Use valid UUID for user_id |
| `USER_NOT_FOUND` | User doesn't exist in database | Ensure user is registered |
| `NO_DATA_AVAILABLE` | No data to generate summary | User needs to have conversations first |
| `SUMMARY_GENERATION_FAILED` | OpenAI API error | Retry after a few seconds |
| `UNAUTHORIZED` | Invalid or missing JWT | Check authentication |

### Error Handling Example

```python
async def robust_summary_request(user_id: str):
    try:
        summary_data = await get_user_summary(user_id)
        return summary_data["compactSummary"]
    
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            error_data = e.response.json()
            if error_data["error"]["code"] == "NO_DATA_AVAILABLE":
                return "New user - no previous interaction data available"
            elif error_data["error"]["code"] == "USER_NOT_FOUND":
                raise ValueError(f"User {user_id} not found")
        elif e.response.status_code == 500:
            # Retry on server error
            await asyncio.sleep(2)
            return await robust_summary_request(user_id)
        else:
            raise e
    
    except Exception as e:
        print(f"Unexpected error: {e}")
        return "Error retrieving user summary - using default approach"
```

## Security Considerations

### Authentication
- All endpoints require valid JWT tokens
- Tokens should include user authorization scopes
- Use HTTPS for all API calls

### Data Privacy
- Conversations are stored securely with encryption at rest
- Row-level security ensures users only access their own data
- Agent service accounts have limited, audited access

### Rate Limiting
- Implement client-side rate limiting to avoid API limits
- Use exponential backoff for retry logic
- Monitor API usage to stay within quotas

## Monitoring and Debugging

### Request Logging
```python
# Log API requests for debugging
import logging

logger = logging.getLogger(__name__)

async def store_conversations_with_logging(conversations):
    logger.info(f"Storing {len(conversations)} conversations")
    
    try:
        result = await client.store_conversations(conversations)
        logger.info(f"Successfully stored {result['stored_count']} conversations")
        return result
    except Exception as e:
        logger.error(f"Failed to store conversations: {e}")
        raise
```

### Summary Quality Monitoring
```python
# Monitor summary generation
async def get_summary_with_metrics(user_id: str):
    start_time = time.time()
    
    summary_data = await get_user_summary(user_id)
    
    generation_time = time.time() - start_time
    cache_hit = summary_data["fromCache"]
    
    # Log metrics
    logger.info(f"Summary request: user={user_id}, cache_hit={cache_hit}, "
                f"time={generation_time:.2f}s, data_sources={summary_data['dataIncluded']}")
    
    return summary_data
```

This integration guide provides everything needed to implement the conversation storage and user summary system in your agent applications. The API is designed for cost-effectiveness, performance, and ease of integration while providing rich user insights for personalized learning experiences.