import * as jwt from 'jsonwebtoken';
import { BaseAuthProvider, AuthUser } from './base.js';

export interface AgentJWTPayload {
    sub: string; // agent ID (e.g., 'livekit-agent')
    role: 'agent';
    permissions: string[];
    iss?: string;
    aud?: string;
    exp?: number;
    iat?: number;
}

export class AgentAuthProvider extends BaseAuthProvider {
    name = 'agent';

    constructor(
        private jwtSecret: string,
        private options?: {
            algorithms?: jwt.Algorithm[];
            issuer?: string;
            audience?: string;
        }
    ) {
        super();
    }

    async verifyToken(token: string): Promise<AuthUser | null> {
        try {
            const payload = jwt.verify(token, this.jwtSecret, {
                algorithms: this.options?.algorithms || ['HS256'],
                issuer: this.options?.issuer,
                audience: this.options?.audience,
            }) as AgentJWTPayload;

            // Validate that this is an agent token
            if (payload.role !== 'agent') {
                return null;
            }

            return {
                id: payload.sub,
                email: null,
                displayName: `Agent: ${payload.sub}`,
                avatarUrl: null,
                metadata: {
                    role: 'agent',
                    permissions: payload.permissions || [],
                    isAgent: true,
                },
            };
        } catch (error) {
            console.error('Agent JWT verification error:', error);
            console.error('Token preview:', token?.substring(0, 50) + '...');
            console.error('Token length:', token?.length);
            return null;
        }
    }

    // Helper method to generate agent tokens (for testing/development)
    generateAgentToken(agentId: string, permissions: string[] = ['user.context', 'session.create']): string {
        const payload: AgentJWTPayload = {
            sub: agentId,
            role: 'agent',
            permissions,
            iss: this.options?.issuer,
            aud: this.options?.audience,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + (60 * 60), // 1 hour
        };

        return jwt.sign(payload, this.jwtSecret);
    }
}
