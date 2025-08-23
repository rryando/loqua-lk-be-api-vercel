import * as crypto from 'crypto';

/**
 * Token encryption utilities for securely transmitting user JWTs to agents
 */

export class TokenEncryption {
    private static readonly ALGORITHM = 'aes-256-gcm';

    /**
     * Encrypt a JWT token using AES-256-GCM
     */
    static encrypt(token: string, secret: string): string {
        try {
            // Create a key from the secret
            const key = crypto.scryptSync(secret, 'salt', 32);

            // Generate a random IV
            const iv = crypto.randomBytes(16);

            // Create cipher
            const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);

            // Encrypt the token
            let encrypted = cipher.update(token, 'utf8', 'hex');
            encrypted += cipher.final('hex');

            // Get the authentication tag
            const authTag = cipher.getAuthTag();

            // Combine IV, auth tag, and encrypted data
            return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
        } catch (error) {
            throw new Error(`Token encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Decrypt a JWT token using AES-256-GCM
     */
    static decrypt(encryptedToken: string, secret: string): string {
        try {
            // Split IV, auth tag, and encrypted data
            const parts = encryptedToken.split(':');
            if (parts.length !== 3) {
                throw new Error('Invalid encrypted token format');
            }

            const iv = Buffer.from(parts[0], 'hex');
            const authTag = Buffer.from(parts[1], 'hex');
            const encrypted = parts[2];

            // Create a key from the secret
            const key = crypto.scryptSync(secret, 'salt', 32);

            // Create decipher
            const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
            decipher.setAuthTag(authTag);

            // Decrypt the token
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            return decrypted;
        } catch (error) {
            throw new Error(`Token decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Validate that a token is properly formatted (basic JWT structure check)
     */
    static validateTokenFormat(token: string): boolean {
        try {
            const parts = token.split('.');
            return parts.length === 3; // header.payload.signature
        } catch {
            return false;
        }
    }

    /**
     * Generate a random encryption secret (for development/testing)
     */
    static generateSecret(): string {
        return crypto.randomBytes(32).toString('hex');
    }
}