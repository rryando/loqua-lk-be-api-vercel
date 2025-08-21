import jwt from 'jsonwebtoken';
import { BaseAuthProvider, AuthUser } from './base';

export interface JWTPayload {
    sub: string; // user ID
    email?: string;
    name?: string;
    picture?: string;
    [key: string]: any;
}

export class JWTAuthProvider extends BaseAuthProvider {
    name = 'jwt';

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
            }) as JWTPayload;

            return {
                id: payload.sub,
                email: payload.email || null,
                displayName: payload.name || null,
                avatarUrl: payload.picture || null,
                metadata: payload,
            };
        } catch (error) {
            console.error('JWT verification error:', error);
            return null;
        }
    }
}
