# Agent API Reference Guide

## Overview

This document provides the complete API reference for LiveKit agents integrating with the Loqua API system. All endpoints require proper authentication and follow RESTful conventions.

## Base Configuration

**API Base URL**: `https://api.loqua.app` (production) | `https://staging-api.loqua.app` (staging) | `http://localhost:3000` (development)

**Required Headers for All Requests**:
```
Content-Type: application/json
X-Agent-ID: {your_agent_identifier}
```

## Authentication Flow

### 1. Agent Authentication
Agents authenticate using service JWT tokens. Obtain your agent JWT from the Loqua admin panel.

### 2. User Token Passthrough Pattern
1. Agent authenticates with its own JWT
2. Agent requests encrypted user JWT after user joins room
3. Agent uses user JWT for all subsequent API operations
4. All actions appear as user actions in audit logs

## API Endpoints

### 1. Get Encrypted User JWT Token

**Purpose**: Request encrypted user JWT for API operations on behalf of user after they join the LiveKit room.

```http
POST /api/v1/agent/user-token
```

**Headers**:
```
Authorization: Bearer {agent_jwt}
X-Agent-ID: {agent_identifier}
Content-Type: application/json
```

**Request Body**:
```json
{
  "room_name": "room_12345",
  "user_id": "user_uuid_here", 
  "agent_id": "spanish-tutor-v1"
}
```

**Success Response (200)**:
```json
{
  "success": true,
  "encrypted_token": "aes256_encrypted_jwt_here",
  "expires_in": 3600,
  "issued_at": "2025-01-15T10:30:00Z",
  "user_id": "user_uuid_here",
  "agent_id": "spanish-tutor-v1"
}
```

**Error Responses**:
```json
// 400 - Missing required fields
{
  "error": {
    "code": "MISSING_REQUIRED_FIELDS",
    "message": "room_name, user_id, and agent_id are required"
  },
  "timestamp": "2025-01-15T10:30:00Z"
}

// 401 - Invalid agent token
{
  "error": {
    "code": "INVALID_AGENT_TOKEN",
    "message": "Agent authentication failed"
  },
  "timestamp": "2025-01-15T10:30:00Z"
}

// 403 - Insufficient permissions
{
  "error": {
    "code": "INSUFFICIENT_PERMISSIONS",
    "message": "Agent lacks required permissions"
  },
  "timestamp": "2025-01-15T10:30:00Z"
}
```

---

### 2. Update User Progress

**Purpose**: Record user learning progress during or after conversation sessions.

```http
POST /api/v1/agent/progress
```

**Headers**:
```
Authorization: Bearer {user_jwt}
X-Agent-ID: {agent_identifier}
Content-Type: application/json
```

**Request Body**:
```json
{
  "userId": "user_uuid_here",
  "sessionId": "sess_20250115_103045_abc123",
  "progress": {
    "words_learned": 5,
    "phrases_practiced": 12,
    "pronunciation_score": 85,
    "grammar_points": ["present_tense", "articles"]
  }
}
```

**Success Response (200)**:
```json
{
  "success": true,
  "message": "Progress updated successfully",
  "userId": "user_uuid_here",
  "sessionId": "sess_20250115_103045_abc123",
  "agentId": "spanish-tutor-v1",
  "timestamp": "2025-01-15T10:30:00Z",
  "batched": true
}
```

**Error Responses**:
```json
// 400 - Invalid progress data
{
  "error": {
    "code": "INVALID_PROGRESS_DATA",
    "message": "Progress data validation failed"
  },
  "timestamp": "2025-01-15T10:30:00Z"
}

// 401 - Invalid user token
{
  "error": {
    "code": "INVALID_USER_TOKEN", 
    "message": "User authentication failed"
  },
  "timestamp": "2025-01-15T10:30:00Z"
}
```

---

### 3. Create Learning Session

**Purpose**: Create comprehensive learning session record on behalf of user at session completion.

```http
POST /api/v1/agent/sessions
```

**Headers**:
```
Authorization: Bearer {user_jwt}
X-Agent-ID: {agent_identifier}
Content-Type: application/json
```

**Request Body**:
```json
{
  "userId": "user_uuid_here",
  "sessionId": "sess_20250115_103045_abc123",
  "duration_minutes": 30,
  "topics_covered": ["greetings", "travel", "restaurant"],
  "new_vocabulary": [
    {
      "word": "hello",
      "translation": "hola", 
      "language": "es"
    },
    {
      "word": "thank you",
      "translation": "gracias",
      "language": "es"
    }
  ],
  "grammar_points": ["present_tense", "articles"],
  "pronunciation_practice_count": 15,
  "overall_performance": "good",
  "achievements": ["first_conversation", "vocabulary_milestone_10"],
  "next_session_recommendations": [
    "Focus on past tense verbs",
    "Practice restaurant vocabulary"
  ]
}
```

