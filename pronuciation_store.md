# Pronunciation Evaluation API Specification

This document specifies the API endpoints required to support the Japanese Language Tutor Agent's pronunciation evaluation storage and flashcard system.

## Overview

The Python agent will make HTTP requests to store pronunciation evaluation results and retrieve previously evaluated phrases to avoid repetition. This enables a flashcard system where users can review their pronunciation practice history.

## Database Schema

### Pronunciation Evaluations Table
```sql
CREATE TABLE pronunciation_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR REFERENCES users(user_id),
  kanji TEXT NOT NULL,
  romaji TEXT NOT NULL,
  translation TEXT NOT NULL,
  topic VARCHAR NOT NULL,
  user_pronunciation TEXT NOT NULL,
  evaluation_score INTEGER, -- 0-100
  evaluation_feedback TEXT,
  evaluation_details JSONB, -- specific pronunciation analysis
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX idx_pronunciation_evals_user_id ON pronunciation_evaluations(user_id);
CREATE INDEX idx_pronunciation_evals_topic ON pronunciation_evaluations(topic);
CREATE INDEX idx_pronunciation_evals_created_at ON pronunciation_evaluations(created_at);
```

## API Endpoints

### 1. Store Pronunciation Evaluation

**Purpose**: Store a new pronunciation evaluation result for flashcard review

```http
POST /api/v1/agent/pronunciation-evaluations
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
  "evaluation": {
    "kanji": "こんにちは",
    "romaji": "konnichiwa",
    "translation": "hello",
    "topic": "greetings",
    "user_pronunciation": "konichiwa",
    "evaluation_score": 85,
    "evaluation_feedback": "Good pronunciation! Watch the 'nn' sound in the middle.",
    "evaluation_details": {
      "phoneme_accuracy": {
        "ko": 95,
        "n": 70,
        "ni": 90,
        "chi": 85,
        "wa": 95
      },
      "overall_fluency": 85,
      "rhythm_score": 80
    }
  }
}
```

**Field Descriptions**:
- `kanji`: Japanese characters (hiragana/katakana/kanji)
- `romaji`: Romanized pronunciation guide
- `translation`: English translation
- `topic`: Learning topic (greetings, food, travel, etc.)
- `user_pronunciation`: What the user actually said (from STT)
- `evaluation_score`: Numerical score 0-100
- `evaluation_feedback`: Text feedback for the user
- `evaluation_details`: Detailed analysis (JSONB for flexibility)

**Success Response (201)**:
```json
{
  "success": true,
  "evaluation_id": "eval_uuid_here",
  "created_at": "2025-01-15T10:30:00Z",
  "message": "Pronunciation evaluation stored successfully"
}
```

**Error Responses**:
```json
// 400 - Invalid evaluation data
{
  "error": {
    "code": "INVALID_EVALUATION_DATA",
    "message": "Required fields missing: kanji, romaji, translation"
  },
  "timestamp": "2025-01-15T10:30:00Z"
}

// 409 - Duplicate evaluation (same user, kanji, within 24h)
{
  "error": {
    "code": "DUPLICATE_EVALUATION",
    "message": "Evaluation for this phrase already exists today"
  },
  "timestamp": "2025-01-15T10:30:00Z"
}
```

---

### 2. Get User's Pronunciation Evaluations

**Purpose**: Retrieve pronunciation evaluations for flashcard generation and review

```http
GET /api/v1/agent/pronunciation-evaluations/{user_id}
```

**Headers**:
```
Authorization: Bearer {user_jwt}
X-Agent-ID: {agent_identifier}
```

**Query Parameters**:
```
topic: string (optional) - Filter by topic
limit: number (optional, default: 50) - Number of results
offset: number (optional, default: 0) - Pagination offset
since_date: string (optional) - ISO date to filter recent evaluations
```

**Success Response (200)**:
```json
{
  "success": true,
  "evaluations": [
    {
      "id": "eval_uuid_here",
      "kanji": "こんにちは",
      "romaji": "konnichiwa", 
      "translation": "hello",
      "topic": "greetings",
      "user_pronunciation": "konichiwa",
      "evaluation_score": 85,
      "evaluation_feedback": "Good pronunciation! Watch the 'nn' sound in the middle.",
      "evaluation_details": {
        "phoneme_accuracy": {
          "ko": 95,
          "n": 70,
          "ni": 90,
          "chi": 85,
          "wa": 95
        },
        "overall_fluency": 85,
        "rhythm_score": 80
      },
      "created_at": "2025-01-15T10:30:00Z"
    }
  ],
  "total_count": 25,
  "has_more": false
}
```

