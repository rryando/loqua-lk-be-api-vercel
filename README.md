# Japanese Language Tutor API

A comprehensive Hono-based API server for the Japanese Language Tutor Agent with provider-agnostic authentication, comprehensive documentation, and robust lifecycle management.

## 🌟 Features

### Core Features
- **User Context Management**: Store and retrieve user preferences, progress, and session history
- **Session Tracking**: Create and manage learning sessions with automatic progress updates
- **LiveKit Integration**: Generate room tokens for real-time voice/video sessions
- **Progress Analytics**: Detailed progress tracking and achievement system
- **Provider-Agnostic Authentication**: Support for multiple authentication providers

### Authentication Providers
- **Supabase Auth** (default): Google OAuth, email/password, and more
- **JWT**: Custom JWT tokens with configurable secrets
- **Extensible**: Easy to add new providers via the `AuthProvider` interface

### API Documentation
- **Scalar API Reference**: Beautiful, interactive API documentation at `/scalar` ([powered by Scalar](https://hono.dev/examples/scalar))
- **OpenAPI 3.1**: Full OpenAPI specification at `/openapi.json`
- **Auto-generated**: Documentation automatically reflects all endpoints and schemas

### Application Lifecycle
- **Graceful Shutdown**: Proper cleanup on SIGTERM/SIGINT
- **Health Checks**: Comprehensive service health monitoring
- **Service Management**: Modular service registration and lifecycle management

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and pnpm
- Supabase CLI (for local development)
- Google OAuth credentials
- LiveKit account and credentials

### Installation

1. **Clone and install dependencies:**
   ```bash
   cd loqua-api
   pnpm install
   ```

2. **Set up environment variables:**
   ```bash
   cp env.example .env
   ```

   Fill in your environment variables:
   ```env
   # Supabase (local development)
   VITE_SUPABASE_URL=http://127.0.0.1:54321
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

   # LiveKit
   LIVEKIT_API_KEY=your_livekit_api_key
   LIVEKIT_API_SECRET=your_livekit_api_secret
   LIVEKIT_URL=wss://your-livekit-instance.com

   # Optional: JWT authentication
   JWT_SECRET=your_jwt_secret_for_custom_tokens

   # Google OAuth (set in Supabase dashboard)
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   ```

3. **Start Supabase locally:**
   ```bash
   supabase start
   ```

4. **Set up Google OAuth in Supabase:**
   - Go to Supabase Dashboard → Authentication → Providers
   - Enable Google provider and add your OAuth credentials
   - The configuration is already set in `supabase/config.toml`

5. **Start the development server:**
   ```bash
   pnpm dev
   ```

6. **Access the API documentation:**
   - **Scalar Documentation**: http://localhost:5173/scalar
   - **OpenAPI JSON**: http://localhost:5173/openapi.json
   - **Health Check**: http://localhost:5173/health

## 📚 API Documentation

### Interactive Documentation

Visit **http://localhost:5173/scalar** for beautiful, interactive API documentation powered by [Scalar](https://hono.dev/examples/scalar). This includes:

- **Complete API Reference**: All endpoints with request/response examples
- **Authentication Guide**: How to authenticate with different providers
- **Schema Documentation**: Full TypeScript-generated schemas
- **Try It Out**: Interactive API testing directly in the browser

### API Endpoints Overview

#### Authentication
```http
# All API endpoints require authentication
Authorization: Bearer <access_token>
```

#### User Context Management
```http
GET    /api/users/{user_id}/context     # Get user learning context
PUT    /api/users/{user_id}/context     # Update user context
GET    /api/users/{user_id}/progress    # Get progress analytics
```

#### Learning Sessions
```http
POST   /api/sessions                    # Create learning session
GET    /api/sessions                    # Get user sessions (paginated)
```

#### LiveKit Integration
```http
POST   /api/rooms/join                  # Generate room token
GET    /api/rooms/active                # Get active rooms
```

#### Health & Monitoring
```http
GET    /                               # API information
GET    /health                         # Service health check
```

## 🏗️ Architecture

### Provider-Agnostic Authentication

The authentication system is designed to support multiple providers:

```typescript
// Add a new authentication provider
const customProvider = new CustomAuthProvider(config);
authManager.registerProvider(customProvider);

// Fallback authentication tries all providers
const result = await authManager.verifyTokenWithFallback(token);
```

#### Built-in Providers:
- **SupabaseAuthProvider**: Integration with Supabase Auth
- **JWTAuthProvider**: Standard JWT token validation
- **Extensible**: Implement `AuthProvider` interface for custom providers

### Application Lifecycle

```typescript
// Services are managed through the lifecycle manager
const lifecycleManager = new LifecycleManager();
lifecycleManager.registerService(new DatabaseService(supabase));
lifecycleManager.registerService(new AuthService(authManager));

// Graceful startup and shutdown
await lifecycleManager.start();
```

### Database Schema

The API uses a PostgreSQL database with Row Level Security:

```sql
-- Core tables
users              -- User profiles and metadata
user_contexts      -- Learning preferences and progress  
learning_sessions  -- Individual session records
achievements       -- User achievement records
```

All tables include RLS policies ensuring users can only access their own data.

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_SUPABASE_URL` | Supabase project URL | ✅ |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key | ✅ |
| `LIVEKIT_API_KEY` | LiveKit API key | ✅ |
| `LIVEKIT_API_SECRET` | LiveKit API secret | ✅ |
| `LIVEKIT_URL` | LiveKit server URL | ✅ |
| `JWT_SECRET` | JWT secret for custom auth | ❌ |
| `NODE_ENV` | Environment (development/production) | ❌ |

### Authentication Setup

#### Google OAuth via Supabase
1. Create Google OAuth credentials in Google Cloud Console
2. Add credentials to Supabase Dashboard → Authentication → Providers → Google
3. The configuration in `supabase/config.toml` enables Google OAuth locally

#### Custom JWT Authentication
1. Set `JWT_SECRET` environment variable
2. The JWT provider will be automatically registered
3. Use standard JWT tokens with `sub` claim as user ID

## 🧪 Testing

### API Testing
```bash
# Test health endpoint
curl http://localhost:5173/health

# Test user context (requires auth token)
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:5173/api/users/YOUR_USER_ID/context

# Test room token generation
curl -X POST -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -d '{"user_id":"YOUR_USER_ID","room_name":"test-room"}' \
     http://localhost:5173/api/rooms/join
```

### Database Testing
```bash
# Reset database and apply schema
supabase db reset

# Check database status
curl http://localhost:5173/health | jq '.database'
```

## 🐛 Error Handling

All API responses follow a consistent error format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": "Additional context (optional)"
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Common Error Codes
| Code | Description | HTTP Status |
|------|-------------|-------------|
| `AUTH_REQUIRED` | Missing authorization header | 401 |
| `INVALID_TOKEN` | Invalid or expired token | 401 |
| `USER_NOT_FOUND` | User context not found | 404 |
| `INSUFFICIENT_PERMISSIONS` | User lacks permissions | 403 |
| `VALIDATION_ERROR` | Request validation failed | 400 |
| `DATABASE_ERROR` | Database operation failed | 500 |
| `SERVER_ERROR` | Internal server error | 500 |

## 🚀 Deployment

### Production Checklist

1. **Environment Setup**
   - Set up production Supabase project
   - Configure production LiveKit instance
   - Set up Google OAuth for production domain
   - Configure environment variables

2. **Security**
   - Enable RLS policies in production
   - Set up proper CORS origins
   - Configure rate limiting
   - Set up monitoring and alerting

3. **Database**
   - Run migrations in production
   - Set up database backups
   - Configure connection pooling

### Deployment Platforms

The API is compatible with:
- **Vercel**: Zero-config deployment
- **Railway**: Automatic deployments with databases
- **Fly.io**: Global edge deployment
- **Cloudflare Workers**: Serverless with Cloudflare integrations

## 🤝 Contributing

1. Follow TypeScript best practices
2. Add proper error handling and validation
3. Update OpenAPI schemas for new endpoints
4. Add comprehensive tests
5. Update documentation for any changes

## 📖 Related Documentation

- [Hono Framework](https://hono.dev/)
- [Scalar API Documentation](https://hono.dev/examples/scalar)
- [Supabase Authentication](https://supabase.com/docs/guides/auth)
- [LiveKit Server SDK](https://docs.livekit.io/realtime/server/overview/)

## 📄 License

MIT License - see LICENSE file for details.

---

**Ready for Production** ✨ This API includes everything needed for a robust Japanese language learning platform with comprehensive documentation, multi-provider authentication, and proper lifecycle management.