**Field Descriptions**:
- `overall_performance`: Enum - `"excellent"`, `"good"`, `"fair"`, `"needs_improvement"`
- `duration_minutes`: Integer - Total session time in minutes
- `topics_covered`: Array - Topics discussed during session
- `new_vocabulary`: Array - New words learned with translations
- `grammar_points`: Array - Grammar concepts covered
- `achievements`: Array - Achievements unlocked during session
- `next_session_recommendations`: Array - Suggestions for future sessions

**Success Response (200)**:
```json
{
  "success": true,
  "session_id": "sess_20250115_103045_abc123",
  "created_at": "2025-01-15T11:00:00Z",
  "created_by": "agent",
  "agent_id": "spanish-tutor-v1"
}
```

**Error Responses**:
```json
// 400 - Invalid session data
{
  "error": {
    "code": "INVALID_SESSION_DATA",
    "message": "Session validation failed: duration_minutes must be positive"
  },
  "timestamp": "2025-01-15T10:30:00Z"
}

// 409 - Session already exists
{
  "error": {
    "code": "SESSION_ALREADY_EXISTS",
    "message": "Session with this ID already exists"
  },
  "timestamp": "2025-01-15T10:30:00Z"
}
```

---

### 4. Get User Context

**Purpose**: Retrieve user learning context, preferences, and history for session personalization.

```http
POST /api/v1/agent/user/{user_id}/context
```

**Headers**:
```
Authorization: Bearer {user_jwt}
X-Agent-ID: {agent_identifier}
Content-Type: application/json
```

**URL Parameters**:
- `user_id` (string): The user ID to retrieve context for

**Request Body**:
```json
{
  "userId": "user_uuid_here",
  "sessionId": "sess_20250115_103045_abc123"
}
```

**Success Response (200)**:
```json
{
  "user_id": "user_uuid_here",
  "preferences": {
    "learning_level": "intermediate",
    "learning_goals": ["conversational_fluency", "business_spanish"],
    "preferred_topics": ["travel", "food", "business"],
    "practice_frequency": "daily",
    "session_duration_preference": 30,
    "wants_formal_speech": false,
    "wants_kanji_practice": false,
    "wants_grammar_focus": true
  },
  "progress": {
    "total_sessions": 25,
    "total_conversation_time": 750,
    "words_learned": 150,
    "phrases_practiced": 85,
    "pronunciation_score_avg": 82,
    "grammar_points_covered": ["present_tense", "past_tense", "articles"],
    "achievements_unlocked": ["first_conversation", "week_streak", "vocabulary_50"],
    "last_session_date": "2025-01-14T15:30:00Z",
    "current_streak": 7
  },
  "session_history": [
    {
      "session_id": "sess_20250114_153045_xyz789",
      "date": "2025-01-14T15:30:00Z",
      "duration_minutes": 25,
      "topics_covered": ["travel", "hotel_booking"]
    }
  ],
  "created_at": "2024-12-01T10:00:00Z",
  "updated_at": "2025-01-14T15:45:00Z",
  "accessed_by": {
    "agent_id": "spanish-tutor-v1",
    "timestamp": "2025-01-15T10:30:00Z"
  },
  "cached": false
}
```

**Response Field Notes**:
- `cached`: Boolean indicating if response was served from cache (5-minute TTL)
- `learning_level`: Enum - `"beginner"`, `"intermediate"`, `"advanced"` 
- `practice_frequency`: Enum - `"daily"`, `"weekly"`, `"monthly"`

**Error Responses**:
```json
// 400 - Missing userId validation
{
  "error": {
    "code": "MISSING_USER_ID",
    "message": "userId is required for agent context validation"
  },
  "timestamp": "2025-01-15T10:30:00Z"
}

// 404 - User context not found
{
  "error": {
    "code": "USER_CONTEXT_NOT_FOUND",
    "message": "User context not found"
  },
  "timestamp": "2025-01-15T10:30:00Z"
}
```

---

### 5. Agent Health Check

**Purpose**: Verify agent authentication, permissions, and service connectivity.

```http
POST /api/v1/agent/health
```

**Headers**:
```
Authorization: Bearer {agent_jwt}
X-Agent-ID: {agent_identifier}
Content-Type: application/json
```

**Request Body**:
```json
{
  "userId": "user_uuid_here"
}
```

**Success Response (200)**:
```json
{
  "status": "healthy",
  "agent_id": "spanish-tutor-v1",
  "permissions": [
    "user.progress",
    "session.create", 
    "user.context",
    "user.token"
  ],
  "timestamp": "2025-01-15T10:30:00Z"
}
```

