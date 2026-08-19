import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { env } from '../config';
import { logger } from '../logger';

const secretsPath = path.join(__dirname, '..', '..', 'data', 'secrets.json');

export interface ApiKeyStatus {
  configured: boolean;
  source: 'local' | 'env' | 'none';
  label: string;
  keyHint: string;
  testnet: boolean;
}

interface EncryptedSecretsFile {
  apiKeyEnc: string;
  apiSecretEnc: string;
  testnet: boolean;
  label: string;
  keyHint: string;
  updatedAt: number;
}

export interface DecryptedKeys {
  apiKey: string;
  apiSecret: string;
  testnet: boolean;
  label: string;
  keyHint: string;
}

function deriveKey(): Buffer {
  return crypto.scryptSync(env.ENCRYPTION_KEY, 'moonwalker-bybit-secrets', 32);
}

function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(payload: string): string {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

function hint(apiKey: string): string {
  if (!apiKey) return '';
  return apiKey.length <= 4 ? '****' : `••••${apiKey.slice(-4)}`;
}

function readFile(): EncryptedSecretsFile | null {
  try {
    if (!fs.existsSync(secretsPath)) return null;
    return JSON.parse(fs.readFileSync(secretsPath, 'utf-8')) as EncryptedSecretsFile;
  } catch {
    return null;
  }
}

export function loadStoredKeys(): DecryptedKeys | null {
  const file = readFile();
  if (!file) return null;
  try {
    return {
      apiKey: decrypt(file.apiKeyEnc),
      apiSecret: decrypt(file.apiSecretEnc),
      testnet: file.testnet,
      label: file.label,
      keyHint: file.keyHint,
    };
  } catch (err) {
    logger.error('Failed to decrypt stored API keys — ENCRYPTION_KEY may have changed', { err });
    return null;
  }
}

export function saveStoredKeys(params: {
  apiKey: string;
  apiSecret: string;
  testnet: boolean;
  label?: string;
}): ApiKeyStatus {
  const dir = path.dirname(secretsPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file: EncryptedSecretsFile = {
    apiKeyEnc: encrypt(params.apiKey.trim()),
    apiSecretEnc: encrypt(params.apiSecret.trim()),
    testnet: params.testnet,
    label: (params.label || 'Bybit sub-account').trim(),
    keyHint: hint(params.apiKey.trim()),
    updatedAt: Date.now(),
  };
  fs.writeFileSync(secretsPath, JSON.stringify(file, null, 2), { mode: 0o600 });
  logger.info('Bybit API keys saved locally (encrypted)', { label: file.label, testnet: file.testnet });
  return getApiKeyStatus();
}

export function clearStoredKeys(): void {
  if (fs.existsSync(secretsPath)) fs.unlinkSync(secretsPath);
  logger.info('Local Bybit API keys removed');
}

export function resolveApiCredentials(): { apiKey: string; apiSecret: string; testnet: boolean } {
  const stored = loadStoredKeys();
  if (stored?.apiKey && stored.apiSecret) {
    return { apiKey: stored.apiKey, apiSecret: stored.apiSecret, testnet: stored.testnet };
  }
  return {
    apiKey: env.BYBIT_API_KEY,
    apiSecret: env.BYBIT_API_SECRET,
    testnet: env.BYBIT_TESTNET,
  };
}

export function hasApiKeys(): boolean {
  const c = resolveApiCredentials();
  return Boolean(c.apiKey && c.apiSecret);
}

export function getApiKeyStatus(): ApiKeyStatus {
  const stored = loadStoredKeys();
  if (stored?.apiKey) {
    return {
      configured: true,
      source: 'local',
      label: stored.label,
      keyHint: stored.keyHint,
      testnet: stored.testnet,
    };
  }
  if (env.BYBIT_API_KEY && env.BYBIT_API_SECRET) {
    return {
      configured: true,
      source: 'env',
      label: 'backend/.env',
      keyHint: hint(env.BYBIT_API_KEY),
      testnet: env.BYBIT_TESTNET,
    };
  }
  return { configured: false, source: 'none', label: '', keyHint: '', testnet: true };
}
