/**
 * Helper utilities for LiveKit agents
 * 
 * This file contains utilities that agent developers can reference or copy
 * for their Python/JavaScript agent implementations.
 */

import { createDecipher } from 'crypto';

/**
 * Decrypt encrypted user JWT token received from /agent/user-token endpoint
 * 
 * @param encryptedToken - The encrypted token from API response
 * @param secret - The shared encryption secret
 * @returns Decrypted JWT token
 */
export function decryptUserToken(encryptedToken: string, secret: string): string {
    try {
        // Split IV and encrypted data
        const parts = encryptedToken.split(':');
        if (parts.length !== 2) {
            throw new Error('Invalid encrypted token format');
        }
        
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        
        // Create decipher
        const decipher = createDecipher('aes-256-cbc', secret);
        
        // Decrypt the token
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    } catch (error) {
        throw new Error(`Token decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Example Python implementation for reference:
 * 
 * ```python
 * from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
 * from cryptography.hazmat.backends import default_backend
 * import base64
 * 
 * def decrypt_user_token(encrypted_token: str, secret: str) -> str:
 *     try:
 *         # Split IV and encrypted data
 *         parts = encrypted_token.split(':')
 *         if len(parts) != 2:
 *             raise ValueError("Invalid encrypted token format")
 *         
 *         iv = bytes.fromhex(parts[0])
 *         encrypted = bytes.fromhex(parts[1])
 *         
 *         # Create cipher
 *         cipher = Cipher(
 *             algorithms.AES(secret.encode()[:32].ljust(32, b'\0')),
 *             modes.CBC(iv),
 *             backend=default_backend()
 *         )
 *         
 *         # Decrypt
 *         decryptor = cipher.decryptor()
 *         decrypted = decryptor.update(encrypted) + decryptor.finalize()
 *         
 *         # Remove padding and decode
 *         return decrypted.decode('utf-8').rstrip('\0')
 *         
 *     except Exception as e:
 *         raise Exception(f"Token decryption failed: {str(e)}")
 * ```
 */

/**
 * Validate JWT token format (basic structure check)
 */
export function validateJWTFormat(token: string): boolean {
    try {
        const parts = token.split('.');
        return parts.length === 3; // header.payload.signature
    } catch {
        return false;
    }
}

/**
 * Extract payload from JWT without verification (for debugging)
 * WARNING: Only use for debugging, always verify tokens properly in production
 */
export function extractJWTPayload(token: string): any {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) {
            throw new Error('Invalid JWT format');
        }
        
        const payload = Buffer.from(parts[1], 'base64url').toString();
        return JSON.parse(payload);
    } catch (error) {
        throw new Error(`Failed to extract JWT payload: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}