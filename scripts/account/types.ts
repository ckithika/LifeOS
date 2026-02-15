/**
 * LifeOS — Account CLI Types
 *
 * Provider abstraction for scalable account management.
 * Only Google is implemented now; future providers (Microsoft 365, IMAP, CalDAV)
 * implement the same ProviderDefinition interface.
 */

export interface AuthResult {
  /** Environment variable key (e.g., GOOGLE_TOKEN_WORK) */
  envKey: string;
  /** Serialized token value to store */
  envValue: string;
  /** Email verified during auth flow */
  verifiedEmail?: string;
}

export interface ProviderDefinition {
  /** Provider identifier (e.g., 'google') */
  id: string;
  /** Human-readable name shown in prompts */
  displayName: string;
  /** Auth method this provider uses */
  authMethod: 'oauth2' | 'credentials';
  /** Account types this provider supports */
  supportedAccountTypes: string[];
  /** Run the authentication flow and return token data */
  authenticate(alias: string, email: string): Promise<AuthResult>;
  /** Get the env var key where this provider's token is stored */
  getTokenEnvKey(alias: string): string;
  /** Optionally verify an existing token still works */
  verify?(alias: string): Promise<boolean>;
}
