// User Context Types
export interface UserPreferences {
    learning_level: null | "absolute_beginner" | "beginner" | "elementary" | "intermediate" | "upper_intermediate" | "advanced";
    learning_goals: Array<null | "conversation" | "travel" | "business" | "anime_manga" | "culture" | "jlpt_prep" | "general">;
    preferred_topics: Array<null | string>;
    practice_frequency: null | string;
    session_duration_preference: number;
    wants_formal_speech: null | boolean;
    wants_kanji_practice: null | boolean;
    wants_grammar_focus: null | boolean;
}

export interface UserProgress {
    total_sessions: number;
    total_conversation_time: number;
    words_learned: number;
    phrases_practiced: number;
    pronunciation_score_avg: number;
    grammar_points_covered: string[];
    achievements_unlocked: string[];
    last_session_date: string;
    current_streak: number;
}

export interface SessionHistory {
    session_id: string;
    date: string;
    duration_minutes: number;
    topics_covered: string[];
}

export interface UserContextResponse {
    user_id: string;
    preferences: UserPreferences;
    progress: UserProgress;
    session_history: SessionHistory[];
    created_at: string;
    updated_at: string;
}

export interface UpdateContextResponse {
    success: boolean;
    user_id: string;
    updated_at: string;
}

// Session Management Types
export interface CreateSessionRequest {
    user_id: string;
    session_id: string;
    duration_minutes: number;
    topics_covered: string[];
    new_vocabulary: string[];
    grammar_points: string[];
    pronunciation_practice_count: number;
    overall_performance: string;
    achievements: string[];
    next_session_recommendations: string[];
}

export interface SessionResponse {
    success: boolean;
    session_id: string;
    created_at: string;
}

// LiveKit Types
export interface RoomJoinRequest {
    user_id: string;
    room_name: string;
}

export interface RoomTokenResponse {
    token: string;
    room_url: string;
    room_name: string;
    expires_at: string;
    session_id: string;
}

// Progress Analytics Types
export interface ProgressAnalytics {
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

// Error Types
export interface APIError {
    error: {
        code: string;
        message: string;
        details?: any;
    };
    timestamp: string;
}

// Database Types
export interface DatabaseUser {
    id: string;
    user_id: string;
    email: string | null;
    display_name: string | null;
    avatar_url: string | null;
    created_at: string;
    updated_at: string;
}

export interface DatabaseUserContext {
    id: string;
    user_id: string;
    preferences: UserPreferences;
    progress: UserProgress;
    session_history: SessionHistory[];
    created_at: string;
    updated_at: string;
}

export interface DatabaseLearningSession {
    id: string;
    user_id: string;
    session_id: string;
    duration_minutes: number;
    topics_covered: string[];
    new_vocabulary: string[];
    grammar_points: string[];
    pronunciation_practice_count: number;
    overall_performance: string | null;
    achievements: string[];
    session_data: Record<string, any>;
    next_session_recommendations: string[];
    created_at: string;
}

export interface DatabaseAchievement {
    id: string;
    user_id: string;
    achievement_id: string;
    title: string;
    description: string | null;
    icon: string | null;
    data: Record<string, any>;
    unlocked_at: string;
}

// Agent Context Types
export interface AgentContext {
    agentId: string;
    userId: string;
    sessionId?: string;
    permissions: string[];
    isAutoInitialized?: boolean;
}

export interface DatabaseAgentContext {
    id: string;
    agent_id: string;
    user_id: string;
    session_id: string | null;
    permissions: string[];
    is_auto_initialized: boolean;
    metadata: Record<string, any>;
    created_at: string;
    updated_at: string;
    last_used_at: string;
}
