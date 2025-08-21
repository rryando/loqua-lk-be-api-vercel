# 🌸 Japanese Language Tutor API - Client Integration Guide

A comprehensive guide for integrating client applications with the Japanese Language Tutor API, covering the complete user journey from authentication to live conversation sessions.

## 📋 Table of Contents

- [Overview](#overview)
- [Authentication Flow](#authentication-flow)
- [User Context Management](#user-context-management)  
- [LiveKit Integration](#livekit-integration)
- [Session Management](#session-management)
- [Progress Tracking](#progress-tracking)
- [Error Handling](#error-handling)
- [Code Examples](#code-examples)
- [Security Best Practices](#security-best-practices)

---

## 🎯 Overview

The Japanese Language Tutor API provides a complete backend for language learning applications with:

- **User Authentication** - Supabase-based auth with JWT tokens
- **User Context** - Learning preferences and progress tracking  
- **LiveKit Integration** - Real-time voice conversations with AI agent
- **Session Management** - Learning session records and analytics
- **Progress Analytics** - Comprehensive learning progress insights

### Architecture

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│   Client    │───▶│  Hono API    │───▶│  Supabase   │
│    App      │    │   Server     │    │ Database    │
└─────────────┘    └──────────────┘    └─────────────┘
       │                   │
       │                   │
       ▼                   ▼
┌─────────────┐    ┌──────────────┐
│   LiveKit   │◀───│   Python     │
│   Rooms     │    │   AI Agent   │
└─────────────┘    └──────────────┘
```

---

## 🔐 Authentication Flow

### Step 1: User Registration/Login

The API supports Supabase authentication with Google OAuth, email/password, and other providers.

#### Web Client (JavaScript)

```javascript
import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client
const supabase = createClient(
  'YOUR_SUPABASE_URL',
  'YOUR_SUPABASE_ANON_KEY'
)

// Google OAuth Login
async function loginWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`
    }
  })
  
  if (error) {
    console.error('Login error:', error)
    return null
  }
  
  return data
}

// Email/Password Login
async function loginWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })
  
  if (error) {
    console.error('Login error:', error)
    return null
  }
  
  return data
}

// Listen for auth state changes
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN') {
    console.log('User signed in:', session.user)
    // Initialize user context
    await initializeUserContext(session.access_token)
  } else if (event === 'SIGNED_OUT') {
    console.log('User signed out')
    // Clear local state
  }
})
```

#### React Native Client

```typescript
import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'

const supabase = createClient(
  'YOUR_SUPABASE_URL', 
  'YOUR_SUPABASE_ANON_KEY',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
)

// Google OAuth (with deep linking)
async function loginWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: 'yourapp://auth/callback'
    }
  })
  
  return { data, error }
}
```

### Step 2: Get Authentication Token

After successful authentication, extract the access token for API calls:

```javascript
// Get current session
const { data: { session } } = await supabase.auth.getSession()

if (session) {
  const accessToken = session.access_token
  const user = session.user
  
  // Store token for API calls
  localStorage.setItem('access_token', accessToken)
  
  // Set up API client
  setupAPIClient(accessToken)
}
```

---

## 👤 User Context Management

### Step 3: Initialize User Profile

After authentication, create or retrieve the user's learning context:

```javascript
const API_BASE_URL = 'http://localhost:5175' // Your API URL

class LanguageAPI {
  constructor(accessToken) {
    this.accessToken = accessToken
    this.baseURL = API_BASE_URL
  }

  // Helper for authenticated requests
  async request(endpoint, options = {}) {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error?.message || 'API request failed')
    }

    return response.json()
  }

  // Get user learning context
  async getUserContext(userId) {
    return this.request(`/api/users/${userId}/context`)
  }

  // Update user preferences
  async updateUserContext(userId, updates) {
    return this.request(`/api/users/${userId}/context`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    })
  }

  // Get user progress analytics
  async getUserProgress(userId) {
    return this.request(`/api/users/${userId}/progress`)
  }
}

// Initialize user context
async function initializeUserContext(accessToken) {
  const api = new LanguageAPI(accessToken)
  const { data: { user } } = await supabase.auth.getUser()
  
  try {
    // Try to get existing context
    const context = await api.getUserContext(user.id)
    console.log('User context loaded:', context)
    return context
  } catch (error) {
    if (error.message.includes('not found')) {
      // Create initial context for new user
      const initialContext = {
        preferences: {
          learning_level: 'absolute_beginner',
          learning_goals: ['general'],
          preferred_topics: ['greetings', 'food', 'travel'],
          practice_frequency: 'daily',
          session_duration_preference: 25,
          wants_formal_speech: false,
          wants_kanji_practice: true,
          wants_grammar_focus: true
        }
      }
      
      return api.updateUserContext(user.id, initialContext)
    }
    throw error
  }
}
```

### User Preferences Example

```javascript
// Update learning preferences
async function updateLearningPreferences(preferences) {
  const api = new LanguageAPI(localStorage.getItem('access_token'))
  const { data: { user } } = await supabase.auth.getUser()
  
  const updates = {
    preferences: {
      learning_level: preferences.level,           // 'beginner', 'intermediate', etc.
      learning_goals: preferences.goals,           // ['conversation', 'travel', 'business']
      preferred_topics: preferences.topics,        // ['food', 'culture', 'anime']
      practice_frequency: preferences.frequency,   // 'daily', 'weekly'
      session_duration_preference: preferences.duration, // 15, 25, 45 minutes
      wants_formal_speech: preferences.formal,     // true/false
      wants_kanji_practice: preferences.kanji,     // true/false
      wants_grammar_focus: preferences.grammar     // true/false
    }
  }
  
  return api.updateUserContext(user.id, updates)
}

// Example usage
await updateLearningPreferences({
  level: 'intermediate',
  goals: ['conversation', 'travel'],
  topics: ['food', 'culture', 'daily_life'],
  frequency: 'daily',
  duration: 25,
  formal: false,
  kanji: true,
  grammar: true
})
```

---

## 🎙️ LiveKit Integration

### Step 4: Join Voice Conversation Room

To start a live conversation with the Japanese tutor AI agent:

```javascript
// Add to your LanguageAPI class
class LanguageAPI {
  // ... previous methods ...

  // Get LiveKit room token
  async joinRoom(roomName) {
    const { data: { user } } = await supabase.auth.getUser()
    
    return this.request('/api/rooms/join', {
      method: 'POST',
      body: JSON.stringify({
        user_id: user.id,
        room_name: roomName
      })
    })
  }

  // Get active rooms
  async getActiveRooms() {
    return this.request('/api/rooms/active')
  }
}

// LiveKit client setup
import { Room, connect, RoomEvent, RemoteTrack } from 'livekit-client'

class VoiceSession {
  constructor(api) {
    this.api = api
    this.room = null
    this.isConnected = false
  }

  async startSession(roomName = 'japanese-tutor-room') {
    try {
      // Get room access token
      const roomData = await this.api.joinRoom(roomName)
      
      // Connect to LiveKit room
      this.room = new Room({
        adaptiveStream: true,
        dynacast: true
      })

      // Set up event listeners
      this.setupEventListeners()

      // Connect to room
      await this.room.connect(roomData.room_url, roomData.token)
      
      this.isConnected = true
      console.log('Connected to voice session:', roomData.session_id)
      
      // Enable microphone
      await this.enableMicrophone()
      
      return roomData.session_id
    } catch (error) {
      console.error('Failed to start voice session:', error)
      throw error
    }
  }

  setupEventListeners() {
    // When agent joins the room
    this.room.on(RoomEvent.ParticipantConnected, (participant) => {
      console.log('Participant joined:', participant.identity)
      if (participant.identity.includes('agent')) {
        console.log('AI agent joined the conversation!')
      }
    })

    // Audio track received (agent speaking)
    this.room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind === 'audio' && participant.identity.includes('agent')) {
        const audioElement = track.attach()
        document.body.appendChild(audioElement)
        audioElement.play()
      }
    })

    // Connection quality monitoring
    this.room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
      console.log('Connection quality:', quality, participant?.identity)
    })

    // Handle disconnection
    this.room.on(RoomEvent.Disconnected, (reason) => {
      console.log('Disconnected from room:', reason)
      this.isConnected = false
    })
  }

  async enableMicrophone() {
    try {
      // Request microphone permissions
      await this.room.localParticipant.enableCameraAndMicrophone(false, true)
      console.log('Microphone enabled')
    } catch (error) {
      console.error('Failed to enable microphone:', error)
    }
  }

  async endSession() {
    if (this.room && this.isConnected) {
      this.room.disconnect()
      this.isConnected = false
      console.log('Voice session ended')
    }
  }
}

// Usage example
async function startLearningSession() {
  const api = new LanguageAPI(localStorage.getItem('access_token'))
  const voiceSession = new VoiceSession(api)
  
  try {
    const sessionId = await voiceSession.startSession()
    
    // The AI agent will now:
    // 1. Join the room automatically
    // 2. Access user's learning context
    // 3. Start personalized conversation
    
    return { voiceSession, sessionId }
  } catch (error) {
    console.error('Failed to start learning session:', error)
  }
}
```

### LiveKit Events and UI Integration

```javascript
// React component example
function VoiceSessionComponent() {
  const [isConnected, setIsConnected] = useState(false)
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false)
  const [sessionData, setSessionData] = useState(null)
  
  const startSession = async () => {
    const { voiceSession, sessionId } = await startLearningSession()
    
    // Track session data for UI updates
    setSessionData({ voiceSession, sessionId })
    setIsConnected(true)
    
    // Listen for agent audio activity
    voiceSession.room.on(RoomEvent.AudioPlaybackChanged, (speaking, participant) => {
      if (participant.identity.includes('agent')) {
        setIsAgentSpeaking(speaking)
      }
    })
  }

  const endSession = async () => {
    if (sessionData?.voiceSession) {
      await sessionData.voiceSession.endSession()
      setIsConnected(false)
      setIsAgentSpeaking(false)
      setSessionData(null)
    }
  }

  return (
    <div className="voice-session">
      {!isConnected ? (
        <button onClick={startSession} className="start-session-btn">
          🎙️ Start Japanese Lesson
        </button>
      ) : (
        <div className="active-session">
          <div className={`agent-status ${isAgentSpeaking ? 'speaking' : ''}`}>
            🤖 Sensei {isAgentSpeaking ? 'is speaking...' : 'is listening'}
          </div>
          <button onClick={endSession} className="end-session-btn">
            End Lesson
          </button>
        </div>
      )}
    </div>
  )
}
```

---

## 📚 Session Management

### Step 5: Learning Session Lifecycle

Sessions are automatically created by the AI agent, but you can also create them manually:

```javascript
// Add to LanguageAPI class
class LanguageAPI {
  // ... previous methods ...

  // Create learning session (usually called by agent)
  async createSession(sessionData) {
    return this.request('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(sessionData)
    })
  }

  // Get user's learning sessions
  async getUserSessions(limit = 20, offset = 0) {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString()
    })
    
    return this.request(`/api/sessions?${params}`)
  }
}

// Session tracking
class SessionTracker {
  constructor(api, sessionId) {
    this.api = api
    this.sessionId = sessionId
    this.startTime = Date.now()
    this.vocabularyLearned = []
    this.topicsCovered = []
    this.grammarPoints = []
  }

  // Track vocabulary during session
  addVocabulary(word, reading, meaning) {
    this.vocabularyLearned.push({
      word,
      reading,
      meaning,
      timestamp: Date.now()
    })
  }

  // Track topics covered
  addTopic(topic) {
    if (!this.topicsCovered.includes(topic)) {
      this.topicsCovered.push(topic)
    }
  }

  // Track grammar points
  addGrammarPoint(point) {
    if (!this.grammarPoints.includes(point)) {
      this.grammarPoints.push(point)
    }
  }

  // End session and save data
  async endSession(performance = 'good') {
    const duration = Math.round((Date.now() - this.startTime) / 1000 / 60) // minutes
    const { data: { user } } = await supabase.auth.getUser()

    const sessionData = {
      user_id: user.id,
      session_id: this.sessionId,
      duration_minutes: duration,
      topics_covered: this.topicsCovered,
      new_vocabulary: this.vocabularyLearned.map(v => v.word),
      grammar_points: this.grammarPoints,
      pronunciation_practice_count: this.vocabularyLearned.length,
      overall_performance: performance,
      achievements: this.calculateAchievements()
    }

    return this.api.createSession(sessionData)
  }

  calculateAchievements() {
    const achievements = []
    
    if (this.vocabularyLearned.length >= 5) {
      achievements.push('vocabulary_explorer')
    }
    
    if (this.topicsCovered.length >= 3) {
      achievements.push('topic_master')
    }
    
    const duration = (Date.now() - this.startTime) / 1000 / 60
    if (duration >= 20) {
      achievements.push('persistent_learner')
    }
    
    return achievements
  }
}

// Usage during voice session
async function startTrackedSession() {
  const api = new LanguageAPI(localStorage.getItem('access_token'))
  const { voiceSession, sessionId } = await startLearningSession()
  const tracker = new SessionTracker(api, sessionId)
  
  // Example: Track vocabulary when agent teaches new words
  // This would typically be triggered by agent feedback or user actions
  tracker.addVocabulary('こんにちは', 'konnichiwa', 'hello')
  tracker.addTopic('greetings')
  tracker.addGrammarPoint('は particle')
  
  // End session after conversation
  setTimeout(async () => {
    await voiceSession.endSession()
    const sessionResult = await tracker.endSession('excellent')
    console.log('Session completed:', sessionResult)
  }, 25 * 60 * 1000) // 25 minutes
  
  return { voiceSession, tracker }
}
```

---

## 📈 Progress Tracking

### Step 6: Monitor Learning Progress

```javascript
// Progress analytics
class ProgressTracker {
  constructor(api) {
    this.api = api
  }

  async getProgressAnalytics() {
    const { data: { user } } = await supabase.auth.getUser()
    return this.api.getUserProgress(user.id)
  }

  async getRecentSessions(limit = 10) {
    return this.api.getUserSessions(limit, 0)
  }

  // Calculate learning streaks
  calculateStreak(sessions) {
    if (!sessions.length) return 0
    
    let streak = 0
    const today = new Date()
    const oneDayMs = 24 * 60 * 60 * 1000
    
    for (let i = 0; i < sessions.length; i++) {
      const sessionDate = new Date(sessions[i].created_at)
      const daysDiff = Math.floor((today - sessionDate) / oneDayMs)
      
      if (daysDiff === streak) {
        streak++
      } else {
        break
      }
    }
    
    return streak
  }

  // Get learning insights
  async getLearningInsights() {
    const [analytics, sessions] = await Promise.all([
      this.getProgressAnalytics(),
      this.getRecentSessions(30)
    ])

    return {
      totalSessions: analytics.total_stats.sessions_completed,
      totalStudyTime: analytics.total_stats.total_study_time,
      vocabularyLearned: analytics.total_stats.vocabulary_learned,
      currentStreak: this.calculateStreak(sessions.sessions),
      recentActivity: analytics.recent_activity,
      achievements: analytics.achievements,
      nextMilestones: analytics.next_milestones,
      favoriteTopics: this.getFavoriteTopics(sessions.sessions),
      averageSessionLength: this.getAverageSessionLength(sessions.sessions)
    }
  }

  getFavoriteTopics(sessions) {
    const topicCounts = {}
    sessions.forEach(session => {
      session.topics_covered.forEach(topic => {
        topicCounts[topic] = (topicCounts[topic] || 0) + 1
      })
    })
    
    return Object.entries(topicCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([topic]) => topic)
  }

  getAverageSessionLength(sessions) {
    if (!sessions.length) return 0
    const total = sessions.reduce((sum, session) => sum + session.duration_minutes, 0)
    return Math.round(total / sessions.length)
  }
}

// React component for progress dashboard
function ProgressDashboard() {
  const [insights, setInsights] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadProgress = async () => {
      try {
        const api = new LanguageAPI(localStorage.getItem('access_token'))
        const tracker = new ProgressTracker(api)
        const data = await tracker.getLearningInsights()
        setInsights(data)
      } catch (error) {
        console.error('Failed to load progress:', error)
      } finally {
        setLoading(false)
      }
    }

    loadProgress()
  }, [])

  if (loading) return <div>Loading progress...</div>

  return (
    <div className="progress-dashboard">
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Total Sessions</h3>
          <div className="stat-value">{insights.totalSessions}</div>
        </div>
        
        <div className="stat-card">
          <h3>Study Time</h3>
          <div className="stat-value">{insights.totalStudyTime} min</div>
        </div>
        
        <div className="stat-card">
          <h3>Words Learned</h3>
          <div className="stat-value">{insights.vocabularyLearned}</div>
        </div>
        
        <div className="stat-card">
          <h3>Current Streak</h3>
          <div className="stat-value">{insights.currentStreak} days</div>
        </div>
      </div>

      <div className="achievements">
        <h3>🏆 Recent Achievements</h3>
        {insights.achievements.map(achievement => (
          <div key={achievement.id} className="achievement">
            <span className="achievement-icon">{achievement.icon}</span>
            <div>
              <h4>{achievement.title}</h4>
              <p>{achievement.description}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="favorite-topics">
        <h3>📚 Favorite Topics</h3>
        <div className="topic-list">
          {insights.favoriteTopics.map(topic => (
            <span key={topic} className="topic-tag">{topic}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
```

---

## ❌ Error Handling

### Step 7: Robust Error Management

```javascript
// API Error handling
class APIError extends Error {
  constructor(message, status, code, details) {
    super(message)
    this.name = 'APIError'
    this.status = status
    this.code = code
    this.details = details
  }
}

// Enhanced API client with error handling
class LanguageAPI {
  constructor(accessToken) {
    this.accessToken = accessToken
    this.baseURL = API_BASE_URL
    this.retryAttempts = 3
    this.retryDelay = 1000
  }

  async request(endpoint, options = {}) {
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const response = await fetch(`${this.baseURL}${endpoint}`, {
          ...options,
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
            ...options.headers,
          },
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new APIError(
            errorData.error?.message || 'API request failed',
            response.status,
            errorData.error?.code,
            errorData.error?.details
          )
        }

        return response.json()
      } catch (error) {
        if (attempt === this.retryAttempts) {
          throw error
        }

        // Retry on network errors or 5xx status codes
        if (error instanceof APIError && error.status < 500) {
          throw error // Don't retry client errors
        }

        console.warn(`Request attempt ${attempt} failed, retrying...`, error)
        await this.delay(this.retryDelay * attempt)
      }
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // Token refresh handling
  async refreshTokenIfNeeded() {
    const { data: { session }, error } = await supabase.auth.refreshSession()
    
    if (error) {
      throw new APIError('Failed to refresh authentication', 401, 'AUTH_REFRESH_FAILED')
    }
    
    this.accessToken = session.access_token
    return session.access_token
  }
}

// Error handling utilities
class ErrorHandler {
  static handleAPIError(error, context = '') {
    console.error(`API Error in ${context}:`, error)

    switch (error.code) {
      case 'UNAUTHORIZED':
      case 'TOKEN_EXPIRED':
        // Redirect to login
        window.location.href = '/login'
        break
        
      case 'INSUFFICIENT_PERMISSIONS':
        this.showError('You don\'t have permission to perform this action')
        break
        
      case 'USER_CONTEXT_NOT_FOUND':
        // Initialize user context
        this.initializeUserContext()
        break
        
      case 'LIVEKIT_ERROR':
        this.showError('Voice session error. Please try again.')
        break
        
      case 'NETWORK_ERROR':
        this.showError('Network connection error. Please check your internet.')
        break
        
      default:
        this.showError('An unexpected error occurred. Please try again.')
    }
  }

  static showError(message) {
    // Implement your UI error display
    console.error('User Error:', message)
    
    // Example with toast notification
    if (window.toast) {
      window.toast.error(message)
    } else {
      alert(message)
    }
  }

  static async initializeUserContext() {
    try {
      const api = new LanguageAPI(localStorage.getItem('access_token'))
      await initializeUserContext(api.accessToken)
    } catch (error) {
      this.handleAPIError(error, 'user context initialization')
    }
  }
}

// Usage with error handling
async function startLearningSessionSafely() {
  try {
    const { voiceSession, sessionId } = await startLearningSession()
    return { voiceSession, sessionId }
  } catch (error) {
    if (error instanceof APIError) {
      ErrorHandler.handleAPIError(error, 'starting learning session')
    } else {
      ErrorHandler.handleAPIError(
        new APIError('Unknown error occurred', 500, 'UNKNOWN_ERROR'),
        'starting learning session'
      )
    }
    return null
  }
}
```

---

## 🔐 Security Best Practices

### Authentication Security

```javascript
// Secure token management
class TokenManager {
  static getToken() {
    return localStorage.getItem('access_token')
  }

  static setToken(token) {
    localStorage.setItem('access_token', token)
  }

  static clearToken() {
    localStorage.removeItem('access_token')
  }

  // Check token expiration
  static isTokenExpired(token) {
    if (!token) return true
    
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      return payload.exp * 1000 < Date.now()
    } catch {
      return true
    }
  }

  // Auto-refresh token
  static async ensureValidToken() {
    const token = this.getToken()
    
    if (!token || this.isTokenExpired(token)) {
      const { data: { session }, error } = await supabase.auth.refreshSession()
      
      if (error || !session) {
        this.clearToken()
        throw new APIError('Authentication expired', 401, 'AUTH_EXPIRED')
      }
      
      this.setToken(session.access_token)
      return session.access_token
    }
    
    return token
  }
}

// Secure API wrapper
class SecureLanguageAPI extends LanguageAPI {
  async request(endpoint, options = {}) {
    // Ensure token is valid before making request
    const validToken = await TokenManager.ensureValidToken()
    this.accessToken = validToken
    
    return super.request(endpoint, options)
  }
}
```

### Data Validation

```javascript
// Input validation for user data
class DataValidator {
  static validateUserPreferences(preferences) {
    const validLevels = ['absolute_beginner', 'beginner', 'elementary', 'intermediate', 'upper_intermediate', 'advanced']
    const validGoals = ['conversation', 'travel', 'business', 'anime_manga', 'culture', 'jlpt_prep', 'general']
    
    if (!validLevels.includes(preferences.learning_level)) {
      throw new Error('Invalid learning level')
    }
    
    if (!Array.isArray(preferences.learning_goals) || 
        !preferences.learning_goals.every(goal => validGoals.includes(goal))) {
      throw new Error('Invalid learning goals')
    }
    
    if (preferences.session_duration_preference < 5 || preferences.session_duration_preference > 60) {
      throw new Error('Session duration must be between 5 and 60 minutes')
    }
    
    return true
  }

  static validateSessionData(sessionData) {
    if (!sessionData.user_id || typeof sessionData.user_id !== 'string') {
      throw new Error('Valid user ID is required')
    }
    
    if (!sessionData.duration_minutes || sessionData.duration_minutes < 1) {
      throw new Error('Valid session duration is required')
    }
    
    if (!Array.isArray(sessionData.topics_covered)) {
      throw new Error('Topics covered must be an array')
    }
    
    return true
  }
}
```

---

## 📱 Complete Example Application

Here's a complete example showing how to integrate all the features:

```javascript
// Main application class
class JapaneseTutorApp {
  constructor() {
    this.api = null
    this.voiceSession = null
    this.sessionTracker = null
    this.progressTracker = null
    this.isAuthenticated = false
    
    this.init()
  }

  async init() {
    // Initialize Supabase
    this.supabase = createClient(
      process.env.REACT_APP_SUPABASE_URL,
      process.env.REACT_APP_SUPABASE_ANON_KEY
    )

    // Listen for auth changes
    this.supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN') {
        await this.handleSignIn(session)
      } else if (event === 'SIGNED_OUT') {
        this.handleSignOut()
      }
    })

    // Check for existing session
    const { data: { session } } = await this.supabase.auth.getSession()
    if (session) {
      await this.handleSignIn(session)
    }
  }

  async handleSignIn(session) {
    try {
      this.isAuthenticated = true
      this.api = new SecureLanguageAPI(session.access_token)
      this.progressTracker = new ProgressTracker(this.api)
      
      // Initialize user context
      await initializeUserContext(session.access_token)
      
      console.log('User authenticated successfully')
      this.onAuthStateChange?.(true)
    } catch (error) {
      ErrorHandler.handleAPIError(error, 'authentication')
    }
  }

  handleSignOut() {
    this.isAuthenticated = false
    this.api = null
    this.progressTracker = null
    TokenManager.clearToken()
    
    if (this.voiceSession) {
      this.voiceSession.endSession()
    }
    
    console.log('User signed out')
    this.onAuthStateChange?.(false)
  }

  // Authentication methods
  async loginWithGoogle() {
    return this.supabase.auth.signInWithOAuth({
      provider: 'google'
    })
  }

  async loginWithEmail(email, password) {
    return this.supabase.auth.signInWithPassword({
      email, password
    })
  }

  async logout() {
    return this.supabase.auth.signOut()
  }

  // Learning session methods
  async startLearningSession() {
    if (!this.isAuthenticated) {
      throw new Error('User must be authenticated')
    }

    try {
      this.voiceSession = new VoiceSession(this.api)
      const sessionId = await this.voiceSession.startSession()
      this.sessionTracker = new SessionTracker(this.api, sessionId)
      
      console.log('Learning session started:', sessionId)
      return sessionId
    } catch (error) {
      ErrorHandler.handleAPIError(error, 'starting learning session')
      throw error
    }
  }

  async endLearningSession(performance = 'good') {
    if (this.sessionTracker) {
      await this.sessionTracker.endSession(performance)
    }
    
    if (this.voiceSession) {
      await this.voiceSession.endSession()
    }
    
    this.sessionTracker = null
    this.voiceSession = null
    
    console.log('Learning session ended')
  }

  // Progress methods
  async getProgressInsights() {
    if (!this.progressTracker) {
      throw new Error('Progress tracker not available')
    }
    
    return this.progressTracker.getLearningInsights()
  }

  async updatePreferences(preferences) {
    if (!this.api) {
      throw new Error('API not available')
    }

    DataValidator.validateUserPreferences(preferences)
    
    const { data: { user } } = await this.supabase.auth.getUser()
    return this.api.updateUserContext(user.id, { preferences })
  }

  // Event handlers (set by UI components)
  onAuthStateChange = null
  onSessionStart = null
  onSessionEnd = null
  onProgressUpdate = null
}

// Usage in React app
function App() {
  const [app] = useState(() => new JapaneseTutorApp())
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isInSession, setIsInSession] = useState(false)

  useEffect(() => {
    app.onAuthStateChange = setIsAuthenticated
    app.onSessionStart = () => setIsInSession(true)
    app.onSessionEnd = () => setIsInSession(false)
  }, [app])

  if (!isAuthenticated) {
    return <LoginScreen app={app} />
  }

  return (
    <div className="app">
      <Header app={app} />
      {isInSession ? (
        <VoiceSessionScreen app={app} />
      ) : (
        <DashboardScreen app={app} />
      )}
    </div>
  )
}
```

---

## 🚀 Getting Started Checklist

1. **✅ Set up Supabase project** with Google OAuth
2. **✅ Install dependencies**: `@supabase/supabase-js`, `livekit-client`
3. **✅ Configure environment variables**:
   ```env
   REACT_APP_SUPABASE_URL=your_supabase_url
   REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
   REACT_APP_API_URL=http://localhost:5175
   ```
4. **✅ Implement authentication flow**
5. **✅ Set up user context management**
6. **✅ Integrate LiveKit for voice sessions**
7. **✅ Add progress tracking**
8. **✅ Implement error handling**
9. **✅ Test the complete flow**

## 📞 Support

For questions or issues:
- Check the API documentation at `/scalar`
- Review error codes in the API responses
- Ensure all environment variables are properly set
- Verify Supabase authentication is working

Happy coding! 🌸🇯🇵
