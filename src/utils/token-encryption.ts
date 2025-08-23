import * as crypto from 'crypto';

/**
 * Token encryption utilities for securely transmitting user JWTs to agents
 */

export class TokenEncryption {
    private static readonly ALGORITHM = 'aes-256-cbc';
    
    /**
     * Encrypt a JWT token using AES-256-CBC
     */
    static encrypt(token: string, secret: string): string {
        try {
            // Generate a random IV
            const iv = crypto.randomBytes(16);
            
            // Create cipher
            const cipher = crypto.createCipher(this.ALGORITHM, secret);
            
            // Encrypt the token
            let encrypted = cipher.update(token, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            // Combine IV and encrypted data
            return iv.toString('hex') + ':' + encrypted;
        } catch (error) {
            throw new Error(`Token encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    
    /**
     * Decrypt a JWT token using AES-256-CBC
     */
    static decrypt(encryptedToken: string, secret: string): string {
        try {
            // Split IV and encrypted data
            const parts = encryptedToken.split(':');
            if (parts.length !== 2) {
                throw new Error('Invalid encrypted token format');
            }
            
            const iv = Buffer.from(parts[0], 'hex');
            const encrypted = parts[1];
            
            // Create decipher
            const decipher = crypto.createDecipher(this.ALGORITHM, secret);
            
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