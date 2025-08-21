* **Frontend (Web)** → where the user speaks, records audio, and receives responses.
* **LiveKit + Python Agent SDK** → handles real-time media (voice) + AI processing.
* **Hono API server** → your backend for user data, business logic, and persistence.

And the confusion is:
👉 *How does the LiveKit agent securely call Hono API on behalf of the user?*

---

### 🔑 Core Principle

The LiveKit Agent itself doesn’t inherently “know” who the user is — it just processes audio streams.
So you need a way to **bridge authentication** between:

1. **User in frontend** (who already has an identity/session)
2. **LiveKit agent** (which is acting on their behalf)

---

### ✅ Typical Flow

Here’s one secure pattern you can follow:

1. **User Authenticates in FE**

   * Web FE talks to Hono API
   * Gets back a **JWT access token** (short-lived, signed by Hono).

2. **Frontend Starts LiveKit Session**

   * FE requests a **LiveKit connection token** from Hono API
   * When Hono issues this token, it **embeds the user’s identity / userId** inside it.
   * FE then uses that token to connect to LiveKit.

3. **LiveKit Agent Joins**

   * LiveKit agent (Python SDK) connects to the same room.
   * LiveKit delivers user identity (from the connection token) in metadata/events.

4. **Agent Calls Hono API**

   * When the agent needs to call Hono API

     * **Agent Service Account + Context**
       The agent uses its own service JWT (not user’s token) but passes the `userId` from LiveKit session metadata.
       Hono checks both:

       * Is the agent a trusted client?
       * Does the request specify a valid `userId` linked to the session?

---

### 🔒 Security Considerations

* **Short-lived tokens** only (e.g. 15 mins for access tokens).
* **Never share the user’s long-lived refresh token with the agent**.
* you must validate that the `userId` sent is actually present in the current LiveKit session (prevent spoofing).

---

### Example:

**1. User connects**
Hono issues LiveKit token with payload:

```json
{
  "identity": "user_123",
  "metadata": {
    "sessionId": "sess_456"
  }
}
```

**2. Agent joins session**
Agent sees `"user_123"` in LiveKit room metadata.

**3. Agent calls Hono API**
ex:
```http
POST /agent/progress
Authorization: Bearer <AGENT_SERVICE_JWT>
Content-Type: application/json

{
  "userId": "user_123",
  "sessionId": "sess_456",
  "data": { "status": "done" }
}
```

**4. Hono validates**

* `AGENT_SERVICE_JWT` → is valid agent account? ✅
* `userId + sessionId` → matches LiveKit’s current active session? ✅
* If both pass → accept.

---

