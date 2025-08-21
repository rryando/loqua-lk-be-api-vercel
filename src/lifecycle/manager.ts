// Application Lifecycle Manager

export interface LifecycleService {
    name: string;
    start(): Promise<void>;
    stop(): Promise<void>;
    healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details?: any }>;
}

export class LifecycleManager {
    private services: Map<string, LifecycleService> = new Map();
    private isStarted = false;
    private startupPromise?: Promise<void>;
    private shutdownPromise?: Promise<void>;

    constructor() {
        // Register graceful shutdown handlers
        process.on('SIGTERM', this.gracefulShutdown.bind(this));
        process.on('SIGINT', this.gracefulShutdown.bind(this));
        process.on('uncaughtException', this.handleUncaughtException.bind(this));
        process.on('unhandledRejection', this.handleUnhandledRejection.bind(this));
    }

    // Register a service
    registerService(service: LifecycleService): void {
        this.services.set(service.name, service);
    }

    // Start all services
    async start(): Promise<void> {
        if (this.isStarted) return;
        if (this.startupPromise) return this.startupPromise;

        this.startupPromise = this.doStart();
        return this.startupPromise;
    }

    private async doStart(): Promise<void> {
        console.log('🚀 Starting application lifecycle...');

        const startPromises = Array.from(this.services.entries()).map(async ([name, service]) => {
            try {
                console.log(`📦 Starting service: ${name}`);
                await service.start();
                console.log(`✅ Service started: ${name}`);
            } catch (error) {
                console.error(`❌ Failed to start service ${name}:`, error);
                throw error;
            }
        });

        await Promise.all(startPromises);
        this.isStarted = true;
        console.log('🎉 Application lifecycle started successfully');
    }

    // Stop all services
    async stop(): Promise<void> {
        if (!this.isStarted) return;
        if (this.shutdownPromise) return this.shutdownPromise;

        this.shutdownPromise = this.doStop();
        return this.shutdownPromise;
    }

    private async doStop(): Promise<void> {
        console.log('🛑 Stopping application lifecycle...');

        const stopPromises = Array.from(this.services.entries()).map(async ([name, service]) => {
            try {
                console.log(`📦 Stopping service: ${name}`);
                await service.stop();
                console.log(`✅ Service stopped: ${name}`);
            } catch (error) {
                console.error(`❌ Failed to stop service ${name}:`, error);
                // Continue stopping other services even if one fails
            }
        });

        await Promise.all(stopPromises);
        this.isStarted = false;
        console.log('👋 Application lifecycle stopped');
    }

    // Health check for all services
    async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; services: Record<string, any> }> {
        const serviceStatuses: Record<string, any> = {};
        let overallStatus: 'healthy' | 'unhealthy' = 'healthy';

        const healthPromises = Array.from(this.services.entries()).map(async ([name, service]) => {
            try {
                const health = await service.healthCheck();
                serviceStatuses[name] = health;
                if (health.status === 'unhealthy') {
                    overallStatus = 'unhealthy';
                }
            } catch (error) {
                serviceStatuses[name] = { status: 'unhealthy', details: error instanceof Error ? error.message : String(error) };
                overallStatus = 'unhealthy';
            }
        });

        await Promise.all(healthPromises);

        return {
            status: overallStatus,
            services: serviceStatuses,
        };
    }

    // Graceful shutdown handler
    private async gracefulShutdown(signal: string): Promise<void> {
        console.log(`\n🚨 Received ${signal}, initiating graceful shutdown...`);

        try {
            await this.stop();
            console.log('✅ Graceful shutdown completed');
            process.exit(0);
        } catch (error) {
            console.error('❌ Error during graceful shutdown:', error);
            process.exit(1);
        }
    }

    // Handle uncaught exceptions
    private handleUncaughtException(error: Error): void {
        console.error('💥 Uncaught Exception:', error);
        this.gracefulShutdown('UNCAUGHT_EXCEPTION');
    }

    // Handle unhandled promise rejections
    private handleUnhandledRejection(reason: any, promise: Promise<any>): void {
        console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
        this.gracefulShutdown('UNHANDLED_REJECTION');
    }

    // Get service status
    getServiceStatus(name: string): 'registered' | 'not-found' {
        return this.services.has(name) ? 'registered' : 'not-found';
    }

    // List all registered services
    listServices(): string[] {
        return Array.from(this.services.keys());
    }

    // Check if lifecycle is started
    isLifecycleStarted(): boolean {
        return this.isStarted;
    }
}
