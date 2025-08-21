// Base authentication provider interface
export interface AuthUser {
    id: string;
    email?: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
    metadata?: Record<string, any>;
}

export interface AuthSession {
    user: AuthUser;
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
}

export interface AuthProvider {
    name: string;

    // Verify a token and return user info
    verifyToken(token: string): Promise<AuthUser | null>;

    // Get user session from token
    getSession(token: string): Promise<AuthSession | null>;

    // Sign out user (if applicable)
    signOut?(token: string): Promise<void>;

    // Refresh token (if applicable)
    refreshSession?(refreshToken: string): Promise<AuthSession | null>;
}

export abstract class BaseAuthProvider implements AuthProvider {
    abstract name: string;

    abstract verifyToken(token: string): Promise<AuthUser | null>;

    async getSession(token: string): Promise<AuthSession | null> {
        const user = await this.verifyToken(token);
        if (!user) return null;

        return {
            user,
            accessToken: token,
        };
    }

    async signOut?(token: string): Promise<void> {
        // Default implementation - override if needed
    }
}
