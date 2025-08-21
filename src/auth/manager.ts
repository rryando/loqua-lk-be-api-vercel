import { AuthProvider, AuthUser, AuthSession } from './providers/base';

export class AuthManager {
    private providers: Map<string, AuthProvider> = new Map();
    private defaultProvider?: string;

    constructor() { }

    // Register an auth provider
    registerProvider(provider: AuthProvider, isDefault = false): void {
        this.providers.set(provider.name, provider);
        if (isDefault || this.providers.size === 1) {
            this.defaultProvider = provider.name;
        }
    }

    // Get a specific provider
    getProvider(name: string): AuthProvider | undefined {
        return this.providers.get(name);
    }

    // Get the default provider
    getDefaultProvider(): AuthProvider | undefined {
        if (!this.defaultProvider) return undefined;
        return this.providers.get(this.defaultProvider);
    }

    // Verify token using default provider
    async verifyToken(token: string, providerName?: string): Promise<AuthUser | null> {
        const provider = providerName
            ? this.getProvider(providerName)
            : this.getDefaultProvider();

        if (!provider) {
            throw new Error(`Auth provider not found: ${providerName || 'default'}`);
        }

        return provider.verifyToken(token);
    }

    // Get session using default provider
    async getSession(token: string, providerName?: string): Promise<AuthSession | null> {
        const provider = providerName
            ? this.getProvider(providerName)
            : this.getDefaultProvider();

        if (!provider) {
            throw new Error(`Auth provider not found: ${providerName || 'default'}`);
        }

        return provider.getSession(token);
    }

    // Try to verify token with all providers (fallback strategy)
    async verifyTokenWithFallback(token: string): Promise<{ user: AuthUser; provider: string } | null> {
        for (const [name, provider] of this.providers) {
            try {
                const user = await provider.verifyToken(token);
                if (user) {
                    return { user, provider: name };
                }
            } catch (error) {
                // Continue to next provider
                console.warn(`Auth verification failed with provider ${name}:`, error);
            }
        }
        return null;
    }

    // List all registered providers
    getProviderNames(): string[] {
        return Array.from(this.providers.keys());
    }
}
