# LiveKit Agent Lifecycle & API Integration Guide

## Overview

This document provides a comprehensive guide for implementing LiveKit agents that integrate with the Loqua API system. It covers the complete agent lifecycle, from initialization to API operations, with focus on proper authentication patterns and race condition prevention.

## Understanding LiveKit Agent Architecture

### Worker and Job Lifecycle
According to LiveKit documentation, the agent architecture follows a worker-job pattern:

> "When agent code starts, it first registers with a LiveKit server as a 'worker' process. The worker waits until it receives a dispatch request. To fulfill this request, the worker boots a 'job' subprocess which joins the room."
> 
> *Source: [LiveKit Agents - Job Lifecycle](https://docs.livekit.io/agents/worker/job/)*

Each job runs in a separate process to isolate agents from each other, ensuring that if one session crashes, it doesn't affect other agents running on the same worker.

### Agent Dispatch Methods
LiveKit supports two dispatch methods:

1. **Automatic Dispatch**: "By default, an agent is automatically dispatched to each new room"
2. **Explicit Dispatch**: Allows granular control over agent assignment via API calls or SIP rules

*Source: [LiveKit Agents - Agent Dispatch](https://docs.livekit.io/agents/worker/agent-dispatch/)*

## Critical Timing Considerations

### Race Condition Prevention
A critical issue identified in LiveKit agent development is the timing of when participant information becomes available:

> "You can add a participant entrypoint function to the JobContext using the add_participant_entrypoint method. This function is called for every participant that joins the room, and every participant already in the room when your agent joins."
> 
> *Source: [LiveKit Agents - Job Lifecycle](https://docs.livekit.io/agents/worker/job/)*

**⚠️ Critical Implementation Requirement:**
Always use `ctx.wait_for_participant()` to ensure participant presence before accessing metadata. Recent GitHub issues (June 2025) reported that `ctx.room.remote_participants.values()` was returning empty lists when called immediately in the entrypoint.

### Recommended Pattern
```pseudocode
async def entrypoint(ctx):
    await ctx.connect()
    participant = await ctx.wait_for_participant()  # Wait for user presence
    user_id = participant.attributes.get("user_id")  # Now safe to access
```

## Agent Authentication Strategy

### User Token Passthrough Pattern
The Loqua system implements a "user token passthrough" pattern where:

1. **Agent authenticates with its own JWT** for initial API access
2. **Agent requests encrypted user JWT** after user joins room  
3. **Agent uses user JWT** for all subsequent API operations
4. **All actions appear as user actions** in audit logs

This pattern ensures:
- Proper user permissions are maintained
- Clean audit trails (agent acts on behalf of user)
- No additional authentication complexity
- Existing RLS policies work correctly

## Implementation Lifecycle

### Phase 1: Room Connection and Participant Detection

LiveKit provides the `JobContext.connect()` method for room connection:

> "When the entrypoint is called, the worker has not connected to the Room yet. Certain properties of Room would not be available before calling JobContext.connect()."
> 
> *Source: [LiveKit Agents - Job Lifecycle](https://docs.livekit.io/agents/worker/job/)*

**Implementation Steps:**
1. **Connect to Room**: Use `ctx.connect()` with appropriate subscription settings
2. **Wait for Participant**: Use `ctx.wait_for_participant()` - this is critical for race condition prevention
3. **Extract User Metadata**: Access participant attributes safely after confirmation of presence
4. **Validate User Data**: Ensure required user_id is present in participant metadata

**Participant Attributes Access:**
LiveKit allows accessing participant metadata through the attributes system:

> "Agents can access participant attributes using `participant.attributes.get()`"
> 
> *Source: [LiveKit Agents - Build Session](https://docs.livekit.io/agents/build/session/)*

**Expected User Metadata Structure:**
When users join rooms via the Loqua API's `/rooms/join` endpoint, the following metadata is embedded in their LiveKit participant attributes:

```json
{
  "user_id": "user_uuid_here",
  "sessionId": "sess_timestamp_random",
  "email": "user@example.com",
  "display_name": "User Display Name"
}
```

**Metadata Access Pattern:**
```pseudocode
user_participant = await ctx.wait_for_participant()
user_id = user_participant.attributes.get("user_id")
session_id = user_participant.attributes.get("sessionId")
display_name = user_participant.attributes.get("display_name")
```

### Phase 2: Authentication Token Exchange

The Loqua API implements a secure token exchange mechanism:

**Process Flow:**
1. **Agent Authentication**: Agent uses its service JWT to authenticate with API
2. **User Token Request**: Agent requests encrypted user JWT via `/agent/user-token` endpoint
3. **Token Decryption**: Agent decrypts received token using shared secret
4. **API Authorization**: Agent uses decrypted user JWT for all subsequent API calls

**Security Implementation:**
- Tokens are encrypted using AES-256-CBC with random IV before transmission
- Agent identification is tracked via `X-Agent-ID` headers for comprehensive audit trails
- All agent actions are logged and attributed to the originating user
- Encrypted tokens have the format: `{iv_hex}:{encrypted_data_hex}`

**Token Decryption Process:**
1. **Split Token Components**: Separate IV and encrypted data using `:` delimiter
2. **Prepare Decryption Key**: Use shared secret (padded/truncated to 32 bytes)
3. **Initialize AES-256-CBC**: Create cipher with extracted IV
4. **Decrypt and Decode**: Decrypt data and remove PKCS7 padding
5. **Validate JWT Format**: Ensure resulting token has proper JWT structure (header.payload.signature)

### Phase 3: API Operations with User Context

Once authenticated with the user JWT, the agent can perform operations on behalf of the user:

**Available API Endpoints:**
- **`/api/v1/agent/user/{user_id}/context`** - Retrieve user learning context and preferences
- **`/api/v1/agent/progress`** - Update user progress during learning sessions  
- **`/api/v1/agent/sessions`** - Create learning session records
- **`/api/v1/agent/health`** - Perform agent health checks

**Request Pattern:**
All requests must include:
- `Authorization: Bearer {user_jwt}` - The decrypted user JWT token
- `X-Agent-ID: {agent_identifier}` - Agent identification for audit logging
- `Content-Type: application/json` - Standard JSON content type

### Phase 4: Session Management and Lifecycle

**Session Initialization:**
1. Retrieve user context for personalization
2. Generate unique session identifier
3. Initialize session tracking data structures
4. Perform initial health check

**Active Session Management:**
- Continuous audio/video processing based on LiveKit track events
- Periodic progress updates (recommended every 30 seconds)
- Real-time conversation state management
- Performance metric collection

**Session Completion:**
- Final progress update with complete session data
- Learning session record creation
- Achievement calculation and storage
- Next session recommendations generation

## LiveKit Integration Patterns

### Event Handling and Track Management

LiveKit provides comprehensive event handling for agent interactions:

> "You can listen for attribute changes with `@ctx.room.on('participant_attributes_changed')`"
> 
> *Source: [LiveKit Agents - Build Session](https://docs.livekit.io/agents/build/session/)*

**Key Events for Agent Development:**
- **`track_published`** - When participants publish audio/video tracks
- **`participant_connected`** - When new participants join the room
- **`participant_disconnected`** - When participants leave the room
- **`participant_attributes_changed`** - When participant metadata updates

### Audio and Video Processing

LiveKit agents can process real-time audio and video streams:

> "LiveKit optimizes dispatch for high concurrency and low latency, typically supporting hundreds of thousands of new connections per second"
> 
> *Source: [LiveKit Agents - Agent Dispatch](https://docs.livekit.io/agents/worker/agent-dispatch/)*

**Processing Capabilities:**
- Real-time speech recognition and transcription
- Audio analysis for pronunciation assessment
- Video processing for visual learning cues
- Multi-participant conversation management

## Error Handling and Recovery Strategies

### Connection Management

LiveKit provides built-in reconnection capabilities, but agents should implement proper error handling:

> "If a session instance crashes, it doesn't affect other agents running on the same worker"
> 
> *Source: [LiveKit Agents - Worker Lifecycle](https://docs.livekit.io/agents/worker/)*

**Recommended Error Handling:**

1. **Connection Timeouts**: 
   - Set reasonable timeouts for `ctx.wait_for_participant()` (recommended: 30-60 seconds)
   - Gracefully handle cases where users never join the room
   - Log timeout events for monitoring and debugging

2. **Token Expiration**: 
   - Monitor JWT expiration timestamps before making API calls
   - Implement automatic token refresh 5 minutes before expiry
   - Cache valid tokens to avoid unnecessary refresh requests

3. **Network Disconnections**: 
   - Listen for LiveKit disconnection events
   - Implement reconnection logic with exponential backoff
   - Re-validate user presence and token validity after reconnection

4. **API Failures**: 
   - Implement retry logic with exponential backoff (max 3 retries)
   - Handle rate limiting with appropriate delays
   - Log API errors with context for debugging
   - Gracefully degrade functionality when API is unavailable

5. **Participant Management**:
   - Handle cases where multiple users join the same room
   - Manage agent behavior when the target user leaves mid-session
   - Clean up resources when sessions end unexpectedly

### Token Management Best Practices

**Token Lifecycle Management:**
1. **Validation**: Check token expiration before API calls
2. **Refresh Strategy**: Refresh tokens 5 minutes before expiry
3. **Fallback Handling**: Graceful degradation when token refresh fails
4. **Security**: Never log or persist JWT tokens

## Development Requirements

### Required Dependencies

For Python agent development, the following packages are required:

```
livekit-agents>=0.8.0
livekit-api>=0.5.0
httpx>=0.25.0
cryptography>=41.0.0
python-dotenv>=1.0.0
```

### Environment Configuration

Essential environment variables for agent operation:

- **`AGENT_JWT_TOKEN`** - Service JWT for agent authentication (obtain from Loqua admin)
- **`AGENT_ID`** - Unique identifier for the agent instance (e.g., "loqua-spanish-tutor")
- **`API_BASE_URL`** - Base URL for the Loqua API (e.g., "https://api.loqua.app")
- **`SHARED_SECRET`** - Encryption secret for token decryption (shared with API team)
- **`LIVEKIT_URL`** - LiveKit server WebSocket URL (e.g., "wss://livekit.loqua.app")
- **`LIVEKIT_API_KEY`** - LiveKit API key for server operations
- **`LIVEKIT_API_SECRET`** - LiveKit API secret for authentication

### Agent Deployment Considerations

**Worker Configuration:**
- **Agent Name**: Use descriptive names for explicit dispatch (e.g., "spanish-conversation-tutor")
- **Resource Limits**: Set appropriate CPU and memory limits based on processing requirements
- **Concurrency**: Configure max concurrent jobs per worker based on hardware capacity
- **Auto-restart**: Enable automatic restart on crashes for production reliability

**Monitoring and Logging:**
- **Health Checks**: Implement regular health check calls to monitor agent connectivity
- **Performance Metrics**: Track session duration, API response times, and error rates
- **Log Aggregation**: Centralize logs for debugging and monitoring across multiple agent instances
- **Alert Thresholds**: Set up alerts for high error rates or connection failures

**Security Configuration:**
- **Secret Management**: Use secure secret management systems (not plain environment files)
- **Network Security**: Ensure agents run in secure network environments with proper firewall rules
- **Token Rotation**: Implement regular rotation of agent JWT tokens
- **Access Control**: Limit agent permissions to minimum required for operation

## API Endpoints Reference

### 1. Get Encrypted User JWT Token

**Endpoint:** `POST /api/v1/agent/user-token`  
**Authentication:** Agent JWT Required  
**Purpose:** Request encrypted user JWT for API operations on behalf of user

**Request Headers:**
```
Authorization: Bearer {agent_jwt}
X-Agent-ID: {agent_identifier}
Content-Type: application/json
```

**Request Body:**
```json
{
  "room_name": "string",     // LiveKit room name
  "user_id": "string",       // User ID from participant metadata
  "agent_id": "string"       // Agent identifier for audit logging
}
```

**Success Response (200):**
```json
{
  "encrypted_token": "string",    // AES-256-CBC encrypted user JWT
  "user_id": "string",            // User ID this token belongs to
  "room_name": "string",          // Room name this token is valid for
  "expires_in": 3600,             // Token expiry in seconds
  "issued_at": "2025-01-15T10:30:00Z",  // ISO timestamp
  "issued_to": "string"           // Agent ID this token was issued to
}
```

**Error Responses:**
- `400` - Missing required fields or invalid parameters
- `401` - Invalid agent token
- `404` - User not found in database
- `500` - Server error or configuration issue

---

### 2. Update User Progress

**Endpoint:** `POST /api/v1/agent/progress`  
**Authentication:** User JWT Required  
**Purpose:** Update user progress during active learning session

**Request Headers:**
```
Authorization: Bearer {user_jwt}
X-Agent-ID: {agent_identifier}
Content-Type: application/json
```

**Request Body:**
```json
{
  "userId": "string",           // User ID from LiveKit metadata
  "sessionId": "string",        // Optional session ID
  "data": {
    "status": "in_progress",    // Enum: "in_progress", "completed", "failed"
    "progress": {
      "words_learned": 5,       // Number of new words learned
      "phrases_practiced": 12,  // Number of phrases practiced
      "pronunciation_score": 85, // Pronunciation score (0-100)
      "grammar_points": ["present_tense", "articles"]  // Grammar topics covered
    }
  }
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Progress updated successfully",
  "userId": "string",
  "sessionId": "string",
  "agentId": "string",
  "timestamp": "2025-01-15T10:30:00Z"
}
```

---

### 3. Create Learning Session

**Endpoint:** `POST /api/v1/agent/sessions`  
**Authentication:** User JWT Required  
**Purpose:** Create learning session record on behalf of user

**Request Headers:**
```
Authorization: Bearer {user_jwt}
X-Agent-ID: {agent_identifier}
Content-Type: application/json
```

**Request Body:**
```json
{
  "userId": "string",                    // User ID from LiveKit metadata
  "sessionId": "string",                 // Optional custom session ID
  "duration_minutes": 30,                // Session duration
  "topics_covered": ["greetings", "travel"],  // Topics discussed
  "new_vocabulary": [                    // New words learned
    {"word": "hello", "translation": "hola", "language": "es"}
  ],
  "grammar_points": ["present_tense"],   // Grammar concepts covered
  "pronunciation_practice_count": 15,    // Number of pronunciation exercises
  "overall_performance": "good",         // Enum: "excellent", "good", "fair", "needs_improvement"
  "achievements": ["first_conversation"], // Achievements unlocked
  "next_session_recommendations": [      // Suggestions for next session
    "Focus on past tense verbs",
    "Practice restaurant vocabulary"
  ]
}
```

**Success Response (200):**
```json
{
  "success": true,
  "session_id": "string",
  "created_at": "2025-01-15T10:30:00Z",
  "created_by": "agent",
  "agent_id": "string"
}
```

---

### 4. Get User Context

**Endpoint:** `GET /api/v1/agent/user/{user_id}/context`  
**Authentication:** User JWT Required  
**Purpose:** Retrieve user learning context and preferences for personalization

**Request Headers:**
```
Authorization: Bearer {user_jwt}
X-Agent-ID: {agent_identifier}
```

**URL Parameters:**
- `user_id` (string): The user ID to retrieve context for

**Success Response (200):**
```json
{
  "user_id": "string",
  "preferences": {
    "language_learning": "spanish",      // Target language
    "native_language": "english",       // User's native language
    "learning_pace": "moderate",         // Enum: "slow", "moderate", "fast"
    "focus_areas": ["pronunciation", "vocabulary"],  // Areas of focus
    "session_length_preference": 30     // Preferred session length in minutes
  },
  "progress": {
    "total_sessions": 25,
    "total_conversation_time": 750,      // Minutes
    "words_learned": 150,
    "phrases_practiced": 89,
    "pronunciation_score_avg": 82,
    "grammar_points_covered": ["present_tense", "articles"],
    "achievements_unlocked": ["first_week", "vocabulary_master"],
    "last_session_date": "2025-01-14T15:30:00Z",
    "current_streak": 5                  // Days
  },
  "session_history": [                   // Recent session summaries
    {
      "session_id": "string",
      "date": "2025-01-14T15:30:00Z",
      "duration_minutes": 30,
      "topics_covered": ["greetings"]
    }
  ],
  "created_at": "2025-01-01T10:00:00Z",
  "updated_at": "2025-01-14T15:30:00Z",
  "accessed_by": {
    "agent_id": "string",
    "timestamp": "2025-01-15T10:30:00Z"
  }
}
```

---

### 5. Agent Health Check

**Endpoint:** `POST /api/v1/agent/health`  
**Authentication:** User JWT Required  
**Purpose:** Verify agent service status and connectivity

**Request Headers:**
```
Authorization: Bearer {user_jwt}
X-Agent-ID: {agent_identifier}
Content-Type: application/json
```

**Request Body:**
```json
{
  "userId": "string"  // User ID for context validation
}
```

**Success Response (200):**
```json
{
  "status": "healthy",
  "agent_id": "string",
  "permissions": ["user.progress", "session.create", "user.context"],
  "timestamp": "2025-01-15T10:30:00Z"
}
```

**Error Response (400):**
```json
{
  "error": {
    "code": "MISSING_USER_ID",
    "message": "userId is required for agent context validation"
  },
  "timestamp": "2025-01-15T10:30:00Z"
}
```

## Security and Performance Considerations

### Security Best Practices

1. **Token Security**: Never log or persist JWT tokens in plain text
2. **Transport Security**: Always use HTTPS/WSS for all communications
3. **Secret Management**: Use secure environment variable storage
4. **Input Validation**: Validate all user inputs and API responses
5. **Rate Limiting**: Implement proper request throttling to avoid API abuse

### Performance Optimization

LiveKit's architecture is designed for scale:

> "LiveKit optimizes dispatch for high concurrency and low latency, typically supporting hundreds of thousands of new connections per second with a max dispatch time under 150 ms"
> 
> *Source: [LiveKit Agents - Agent Dispatch](https://docs.livekit.io/agents/worker/agent-dispatch/)*

**Optimization Strategies:**
- **Connection Pooling**: Reuse HTTP connections for API calls
- **Batched Updates**: Group multiple progress updates when possible
- **Async Processing**: Use asynchronous patterns for all I/O operations
- **Resource Management**: Properly cleanup resources on session end

## Summary

This guide provides the foundation for implementing LiveKit agents that integrate seamlessly with the Loqua API system. The key principles are:

1. **Race Condition Prevention**: Always wait for participant presence before accessing metadata
2. **Secure Authentication**: Use the user token passthrough pattern for proper permissions
3. **Robust Error Handling**: Implement comprehensive error recovery strategies
4. **Performance Awareness**: Follow LiveKit best practices for scalable agent development

By following these patterns and leveraging LiveKit's robust architecture, agents can provide reliable, secure, and performant language learning experiences within the Loqua ecosystem.

## Troubleshooting Common Issues

### 1. "User ID not found in participant metadata"

**Cause**: Race condition where agent accesses participant attributes before user has fully joined  
**Solution**: Always use `ctx.wait_for_participant()` before accessing attributes  
**Prevention**: Implement proper timeout handling (30-60 seconds)

### 2. "Token decryption failed"

**Possible Causes**:
- Incorrect shared secret configuration
- Malformed encrypted token format
- IV/data parsing errors

**Debugging Steps**:
1. Verify `SHARED_SECRET` matches between agent and API
2. Check encrypted token format contains exactly one `:` separator
3. Validate IV and encrypted data are valid hexadecimal strings
4. Ensure cryptography library is properly installed

### 3. "Agent authentication failed"

**Possible Causes**:
- Expired or invalid agent JWT token
- Missing or incorrect `X-Agent-ID` header
- Network connectivity issues

**Solutions**:
1. Verify agent JWT token is valid and not expired
2. Ensure `X-Agent-ID` header is included in all requests
3. Check network connectivity to API endpoints
4. Validate agent has required permissions

### 4. "Empty participant list in room"

**Cause**: Timing issue where agent joins before users  
**LiveKit Context**: Recent GitHub issues reported this behavior  
**Solution**: Use explicit participant waiting instead of checking `remote_participants`

```pseudocode
// ❌ Don't do this
participants = ctx.room.remote_participants.values()

// ✅ Do this instead  
participant = await ctx.wait_for_participant()
```

### 5. "API rate limiting errors"

**Prevention**:
- Implement exponential backoff for retries
- Batch progress updates when possible
- Cache user context data to reduce API calls
- Monitor and respect rate limit headers

### 6. "Session data not persisting"

**Common Issues**:
- Missing required fields in session creation request
- Invalid enum values for performance ratings
- Malformed vocabulary or achievement arrays

**Validation Steps**:
1. Check all required fields are present and non-empty
2. Validate enum values match API specifications
3. Ensure arrays contain properly formatted objects
4. Review API response for specific error details

### Debug Logging Best Practices

**Essential Log Points**:
1. Agent startup and room connection
2. User participant detection and metadata extraction
3. Token exchange requests and responses (without logging actual tokens)
4. API calls with response status codes
5. Session lifecycle events (start, progress, completion)
6. Error conditions with full context

**Log Format Recommendations**:
```
[TIMESTAMP] [LEVEL] [AGENT_ID] [SESSION_ID] [USER_ID] Message
```

This structured logging enables effective debugging and monitoring across distributed agent deployments.

## Implementation Considerations & Solutions

### Security Architecture Decisions

#### 1. Shared Secret Management Strategy

**Current Approach**: Single shared secret for token encryption  
**Enhanced Security Options**:

1. **Environment-Specific Secrets** (Recommended)
   - Development: `DEV_AGENT_SECRET`
   - Staging: `STAGING_AGENT_SECRET` 
   - Production: `PROD_AGENT_SECRET`
   - Benefit: Environment isolation and easier secret rotation

2. **Key Vault Integration** (Enterprise)
   - Use AWS Secrets Manager, Azure Key Vault, or HashiCorp Vault
   - Automatic secret rotation capabilities
   - Audit logging for secret access
   - Fine-grained access control

3. **Ephemeral Key Exchange** (Advanced)
   - Agent requests temporary encryption key during authentication
   - Keys expire after session completion
   - Eliminates long-lived shared secrets

**Recommended Implementation**:
```
Phase 1: Environment-specific secrets with manual rotation
Phase 2: Key vault integration for automated rotation
Phase 3: Consider ephemeral keys for maximum security
```

#### 2. Token Lifecycle Management

**Enhanced Token Strategy**:

1. **Proactive Refresh Pattern**
   - Monitor token expiry: `exp - current_time < 300` (5 minutes)
   - Background refresh to avoid session interruption
   - Fallback to synchronous refresh if background fails

2. **Token Validation Pipeline**
   ```pseudocode
   before_api_call():
     if token_expires_soon():
       refresh_token()
     if token_invalid():
       re_authenticate()
     proceed_with_request()
   ```

3. **Circuit Breaker Integration**
   - Track token refresh failure rates
   - Implement exponential backoff for failed refreshes
   - Graceful degradation when token service is unavailable

#### 3. Error Recovery & Resilience

**Multi-Layer Resilience Strategy**:

1. **Circuit Breaker Pattern**
   ```
   API Call States:
   - Closed: Normal operation
   - Open: Fast-fail during outages
   - Half-Open: Testing service recovery
   ```

2. **Graceful Degradation Modes**
   - **Mock Mode**: Continue conversation without API calls
   - **Cache Mode**: Use last known user context
   - **Basic Mode**: Provide basic responses without personalization

3. **Health Check Hierarchy**
   ```
   Level 1: Agent internal health
   Level 2: LiveKit connectivity
   Level 3: API endpoint availability
   Level 4: Database connectivity
   ```

### Deployment Architecture Recommendations

#### 1. Agent Dispatch Strategy

**Recommended Approach: Hybrid Dispatch**

- **Automatic Dispatch** for general conversation agents
- **Explicit Dispatch** for specialized tutors (pronunciation, grammar, etc.)

**Deployment Configuration**:
```yaml
# General conversation agent
worker_type: "automatic"
agent_name: null  # Enables automatic dispatch
max_concurrent_jobs: 5

# Specialized pronunciation tutor
worker_type: "explicit" 
agent_name: "pronunciation-specialist"
max_concurrent_jobs: 2
```

**Benefits**:
- Automatic: Ensures every room gets an agent
- Explicit: Allows targeted expertise for specific learning goals

#### 2. Scaling and Concurrency

**Resource Allocation Strategy**:

| Agent Type | CPU Cores | Memory | Concurrent Sessions | Use Case |
|------------|-----------|---------|-------------------|----------|
| Basic Conversation | 2 | 4GB | 8-10 | General practice |
| AI Processing | 4 | 8GB | 3-5 | Speech recognition |
| Specialized Tutor | 2 | 4GB | 2-3 | Focused learning |

**Container Orchestration (Recommended)**:
```dockerfile
# Kubernetes deployment example
resources:
  requests:
    cpu: "1000m"
    memory: "2Gi" 
  limits:
    cpu: "2000m"
    memory: "4Gi"
```

#### 3. High Availability Setup

**Multi-Region Deployment**:
- Primary region: Main agent cluster
- Secondary region: Failover cluster
- Cross-region health monitoring
- Automatic failover for region outages

### Database Integration Strategy

#### 1. Supabase Access Patterns

**Direct Database Access** (Current Implementation):
- Agents use user JWT for database operations
- Inherits user's RLS (Row Level Security) policies
- Clean audit trail (operations appear as user actions)

**Service-Level Access** (Alternative):
```sql
-- Create agent service role
CREATE ROLE agent_service;
GRANT SELECT, INSERT, UPDATE ON learning_sessions TO agent_service;
GRANT SELECT, UPDATE ON user_contexts TO agent_service;
```

**Hybrid Approach** (Recommended):
- User JWT for user-specific data (contexts, preferences)
- Service JWT for system operations (session creation, analytics)

#### 2. Rate Limiting Strategy

**Supabase Rate Limit Handling**:

1. **Connection Pooling**
   ```python
   # Use connection pooling for database efficiency
   max_connections = 20
   connection_pool_size = 5
   ```

2. **Request Batching**
   - Batch progress updates every 30 seconds
   - Combine multiple vocabulary additions
   - Queue session data for bulk insert

3. **Caching Strategy**
   ```
   User Context: Cache for 5 minutes
   User Preferences: Cache for 1 hour  
   Learning History: Cache for 10 minutes
   ```

#### 3. API Versioning Strategy

**Recommended Versioning Approach**:

```
Current: /api/v1/agent/*
Future: /api/v2/agent/*

Version Support:
- v1: Maintained for 12 months after v2 release
- v2: New features and improvements
- Deprecation: 6-month notice period
```

**Backward Compatibility**:
- Maintain v1 endpoints during transition
- Add version negotiation headers
- Gradual migration path for agents

### Monitoring & Observability

#### 1. Metrics Collection

**Key Performance Indicators**:
```
Business Metrics:
- Session completion rate
- User engagement duration
- Learning objective achievement

Technical Metrics:
- Token refresh success rate
- API response times
- Agent-to-user latency
- Error rates by category

Resource Metrics:
- CPU/Memory utilization
- Concurrent session count
- Database connection usage
```

#### 2. Alerting Strategy

**Alert Thresholds**:
```yaml
Critical:
  - Agent authentication failure > 5%
  - Token refresh failure > 10%
  - Session completion rate < 80%

Warning:  
  - API response time > 2 seconds
  - Database connection usage > 80%
  - Memory usage > 85%
```

#### 3. Distributed Tracing

**Trace Implementation**:
```
Trace Context:
- session_id: Links all operations in a learning session
- user_id: Associates with user journey
- agent_id: Identifies responsible agent instance

Span Coverage:
- LiveKit room connection
- User token exchange
- API operations
- Database queries
```

### Implementation Roadmap

#### Phase 1: Foundation (Week 1-2)
- Implement basic agent with user token passthrough
- Environment-specific secret management
- Basic error handling and logging

#### Phase 2: Resilience (Week 3-4)  
- Add circuit breaker pattern
- Implement token refresh automation
- Deploy health monitoring

#### Phase 3: Scale (Week 5-8)
- Container orchestration setup
- Multi-region deployment
- Advanced monitoring and alerting

#### Phase 4: Optimization (Week 9-12)
- Performance tuning based on metrics
- Key vault integration
- Advanced caching strategies

This phased approach ensures a robust, scalable agent system that can handle production workloads while maintaining security and reliability standards.