**Error Responses**:
```json
// 404 - No evaluations found
{
  "error": {
    "code": "NO_EVALUATIONS_FOUND", 
    "message": "No pronunciation evaluations found for user"
  },
  "timestamp": "2025-01-15T10:30:00Z"
}
```

---

### 3. Get Phrases for Practice (LLM Context)

**Purpose**: Get list of already-evaluated phrases so LLM doesn't repeat them

```http
GET /api/v1/agent/pronunciation-evaluations/{user_id}/phrases
```

**Headers**:
```
Authorization: Bearer {user_jwt}
X-Agent-ID: {agent_identifier}
```

**Query Parameters**:
```
topic: string (optional) - Filter by topic
days_back: number (optional, default: 7) - Days to look back for evaluations
```

**Success Response (200)**:
```json
{
  "success": true,
  "evaluated_phrases": [
    {
      "kanji": "こんにちは",
      "romaji": "konnichiwa",
      "topic": "greetings",
      "last_evaluated": "2025-01-15T10:30:00Z",
      "best_score": 85
    },
    {
      "kanji": "ありがとう",
      "romaji": "arigatou",
      "topic": "greetings", 
      "last_evaluated": "2025-01-14T15:20:00Z",
      "best_score": 92
    }
  ],
  "count": 2
}
```

## Authentication & Error Handling

### Authentication
Follow the same authentication patterns as existing endpoints:
- Agent JWT authentication via `Authorization: Bearer {agent_jwt}` header
- User JWT for user-specific operations
- `X-Agent-ID` header for agent identification

### Standard Error Format
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message"
  },
  "timestamp": "2025-01-15T10:30:00Z"
}
```

### Common Error Codes
- `INVALID_EVALUATION_DATA`: Required fields missing or invalid (400)
- `DUPLICATE_EVALUATION`: Same phrase evaluated recently (409)
- `NO_EVALUATIONS_FOUND`: No evaluations exist for user (404)
- `INVALID_USER_TOKEN`: User authentication failed (401)
- `INSUFFICIENT_PERMISSIONS`: Agent lacks permissions (403)

## Implementation Notes

### Data Validation
- `kanji`: Required, non-empty string
- `romaji`: Required, non-empty string
- `translation`: Required, non-empty string
- `topic`: Required, non-empty string
- `evaluation_score`: Integer 0-100
- `evaluation_details`: Valid JSON object

### Duplicate Handling
Consider implementing logic to prevent duplicate evaluations of the same phrase within 24 hours for the same user, or allow duplicates but return the latest/best score.

### Performance Considerations
- Add database indexes on frequently queried fields (user_id, topic, created_at)
- Consider pagination for large result sets
- Cache frequently accessed phrases list (endpoint #3)

### Rate Limiting
- Store evaluations: 30 requests per minute per user
- Retrieve evaluations: 60 requests per minute per user
- Phrases context: 120 requests per minute per user (cached)

## Testing

### Sample API Calls

**Store evaluation**:
```bash
curl -X POST -H "Content-Type: application/json" \
     -H "Authorization: Bearer user_jwt_token" \
     -H "X-Agent-ID: japanese-tutor-v1" \
     -d '{
       "userId": "test_user_123",
       "sessionId": "sess_test_123",
       "evaluation": {
         "kanji": "こんにちは",
         "romaji": "konnichiwa",
         "translation": "hello",
         "topic": "greetings",
         "user_pronunciation": "konichiwa",
         "evaluation_score": 85,
         "evaluation_feedback": "Good pronunciation!",
         "evaluation_details": {"test": true}
       }
     }' \
     https://api.loqua.app/api/v1/agent/pronunciation-evaluations
```

**Get evaluations**:
```bash
curl -H "Authorization: Bearer user_jwt_token" \
     -H "X-Agent-ID: japanese-tutor-v1" \
     https://api.loqua.app/api/v1/agent/pronunciation-evaluations/test_user_123
```

**Get phrases context**:
```bash
curl -H "Authorization: Bearer user_jwt_token" \
     -H "X-Agent-ID: japanese-tutor-v1" \
     https://api.loqua.app/api/v1/agent/pronunciation-evaluations/test_user_123/phrases?days_back=7
```

## Integration with Agent

The Python agent has been updated to automatically:
1. Store evaluation results after each pronunciation practice
2. Load previously evaluated phrases at session start
3. Provide context to LLM to avoid repetition
4. Handle errors gracefully with fallback to mock data

The agent will start using these endpoints immediately once they're deployed and available.