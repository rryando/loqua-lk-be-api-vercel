import { AuthManager } from '../../auth/manager.js';
import { LifecycleService } from '../manager.js';

export class AuthService implements LifecycleService {
    name = 'auth';

    constructor(private authManager: AuthManager) { }

    async start(): Promise<void> {
        // Validate that at least one auth provider is registered
        const providers = this.authManager.getProviderNames();
        if (providers.length === 0) {
            throw new Error('No authentication providers registered');
        }

        // Test default provider
        const defaultProvider = this.authManager.getDefaultProvider();
        if (!defaultProvider) {
            throw new Error('No default authentication provider set');
        }

        console.log(`Auth service started with providers: ${providers.join(', ')}`);
        console.log(`Default provider: ${defaultProvider.name}`);
    }

    async stop(): Promise<void> {
        // Auth providers don't typically need cleanup
        // Any ongoing token validations will complete naturally
    }

    async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details?: any }> {
        try {
            const providers = this.authManager.getProviderNames();
            const defaultProvider = this.authManager.getDefaultProvider();

            if (providers.length === 0) {
                return {
                    status: 'unhealthy',
                    details: {
                        error: 'No authentication providers registered',
                    },
                };
            }

            if (!defaultProvider) {
                return {
                    status: 'unhealthy',
                    details: {
                        error: 'No default authentication provider set',
                    },
                };
            }

            return {
                status: 'healthy',
                details: {
                    providers,
                    default_provider: defaultProvider.name,
                    provider_count: providers.length,
                },
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                details: {
                    error: error instanceof Error ? error.message : 'Unknown error',
                },
            };
        }
    }
}
