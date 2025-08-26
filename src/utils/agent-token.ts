// Utility for generating agent tokens (development/testing)
import { AgentAuthProvider } from '../auth/providers/agent.js';

export function createAgentToken(agentId: string = 'livekit-agent', jwtSecret?: string): string {
    const secret = jwtSecret || process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET is required to generate agent tokens');
    }

    const agentProvider = new AgentAuthProvider(secret);
    return agentProvider.generateAgentToken(agentId, [
        'user.context',
        'user.progress',
        'session.create'
    ]);
}

// CLI usage example:
// node -e "
//   import('./src/utils/agent-token').then(({ createAgentToken }) => {
//     console.log('Agent Token:', createAgentToken());
//   });
// "
if (import.meta.url === `file://${process.argv[1]}`) {
    try {
        const token = createAgentToken();
        console.log('Generated Agent Token:');
        console.log(token);
        console.log('\nUse this token in your Python agent with:');
        console.log(`Authorization: Bearer ${token}`);
    } catch (error) {
        console.error('Error generating token:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}