**Error Responses**:
```json
// 400 - Missing userId
{
  "error": {
    "code": "MISSING_USER_ID", 
    "message": "userId is required for agent context validation"
  },
  "timestamp": "2025-01-15T10:30:00Z"
}

// 401 - Invalid agent token
{
  "error": {
    "code": "INVALID_AGENT_TOKEN",
    "message": "Agent authentication failed"
  },
  "timestamp": "2025-01-15T10:30:00Z"
}

// 403 - Insufficient permissions  
{
  "error": {
    "code": "INSUFFICIENT_PERMISSIONS",
    "message": "Agent lacks required permissions"
  },
  "timestamp": "2025-01-15T10:30:00Z"
}
```

## Environment Configuration

### Required Environment Variables

**For Agent Authentication**:
```env
# Environment-specific agent secrets (choose based on deployment)
DEV_AGENT_SECRET=dev_secret_here
STAGING_AGENT_SECRET=staging_secret_here  
PROD_AGENT_SECRET=production_secret_here

# Agent identification
AGENT_ID=spanish-tutor-v1

# API endpoints
API_BASE_URL=https://api.loqua.app
```

**For Token Decryption**:
```env
# Environment-specific JWT secrets (must match API configuration)
DEV_JWT_SECRET=dev_jwt_secret_here
STAGING_JWT_SECRET=staging_jwt_secret_here
PROD_JWT_SECRET=production_jwt_secret_here
```

### Environment Detection

```python
import os

def detect_environment():
    env = os.getenv("NODE_ENV", "").lower()
    
    # Production detection
    if env == "production" or os.getenv("VERCEL_ENV") == "production":
        return "production"
    
    # Staging detection  
    if env == "staging" or os.getenv("VERCEL_ENV") == "preview":
        return "staging"
    
    # Default to development
    return "development"

def get_agent_secret():
    environment = detect_environment()
    secrets = {
        "development": os.getenv("DEV_AGENT_SECRET"),
        "staging": os.getenv("STAGING_AGENT_SECRET"),
        "production": os.getenv("PROD_AGENT_SECRET")
    }
    
    return secrets.get(environment) or os.getenv("AGENT_TOKEN_SECRET")
```

## Token Decryption

### AES-256-CBC Decryption

The encrypted user JWT tokens use AES-256-CBC encryption and must be decrypted before use:

```python
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
import base64

def decrypt_user_token(encrypted_token: str, secret: str) -> str:
    """
    Decrypt AES-256-CBC encrypted user JWT token
    
    Args:
        encrypted_token: Base64 encoded encrypted token from API
        secret: Environment-specific decryption secret
        
    Returns:
        Decrypted JWT token string
    """
    try:
        # Decode base64 encrypted data
        encrypted_data = base64.b64decode(encrypted_token)
        
        # Extract IV (first 16 bytes) and ciphertext
        iv = encrypted_data[:16]
        ciphertext = encrypted_data[16:]
        
        # Create cipher and decrypt
        key = secret.encode('utf-8')[:32].ljust(32, b'\0')  # Ensure 32 bytes
        cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
        decryptor = cipher.decryptor()
        
        decrypted = decryptor.update(ciphertext) + decryptor.finalize()
        
        # Remove PKCS7 padding
        padding_length = decrypted[-1]
        return decrypted[:-padding_length].decode('utf-8')
        
    except Exception as e:
        raise ValueError(f"Token decryption failed: {str(e)}")
```

## Error Handling

### Common Error Codes

| Code | Description | Common Causes |
|------|-------------|---------------|
| `MISSING_REQUIRED_FIELDS` | Required fields missing from request | Incomplete request payload |
| `INVALID_AGENT_TOKEN` | Agent JWT authentication failed | Expired or malformed agent token |
| `INVALID_USER_TOKEN` | User JWT authentication failed | Expired or malformed user token |
| `INSUFFICIENT_PERMISSIONS` | Agent lacks required permissions | Agent not authorized for action |
| `USER_CONTEXT_NOT_FOUND` | User context does not exist | New user or missing onboarding |
| `SESSION_ALREADY_EXISTS` | Duplicate session ID | Session ID collision |
| `MISSING_USER_ID` | userId required for validation | Missing userId in request |
| `HEALTH_CHECK_FAILED` | Agent health check failed | Service connectivity issues |

### Retry Logic

Implement exponential backoff for API failures:

```python
import asyncio
import random

async def api_request_with_retry(request_func, max_retries=3):
    """Execute API request with exponential backoff retry logic"""
    
    for attempt in range(max_retries + 1):
        try:
            return await request_func()
        except Exception as e:
            if attempt == max_retries:
                raise e
                
            # Exponential backoff with jitter
            delay = min(2 ** attempt + random.uniform(0, 1), 10)
            await asyncio.sleep(delay)
```

## Rate Limits

The API implements rate limiting to ensure fair usage:

- **Health checks**: 60 requests per minute
- **Progress updates**: 120 requests per minute (batched automatically)
- **User context**: 30 requests per minute (cached responses)
- **Session creation**: 10 requests per minute
- **Token requests**: 30 requests per minute

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1642867200
```