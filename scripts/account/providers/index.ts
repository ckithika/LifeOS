/**
 * LifeOS — Provider Registry
 *
 * Central registry of available account providers.
 * Add new providers here as they're implemented.
 */

import type { ProviderDefinition } from '../types.js';
import { googleProvider } from './google.js';

const providers: ProviderDefinition[] = [
  googleProvider,
];

export function getProviders(): ProviderDefinition[] {
  return providers;
}

export function getProvider(id: string): ProviderDefinition | undefined {
  return providers.find(p => p.id === id);
}
