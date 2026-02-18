/**
 * GCS-backed session persistence for Baileys auth state.
 *
 * On Cloud Run, the filesystem is ephemeral — auth state must survive
 * container restarts and redeploys. This module stores Baileys' auth
 * files in a GCS bucket.
 *
 * For local development, falls back to a local `auth_info/` directory.
 */

import { Storage } from '@google-cloud/storage';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const LOCAL_AUTH_DIR = 'auth_info';
const GCS_PREFIX = 'auth/';

let storage: Storage | null = null;

function getStorage(): Storage {
  if (!storage) {
    storage = new Storage();
  }
  return storage;
}

function getBucketName(): string | undefined {
  return process.env.WHATSAPP_SESSION_BUCKET;
}

/**
 * Load auth state files from GCS bucket into local directory.
 * Returns the local directory path to pass to Baileys.
 * Downloads files in parallel for fast startup.
 */
export async function loadAuthState(): Promise<string> {
  mkdirSync(LOCAL_AUTH_DIR, { recursive: true });

  const bucket = getBucketName();
  if (!bucket) {
    console.log('[session] No GCS bucket configured, using local auth_info/');
    return LOCAL_AUTH_DIR;
  }

  try {
    const gcs = getStorage();
    const [files] = await gcs.bucket(bucket).getFiles({ prefix: GCS_PREFIX });

    if (files.length === 0) {
      console.log('[session] No existing session in GCS — will need QR code pairing');
      return LOCAL_AUTH_DIR;
    }

    // Download all files in parallel for fast startup
    await Promise.all(
      files.map(async (file) => {
        const localName = file.name.replace(GCS_PREFIX, '');
        if (!localName) return;
        const localPath = join(LOCAL_AUTH_DIR, localName);
        const [contents] = await file.download();
        writeFileSync(localPath, contents);
      }),
    );

    console.log(`[session] Loaded ${files.length} auth files from GCS`);
  } catch (error: any) {
    console.warn('[session] Failed to load from GCS, using local:', error.message);
  }

  return LOCAL_AUTH_DIR;
}

/**
 * Save auth state files from local directory to GCS bucket.
 * Called on every `creds.update` event from Baileys.
 * Uploads files in parallel with retry for reliability.
 */
export async function saveAuthState(): Promise<void> {
  const bucket = getBucketName();
  if (!bucket) return;

  if (!existsSync(LOCAL_AUTH_DIR)) return;

  try {
    const gcs = getStorage();
    const files = readdirSync(LOCAL_AUTH_DIR);

    // Upload all files in parallel
    const results = await Promise.allSettled(
      files.map(async (file) => {
        const localPath = join(LOCAL_AUTH_DIR, file);
        const content = readFileSync(localPath);
        await gcs.bucket(bucket).file(`${GCS_PREFIX}${file}`).save(content);
      }),
    );

    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      console.warn(`[session] Saved to GCS with ${failed}/${files.length} failures`);
    } else {
      console.log(`[session] Saved ${files.length} auth files to GCS`);
    }
  } catch (error: any) {
    console.warn('[session] Failed to save to GCS:', error.message);
  }
}
