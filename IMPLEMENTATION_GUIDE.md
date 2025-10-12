# n8n-mcp MVP: Developer Implementation Guide

**Version:** 1.0
**Target:** 2.5 week MVP launch
**Audience:** Backend, Frontend, DevOps engineers
**Date:** 2025-10-11

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Phase 0: Environment Setup (Day 0)](#phase-0-environment-setup)
3. [Phase 1: Backend Implementation (Days 1-4)](#phase-1-backend-implementation)
4. [Phase 2: Frontend Implementation (Days 5-9)](#phase-2-frontend-implementation)
5. [Phase 3: Testing & Launch (Days 10-12)](#phase-3-testing--launch)
6. [Troubleshooting](#troubleshooting)
7. [Rollback Procedures](#rollback-procedures)

---

## Prerequisites

### Development Environment

**Required Tools:**
- [ ] Node.js 20+ LTS
- [ ] npm 10+
- [ ] Docker & Docker Compose
- [ ] Git
- [ ] Code editor (VS Code recommended)
- [ ] curl / Postman for API testing

**Optional but Recommended:**
- [ ] Docker Desktop (for local testing)
- [ ] GitHub CLI (`gh`)
- [ ] Supabase CLI (`npx supabase`)

### Access & Accounts

**Must Have:**
- [ ] GitHub account with access to `czlonkowski/n8n-mcp` repo
- [ ] Supabase account (free tier)
- [ ] Hetzner Cloud account
- [ ] Domain access to `n8n-mcp.com` DNS

**Nice to Have:**
- [ ] Vercel account (for frontend hosting)
- [ ] Testing n8n instance with API key

### Knowledge Prerequisites

**Backend Developer:**
- TypeScript/Node.js
- REST APIs & HTTP servers
- PostgreSQL & SQL
- Docker basics
- Encryption (AES-256-GCM)

**Frontend Developer:**
- React 19 & Next.js 15
- TypeScript
- Supabase client SDK
- Server Components & Server Actions

**DevOps:**
- Docker Compose
- Caddy/nginx basics
- DNS configuration
- SSL/TLS certificates

---

## Phase 0: Environment Setup

**Goal:** Get development environment ready
**Time:** 2-4 hours
**Assignee:** All team members

### 0.1 Clone Repository

```bash
# Clone n8n-mcp backend
git clone https://github.com/czlonkowski/n8n-mcp.git
cd n8n-mcp

# Create feature branch
git checkout -b feature/multi-tenant-mvp

# Install dependencies
npm install

# Build to verify setup
npm run build
```

**Verification:**
```bash
npm run typecheck  # Should pass
npm test           # Existing tests should pass
```

### 0.2 Create Supabase Project

**Steps:**
1. Go to https://supabase.com/dashboard
2. Click "New Project"
3. Fill in:
   - Name: `n8n-mcp-production`
   - Database Password: Generate strong password (save securely!)
   - Region: Europe (Frankfurt) - closest to Hetzner
   - Plan: Free tier
4. Wait for provisioning (~2 minutes)

**Get Credentials:**
```bash
# From Project Settings > API
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJxxxxx  # For frontend
SUPABASE_SERVICE_KEY=eyJxxxxx  # For backend (bypasses RLS)
```

**Create `.env.local` file:**
```bash
# Backend .env.local
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJxxxxx
SESSION_SECRET=generate-random-32-char-string
NODE_ENV=development
MCP_MODE=http
PORT=3000
ENABLE_MULTI_TENANT=true
```

### 0.3 Provision Hetzner Server (Optional for Local Dev)

**For Production Deployment:**
1. Go to https://console.hetzner.cloud
2. Create new project: `n8n-mcp-production`
3. Add server:
   - Type: CPX31 (4 vCPU, 8GB RAM)
   - Location: Falkenstein, Germany
   - Image: Ubuntu 22.04 LTS
   - Add SSH key
4. Note server IP: `XXX.XXX.XXX.XXX`

**Initial Server Setup:**
```bash
ssh root@XXX.XXX.XXX.XXX

# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose
apt install docker-compose-plugin -y

# Verify
docker --version
docker compose version
```

### 0.4 Configure DNS

**Add DNS Records:**
```
Type  Name              Value                  TTL
A     api.n8n-mcp.com   XXX.XXX.XXX.XXX       300
A     www.n8n-mcp.com   (Vercel IP)           300
```

**Verification:**
```bash
dig api.n8n-mcp.com +short  # Should return server IP
```

---

## Phase 1: Backend Implementation

**Goal:** Multi-tenant n8n-mcp service with API key auth
**Time:** 3-4 days
**Assignee:** Backend developer

### Day 1: Database Schema & Supabase Setup

#### 1.1 Deploy Database Schema

**File:** `supabase/schema.sql` (create this file)

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends auth.users)
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- API Keys table (n8n-mcp keys, not n8n instance keys!)
CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,  -- e.g., "nmcp_abc123..."
  name TEXT NOT NULL,         -- User-friendly name
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);

-- n8n Instance Configuration (user's actual n8n credentials)
CREATE TABLE public.n8n_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  instance_url TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,  -- Encrypted n8n API key
  is_active BOOLEAN DEFAULT TRUE,
  last_validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_instance UNIQUE(user_id, instance_url)
);

-- Usage tracking (basic for MVP)
CREATE TABLE public.usage_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  api_key_id UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
  tool_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'error', 'rate_limited')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_api_keys_user_id ON public.api_keys(user_id);
CREATE INDEX idx_api_keys_key_hash ON public.api_keys(key_hash);
CREATE INDEX idx_api_keys_active ON public.api_keys(is_active) WHERE is_active = true;
CREATE INDEX idx_n8n_instances_user_id ON public.n8n_instances(user_id);
CREATE INDEX idx_usage_logs_user_id ON public.usage_logs(user_id);
CREATE INDEX idx_usage_logs_created_at ON public.usage_logs(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.n8n_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can view own data
CREATE POLICY "Users can view own data" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own data" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- Users can manage own API keys
CREATE POLICY "Users can view own API keys" ON public.api_keys
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own API keys" ON public.api_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own API keys" ON public.api_keys
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own API keys" ON public.api_keys
  FOR DELETE USING (auth.uid() = user_id);

-- Users can manage own n8n instances
CREATE POLICY "Users can view own n8n config" ON public.n8n_instances
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own n8n config" ON public.n8n_instances
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own n8n config" ON public.n8n_instances
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own n8n config" ON public.n8n_instances
  FOR DELETE USING (auth.uid() = user_id);

-- Users can view own usage logs
CREATE POLICY "Users can view own usage" ON public.usage_logs
  FOR SELECT USING (auth.uid() = user_id);

-- Service role can do everything (for backend API key validation)
-- This is automatic with service_role key

-- Function to auto-create user record on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create user on auth signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

**Deploy Schema:**

**Option A: Supabase Dashboard**
1. Go to SQL Editor in Supabase dashboard
2. Paste entire schema
3. Click "Run"

**Option B: Supabase CLI**
```bash
npx supabase db push
```

**Verification:**
```sql
-- Run in SQL Editor
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Should see: users, api_keys, n8n_instances, usage_logs
```

#### 1.2 Configure Supabase Auth

**Steps:**
1. Go to Authentication > Settings
2. Enable Email provider (already enabled)
3. Configure Email Templates:
   - Confirmation: Customize subject/body
   - Magic Link: Disable (not using for MVP)
4. Site URL: `https://www.n8n-mcp.com`
5. Redirect URLs: Add `https://www.n8n-mcp.com/auth/callback`

**Verification:**
- Send test signup email from dashboard
- Check email arrives and link works

---

### Day 2-3: Multi-Tenant Backend Implementation

#### 2.1 Create Encryption Service

**File:** `src/services/encryption.ts`

```typescript
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Derives an encryption key from master secret + user ID
 * This ensures each user has a unique encryption key
 */
function deriveKey(userId: string): Buffer {
  const masterKey = process.env.MASTER_ENCRYPTION_KEY;
  if (!masterKey) {
    throw new Error('MASTER_ENCRYPTION_KEY not set');
  }

  return crypto.pbkdf2Sync(
    masterKey,
    userId,
    100000,
    KEY_LENGTH,
    'sha512'
  );
}

/**
 * Encrypts data using AES-256-GCM
 * Format: salt + iv + tag + encrypted data
 */
export function encrypt(plaintext: string, userId: string): string {
  const key = deriveKey(userId);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  // Combine: iv + tag + encrypted
  const result = Buffer.concat([
    iv,
    tag,
    Buffer.from(encrypted, 'hex')
  ]);

  return result.toString('base64');
}

/**
 * Decrypts data encrypted with encrypt()
 */
export function decrypt(ciphertext: string, userId: string): string {
  const key = deriveKey(userId);
  const buffer = Buffer.from(ciphertext, 'base64');

  // Extract components
  const iv = buffer.subarray(0, IV_LENGTH);
  const tag = buffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buffer.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString('utf8');
}
```

**Test:**
```typescript
// Create test file: src/services/encryption.test.ts
import { encrypt, decrypt } from './encryption';

describe('Encryption Service', () => {
  beforeAll(() => {
    process.env.MASTER_ENCRYPTION_KEY = 'test-master-key-32-chars-long!';
  });

  test('should encrypt and decrypt correctly', () => {
    const userId = 'test-user-id';
    const plaintext = 'my-n8n-api-key-secret';

    const encrypted = encrypt(plaintext, userId);
    const decrypted = decrypt(encrypted, userId);

    expect(decrypted).toBe(plaintext);
    expect(encrypted).not.toBe(plaintext);
  });

  test('should fail with wrong user ID', () => {
    const userId1 = 'user-1';
    const userId2 = 'user-2';
    const plaintext = 'secret';

    const encrypted = encrypt(plaintext, userId1);

    expect(() => decrypt(encrypted, userId2)).toThrow();
  });
});
```

Run test:
```bash
npm test -- src/services/encryption.test.ts
```

#### 2.2 Create Supabase Client Service

**File:** `src/services/database.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

// Singleton pattern for Supabase client
let supabaseClient: ReturnType<typeof createClient> | null = null;

export function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
  }

  supabaseClient = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,  // Server-side, no sessions
      autoRefreshToken: false
    },
    db: {
      schema: 'public'
    }
  });

  return supabaseClient;
}

// Type definitions for database
export interface User {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiKey {
  id: string;
  user_id: string;
  key_hash: string;
  key_prefix: string;
  name: string;
  last_used_at: string | null;
  created_at: string;
  is_active: boolean;
}

export interface N8nInstance {
  id: string;
  user_id: string;
  instance_url: string;
  api_key_encrypted: string;
  is_active: boolean;
  last_validated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UsageLog {
  id: number;
  user_id: string;
  api_key_id: string | null;
  tool_name: string;
  status: 'success' | 'error' | 'rate_limited';
  error_message: string | null;
  created_at: string;
}
```

#### 2.3 Create Rate Limiter Service

**File:** `src/services/rate-limiter.ts`

```typescript
interface RateLimitCounter {
  count: number;
  windowStart: number;
}

export class RateLimiter {
  private counters = new Map<string, RateLimitCounter>();
  private cleanupInterval: NodeJS.Timeout;

  constructor(
    private limit: number = 100,  // requests per window
    private windowMs: number = 60000  // 1 minute
  ) {
    // Cleanup old counters every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 300000);
  }

  /**
   * Check if request is within rate limit
   * @param key Unique identifier (API key)
   * @returns true if allowed, false if rate limited
   */
  check(key: string): boolean {
    const now = Date.now();
    let counter = this.counters.get(key);

    // Create new window if doesn't exist or expired
    if (!counter || counter.windowStart < now - this.windowMs) {
      counter = {
        count: 0,
        windowStart: now
      };
    }

    counter.count++;
    this.counters.set(key, counter);

    return counter.count <= this.limit;
  }

  /**
   * Get remaining requests for a key
   */
  remaining(key: string): number {
    const counter = this.counters.get(key);
    if (!counter) return this.limit;

    const now = Date.now();
    if (counter.windowStart < now - this.windowMs) {
      return this.limit;
    }

    return Math.max(0, this.limit - counter.count);
  }

  /**
   * Reset rate limit for a key
   */
  reset(key: string): void {
    this.counters.delete(key);
  }

  /**
   * Cleanup expired counters
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, counter] of this.counters.entries()) {
      if (counter.windowStart < now - this.windowMs * 2) {
        this.counters.delete(key);
      }
    }
  }

  /**
   * Shutdown cleanup interval
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}
```

**Test:**
```typescript
// src/services/rate-limiter.test.ts
import { RateLimiter } from './rate-limiter';

describe('RateLimiter', () => {
  test('should allow requests within limit', () => {
    const limiter = new RateLimiter(3, 1000);
    const key = 'test-key';

    expect(limiter.check(key)).toBe(true);  // 1
    expect(limiter.check(key)).toBe(true);  // 2
    expect(limiter.check(key)).toBe(true);  // 3
    expect(limiter.check(key)).toBe(false); // 4 - exceeded
  });

  test('should reset after window expires', async () => {
    const limiter = new RateLimiter(2, 100);  // 100ms window
    const key = 'test-key';

    limiter.check(key);  // 1
    limiter.check(key);  // 2
    expect(limiter.check(key)).toBe(false);  // 3 - exceeded

    // Wait for window to expire
    await new Promise(resolve => setTimeout(resolve, 150));

    expect(limiter.check(key)).toBe(true);  // New window
  });
});
```

#### 2.4 Create Session Manager Service

**File:** `src/services/session-manager.ts`

```typescript
import fs from 'fs';
import path from 'path';
import { InstanceContext } from '../types';

export interface SessionData {
  userId: string;
  context: InstanceContext;
  created: number;
  lastAccess: number;
  expires: number;
}

export interface SessionOptions {
  maxSessions: number;
  ttl: number;  // milliseconds
  persistPath?: string;
}

export class SessionManager {
  private sessions = new Map<string, SessionData>();
  private backupInterval: NodeJS.Timeout | null = null;

  constructor(private options: SessionOptions) {
    this.loadFromDisk();

    // Backup to disk every minute if persistPath provided
    if (options.persistPath) {
      this.backupInterval = setInterval(() => {
        this.backupToDisk();
      }, 60000);
    }

    // Cleanup expired sessions every 5 minutes
    setInterval(() => this.cleanup(), 300000);
  }

  /**
   * Get session by ID
   */
  get(sessionId: string): SessionData | null {
    const session = this.sessions.get(sessionId);

    if (!session) return null;

    // Check if expired
    if (session.expires < Date.now()) {
      this.sessions.delete(sessionId);
      return null;
    }

    // Update last access
    session.lastAccess = Date.now();
    session.expires = Date.now() + this.options.ttl;

    return session;
  }

  /**
   * Create new session
   */
  create(userId: string, context: InstanceContext): string {
    // Enforce max sessions
    if (this.sessions.size >= this.options.maxSessions) {
      this.evictOldest();
    }

    const sessionId = this.generateSessionId();
    const now = Date.now();

    this.sessions.set(sessionId, {
      userId,
      context,
      created: now,
      lastAccess: now,
      expires: now + this.options.ttl
    });

    return sessionId;
  }

  /**
   * Delete session
   */
  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * Get all sessions for a user
   */
  getByUser(userId: string): SessionData[] {
    const result: SessionData[] = [];
    for (const [_, session] of this.sessions) {
      if (session.userId === userId && session.expires > Date.now()) {
        result.push(session);
      }
    }
    return result;
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Evict oldest session
   */
  private evictOldest(): void {
    let oldestId: string | null = null;
    let oldestTime = Infinity;

    for (const [id, session] of this.sessions) {
      if (session.lastAccess < oldestTime) {
        oldestTime = session.lastAccess;
        oldestId = id;
      }
    }

    if (oldestId) {
      this.sessions.delete(oldestId);
    }
  }

  /**
   * Cleanup expired sessions
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (session.expires < now) {
        this.sessions.delete(id);
      }
    }
  }

  /**
   * Backup sessions to disk
   */
  private backupToDisk(): void {
    if (!this.options.persistPath) return;

    try {
      const dirPath = this.options.persistPath;
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      const filePath = path.join(dirPath, 'sessions.json');
      const data = JSON.stringify(Array.from(this.sessions.entries()));

      fs.writeFileSync(filePath, data, 'utf8');
    } catch (error) {
      console.error('Failed to backup sessions:', error);
    }
  }

  /**
   * Load sessions from disk
   */
  private loadFromDisk(): void {
    if (!this.options.persistPath) return;

    try {
      const filePath = path.join(this.options.persistPath, 'sessions.json');

      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        const entries = JSON.parse(data);

        // Only restore non-expired sessions
        const now = Date.now();
        for (const [id, session] of entries) {
          if (session.expires > now) {
            this.sessions.set(id, session);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  }

  /**
   * Shutdown manager
   */
  destroy(): void {
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
    }
    this.backupToDisk();
  }
}
```

#### 2.5 Create API Key Validator Service

**File:** `src/services/api-key-validator.ts`

```typescript
import bcrypt from 'bcryptjs';
import { getSupabaseClient } from './database';
import { decrypt } from './encryption';
import { InstanceContext } from '../types';

export interface UserContext {
  userId: string;
  n8nUrl: string;
  n8nApiKey: string;
}

// In-memory cache for validated API keys (5 minute TTL)
interface CacheEntry {
  context: UserContext;
  expires: number;
}

const apiKeyCache = new Map<string, CacheEntry>();

// Cleanup cache every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of apiKeyCache.entries()) {
    if (entry.expires < now) {
      apiKeyCache.delete(key);
    }
  }
}, 300000);

/**
 * Validates n8n-mcp API key and returns user context
 * This performs the two-tier API key lookup:
 * 1. Validate n8n-mcp API key (nmcp_xxx)
 * 2. Fetch and decrypt user's n8n instance credentials
 */
export async function validateApiKey(apiKey: string): Promise<UserContext> {
  // Check cache first
  const cached = apiKeyCache.get(apiKey);
  if (cached && cached.expires > Date.now()) {
    return cached.context;
  }

  const supabase = getSupabaseClient();

  // Hash the provided API key
  const keyHash = await bcrypt.hash(apiKey, 10);

  // Look up API key in database
  const { data, error } = await supabase
    .from('api_keys')
    .select(`
      id,
      user_id,
      is_active,
      n8n_instances!inner (
        instance_url,
        api_key_encrypted,
        is_active
      )
    `)
    .eq('key_hash', keyHash)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    throw new Error('Invalid API key');
  }

  // Check if n8n instance is active
  const n8nInstance = Array.isArray(data.n8n_instances)
    ? data.n8n_instances[0]
    : data.n8n_instances;

  if (!n8nInstance || !n8nInstance.is_active) {
    throw new Error('n8n instance not configured or inactive');
  }

  // Decrypt n8n API key (server-side only!)
  let n8nApiKey: string;
  try {
    n8nApiKey = decrypt(n8nInstance.api_key_encrypted, data.user_id);
  } catch (error) {
    throw new Error('Failed to decrypt n8n credentials');
  }

  // Update last_used_at
  await supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id);

  // Create user context
  const context: UserContext = {
    userId: data.user_id,
    n8nUrl: n8nInstance.instance_url,
    n8nApiKey
  };

  // Cache for 5 minutes
  apiKeyCache.set(apiKey, {
    context,
    expires: Date.now() + 300000
  });

  return context;
}

/**
 * Clear cache for a specific API key
 */
export function clearApiKeyCache(apiKey: string): void {
  apiKeyCache.delete(apiKey);
}

/**
 * Clear all cache
 */
export function clearAllCache(): void {
  apiKeyCache.clear();
}
```

#### 2.6 Modify HTTP Server for Multi-Tenant

**File:** `src/http-server-single-session.ts` (modifications)

```typescript
// Add these imports at the top
import { validateApiKey } from './services/api-key-validator';
import { RateLimiter } from './services/rate-limiter';
import { SessionManager } from './services/session-manager';
import { getSupabaseClient } from './services/database';

// Initialize services (add after existing imports)
const rateLimiter = new RateLimiter(100, 60000); // 100 req/min
const sessionManager = new SessionManager({
  maxSessions: 1000,
  ttl: 3600000, // 1 hour
  persistPath: process.env.SESSION_PERSIST_PATH || './sessions'
});

// Add new method to HTTPServer class
private async handleMultiTenantRequest(
  req: Request
): Promise<Response> {
  // Extract API key from Authorization header
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response('Missing or invalid Authorization header', {
      status: 401,
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  const apiKey = authHeader.substring(7); // Remove 'Bearer '

  // Check rate limit
  if (!rateLimiter.check(apiKey)) {
    // Log rate limit event
    try {
      const supabase = getSupabaseClient();
      await supabase.from('usage_logs').insert({
        user_id: 'unknown', // We don't know user yet
        tool_name: 'rate_limit',
        status: 'rate_limited'
      });
    } catch (error) {
      console.error('Failed to log rate limit:', error);
    }

    return new Response('Rate limit exceeded', {
      status: 429,
      headers: {
        'Content-Type': 'text/plain',
        'X-RateLimit-Limit': '100',
        'X-RateLimit-Remaining': '0',
        'Retry-After': '60'
      }
    });
  }

  // Validate API key and get user context
  let userContext;
  try {
    userContext = await validateApiKey(apiKey);
  } catch (error) {
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  // Create InstanceContext (existing pattern!)
  const instanceContext: InstanceContext = {
    n8nApiUrl: userContext.n8nUrl,
    n8nApiKey: userContext.n8nApiKey
  };

  // Handle MCP request with user's context
  try {
    const response = await this.handleMCPRequest(req, instanceContext);

    // Log successful usage
    const supabase = getSupabaseClient();
    await supabase.from('usage_logs').insert({
      user_id: userContext.userId,
      tool_name: this.extractToolName(req),
      status: 'success'
    });

    return response;
  } catch (error) {
    // Log error
    const supabase = getSupabaseClient();
    await supabase.from('usage_logs').insert({
      user_id: userContext.userId,
      tool_name: this.extractToolName(req),
      status: 'error',
      error_message: error instanceof Error ? error.message : 'Unknown error'
    });

    throw error;
  }
}

// Helper method to extract tool name from request
private extractToolName(req: Request): string {
  try {
    const url = new URL(req.url);
    return url.pathname.split('/').pop() || 'unknown';
  } catch {
    return 'unknown';
  }
}

// Modify existing handle() method to check for multi-tenant mode
async handle(req: Request): Promise<Response> {
  const enableMultiTenant = process.env.ENABLE_MULTI_TENANT === 'true';

  if (enableMultiTenant) {
    return this.handleMultiTenantRequest(req);
  } else {
    // Existing single-tenant logic
    return this.handleMCPRequest(req, this.defaultContext);
  }
}
```

**Add to package.json dependencies:**
```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.39.0",
    "bcryptjs": "^2.4.3"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6"
  }
}
```

Install dependencies:
```bash
npm install @supabase/supabase-js bcryptjs
npm install -D @types/bcryptjs
```

---

### Day 4: Docker & Deployment Setup

#### 4.1 Create Production Docker Compose

**File:** `docker-compose.prod.yml`

```yaml
version: '3.8'

services:
  caddy:
    image: caddy:2-alpine
    container_name: n8n-mcp-caddy
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    networks:
      - n8n-mcp-network

  n8n-mcp:
    image: ghcr.io/czlonkowski/n8n-mcp:latest
    container_name: n8n-mcp-app
    restart: always
    environment:
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}
      - MASTER_ENCRYPTION_KEY=${MASTER_ENCRYPTION_KEY}
      - SESSION_SECRET=${SESSION_SECRET}
      - SESSION_PERSIST_PATH=/app/sessions
      - NODE_ENV=production
      - MCP_MODE=http
      - PORT=3000
      - ENABLE_MULTI_TENANT=true
      - RATE_LIMIT_REQUESTS=100
    volumes:
      - ./data/nodes.db:/app/data/nodes.db:ro
      - session_data:/app/sessions
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 10s
    networks:
      - n8n-mcp-network

volumes:
  caddy_data:
    driver: local
  caddy_config:
    driver: local
  session_data:
    driver: local

networks:
  n8n-mcp-network:
    driver: bridge
```

#### 4.2 Create Caddyfile

**File:** `Caddyfile`

```
# Caddy configuration for n8n-mcp
{
    # Global options
    email admin@n8n-mcp.com
}

api.n8n-mcp.com {
    # Reverse proxy to n8n-mcp container
    reverse_proxy n8n-mcp:3000 {
        # Health check
        health_uri /health
        health_interval 30s
        health_timeout 5s

        # Headers
        header_up Host {host}
        header_up X-Real-IP {remote}
        header_up X-Forwarded-For {remote}
        header_up X-Forwarded-Proto {scheme}
    }

    # Global rate limiting (per IP)
    rate_limit {
        zone dynamic {
            key {remote_host}
            events 100
            window 1m
        }
    }

    # Logging
    log {
        output file /var/log/caddy/access.log {
            roll_size 100mb
            roll_keep 5
        }
        format json
    }

    # Error pages
    handle_errors {
        respond "{err.status_code} {err.status_text}"
    }
}
```

#### 4.3 Create Dockerfile (if not exists)

**File:** `Dockerfile`

```dockerfile
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY src ./src
COPY data ./data

# Build
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/data ./data

# Create session directory
RUN mkdir -p /app/sessions && chown -R node:node /app/sessions

# Use non-root user
USER node

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

#### 4.4 Create Deployment Script

**File:** `scripts/deploy.sh`

```bash
#!/bin/bash
set -e

echo "🚀 Deploying n8n-mcp to production..."

# Build Docker image
echo "📦 Building Docker image..."
docker build -t ghcr.io/czlonkowski/n8n-mcp:latest .

# Push to registry (optional)
# docker push ghcr.io/czlonkowski/n8n-mcp:latest

# Pull latest image on server
echo "⬇️  Pulling latest image..."
docker compose -f docker-compose.prod.yml pull

# Stop containers
echo "🛑 Stopping containers..."
docker compose -f docker-compose.prod.yml down

# Start containers
echo "▶️  Starting containers..."
docker compose -f docker-compose.prod.yml up -d

# Wait for health check
echo "🏥 Waiting for health check..."
sleep 10

# Verify
echo "✅ Verifying deployment..."
curl -f https://api.n8n-mcp.com/health || {
    echo "❌ Health check failed!"
    docker compose -f docker-compose.prod.yml logs n8n-mcp
    exit 1
}

echo "✅ Deployment successful!"
```

Make executable:
```bash
chmod +x scripts/deploy.sh
```

#### 4.5 Testing Multi-Tenant Locally

**Create test script:** `scripts/test-multi-tenant.sh`

```bash
#!/bin/bash

# Test multi-tenant API key authentication

API_URL="http://localhost:3000/mcp"
API_KEY="test-key-replace-with-real-key"

# Test 1: Health check (no auth needed)
echo "Test 1: Health check..."
curl -s http://localhost:3000/health
echo ""

# Test 2: Request without auth (should fail)
echo "Test 2: No auth (should fail)..."
curl -s -w "\nHTTP Status: %{http_code}\n" \
    -X POST $API_URL \
    -H "Content-Type: application/json"
echo ""

# Test 3: Request with invalid key (should fail)
echo "Test 3: Invalid key (should fail)..."
curl -s -w "\nHTTP Status: %{http_code}\n" \
    -X POST $API_URL \
    -H "Authorization: Bearer invalid-key" \
    -H "Content-Type: application/json"
echo ""

# Test 4: Valid request (should succeed)
echo "Test 4: Valid key (should succeed)..."
curl -s -w "\nHTTP Status: %{http_code}\n" \
    -X POST $API_URL \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
      "jsonrpc": "2.0",
      "id": 1,
      "method": "tools/list"
    }'
echo ""

# Test 5: Rate limiting (send 101 requests)
echo "Test 5: Rate limiting (101 requests)..."
for i in {1..101}; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST $API_URL \
        -H "Authorization: Bearer $API_KEY" \
        -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')

    if [ "$STATUS" == "429" ]; then
        echo "✅ Rate limited at request $i"
        break
    fi
done
```

---

## Phase 2: Frontend Implementation

**Goal:** User dashboard for signup, API key management, n8n config
**Time:** 5 days
**Assignee:** Frontend developer

### Day 5-6: Authentication & Setup

#### 5.1 Setup Supabase in Next.js

**Install dependencies:**
```bash
cd ../n8n-mcp-landing
npm install @supabase/ssr @supabase/supabase-js
```

**Create environment file:** `.env.local`
```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxxxx
```

#### 5.2 Create Supabase Client Utils

**File:** `src/lib/supabase/client.ts`

```typescript
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

**File:** `src/lib/supabase/server.ts`

```typescript
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch (error) {
            // Handle error
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch (error) {
            // Handle error
          }
        },
      },
    }
  );
}
```

#### 5.3 Create Middleware for Auth Protection

**File:** `src/middleware.ts`

```typescript
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value: '',
            ...options,
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protect dashboard routes
  if (request.nextUrl.pathname.startsWith('/dashboard') && !user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Redirect to dashboard if already logged in
  if ((request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup') && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/signup'],
};
```

#### 5.4 Create Authentication Pages

**File:** `src/app/(auth)/signup/page.tsx`

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    const supabase = createClient();

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
    } else {
      setMessage('Check your email for the confirmation link!');
    }

    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-8 p-8">
        <div>
          <h2 className="text-3xl font-bold">Sign up for n8n-mcp</h2>
          <p className="mt-2 text-sm text-gray-600">
            Join 471 users already building AI workflows
          </p>
        </div>

        <form onSubmit={handleSignup} className="space-y-6">
          <div>
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="mt-1 text-xs text-gray-500">
              Must be at least 8 characters
            </p>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-4 text-sm text-red-800">
              {error}
            </div>
          )}

          {message && (
            <div className="rounded-md bg-green-50 p-4 text-sm text-green-800">
              {message}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing up...' : 'Sign up'}
          </Button>
        </form>

        <div className="text-center text-sm">
          Already have an account?{' '}
          <a href="/login" className="font-medium text-blue-600 hover:underline">
            Log in
          </a>
        </div>
      </div>
    </div>
  );
}
```

**File:** `src/app/(auth)/login/page.tsx`

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push('/dashboard');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-8 p-8">
        <div>
          <h2 className="text-3xl font-bold">Welcome back</h2>
          <p className="mt-2 text-sm text-gray-600">
            Log in to access your n8n-mcp dashboard
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-4 text-sm text-red-800">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Logging in...' : 'Log in'}
          </Button>
        </form>

        <div className="text-center text-sm">
          Don't have an account?{' '}
          <a href="/signup" className="font-medium text-blue-600 hover:underline">
            Sign up
          </a>
        </div>
      </div>
    </div>
  );
}
```

**File:** `src/app/auth/callback/route.ts`

```typescript
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
```

---

### Day 7-8: Dashboard Implementation

#### 7.1 Create Dashboard Layout

**File:** `src/app/(dashboard)/layout.tsx`

```typescript
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  async function signOut() {
    'use server';
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect('/');
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-gray-50 p-6">
        <h1 className="text-xl font-bold mb-8">n8n-mcp</h1>

        <nav className="space-y-2">
          <Link
            href="/dashboard"
            className="block px-4 py-2 rounded hover:bg-gray-100"
          >
            Dashboard
          </Link>
          <Link
            href="/dashboard/api-keys"
            className="block px-4 py-2 rounded hover:bg-gray-100"
          >
            API Keys
          </Link>
          <Link
            href="/dashboard/n8n-config"
            className="block px-4 py-2 rounded hover:bg-gray-100"
          >
            n8n Configuration
          </Link>
          <Link
            href="/dashboard/usage"
            className="block px-4 py-2 rounded hover:bg-gray-100"
          >
            Usage
          </Link>
        </nav>

        <div className="mt-auto pt-8">
          <p className="text-sm text-gray-600 mb-2">{user.email}</p>
          <form action={signOut}>
            <button className="text-sm text-red-600 hover:underline">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
```

#### 7.2 Dashboard Overview Page

**File:** `src/app/(dashboard)/dashboard/page.tsx`

```typescript
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch stats
  const { count: apiKeyCount } = await supabase
    .from('api_keys')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user!.id)
    .eq('is_active', true);

  const { count: usageCount } = await supabase
    .from('usage_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user!.id);

  const { data: n8nInstance } = await supabase
    .from('n8n_instances')
    .select('instance_url, is_active')
    .eq('user_id', user!.id)
    .single();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-gray-600 mt-2">
          Welcome to your n8n-mcp control panel
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6">
          <h3 className="text-sm font-medium text-gray-600">API Keys</h3>
          <p className="text-3xl font-bold mt-2">{apiKeyCount || 0}</p>
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-medium text-gray-600">Requests Today</h3>
          <p className="text-3xl font-bold mt-2">{usageCount || 0}</p>
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-medium text-gray-600">n8n Status</h3>
          <p className="text-3xl font-bold mt-2">
            {n8nInstance?.is_active ? '✅' : '❌'}
          </p>
        </Card>
      </div>

      {!n8nInstance && (
        <Card className="p-6 bg-yellow-50 border-yellow-200">
          <h3 className="font-semibold">⚠️ Action Required</h3>
          <p className="mt-2 text-sm">
            You need to configure your n8n instance before using the service.
          </p>
          <a
            href="/dashboard/n8n-config"
            className="mt-4 inline-block text-blue-600 hover:underline"
          >
            Configure n8n →
          </a>
        </Card>
      )}
    </div>
  );
}
```

#### 7.3 API Key Management Page

**File:** `src/app/(dashboard)/api-keys/page.tsx`

```typescript
import { createClient } from '@/lib/supabase/server';
import { ApiKeyList } from '@/components/api-key-list';
import { CreateApiKeyButton } from '@/components/create-api-key-button';

export default async function ApiKeysPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: apiKeys } = await supabase
    .from('api_keys')
    .select('*')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">API Keys</h1>
          <p className="text-gray-600 mt-2">
            Manage your n8n-mcp API keys for MCP clients
          </p>
        </div>
        <CreateApiKeyButton />
      </div>

      <ApiKeyList apiKeys={apiKeys || []} />
    </div>
  );
}
```

**File:** `src/components/create-api-key-button.tsx`

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { generateApiKey } from '@/app/(dashboard)/api-keys/actions';

export function CreateApiKeyButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);

  async function handleCreate() {
    setLoading(true);
    try {
      const result = await generateApiKey(name);
      setGeneratedKey(result.key);
    } catch (error) {
      alert('Failed to generate API key');
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setOpen(false);
    setName('');
    setGeneratedKey(null);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Create API Key</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create API Key</DialogTitle>
        </DialogHeader>

        {!generatedKey ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Key Name</Label>
              <Input
                id="name"
                placeholder="Claude Desktop"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">
                A friendly name to identify this key
              </p>
            </div>

            <Button
              onClick={handleCreate}
              disabled={!name || loading}
              className="w-full"
            >
              {loading ? 'Generating...' : 'Generate Key'}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded">
              <p className="text-sm font-semibold mb-2">
                ⚠️ Save this key securely!
              </p>
              <p className="text-xs text-gray-600">
                You won't be able to see it again.
              </p>
            </div>

            <div>
              <Label>Your API Key</Label>
              <div className="mt-2 p-3 bg-gray-100 rounded font-mono text-sm break-all">
                {generatedKey}
              </div>
            </div>

            <Button
              onClick={() => {
                navigator.clipboard.writeText(generatedKey);
                alert('Copied to clipboard!');
              }}
              variant="outline"
              className="w-full"
            >
              Copy to Clipboard
            </Button>

            <Button onClick={handleClose} className="w-full">
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

**File:** `src/app/(dashboard)/api-keys/actions.ts`

```typescript
'use server';

import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';

export async function generateApiKey(name: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error('Not authenticated');

  // Generate secure random key
  const key = crypto.randomBytes(32).toString('base64url');
  const fullKey = `nmcp_${key}`;
  const hash = await bcrypt.hash(fullKey, 10);
  const prefix = `nmcp_${key.substring(0, 8)}...`;

  // Store in database
  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      user_id: user.id,
      key_hash: hash,
      key_prefix: prefix,
      name: name,
    })
    .select()
    .single();

  if (error) throw error;

  revalidatePath('/dashboard/api-keys');

  return { key: fullKey, id: data.id };
}

export async function revokeApiKey(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('api_keys')
    .update({ is_active: false })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) throw error;

  revalidatePath('/dashboard/api-keys');
}
```

**File:** `src/components/api-key-list.tsx`

```typescript
'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { revokeApiKey } from '@/app/(dashboard)/api-keys/actions';

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
}

export function ApiKeyList({ apiKeys }: { apiKeys: ApiKey[] }) {
  async function handleRevoke(id: string) {
    if (confirm('Are you sure you want to revoke this API key?')) {
      await revokeApiKey(id);
    }
  }

  if (apiKeys.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-gray-600">No API keys yet. Create your first one!</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {apiKeys.map((key) => (
        <Card key={key.id} className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h3 className="font-semibold">{key.name}</h3>
              <p className="text-sm text-gray-600 font-mono mt-1">
                {key.key_prefix}
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Created: {new Date(key.created_at).toLocaleDateString()}
                {key.last_used_at && (
                  <> · Last used: {new Date(key.last_used_at).toLocaleString()}</>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {key.is_active ? (
                <span className="text-sm text-green-600">● Active</span>
              ) : (
                <span className="text-sm text-gray-400">● Revoked</span>
              )}
              {key.is_active && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRevoke(key.id)}
                >
                  Revoke
                </Button>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
```

#### 7.4 n8n Configuration Page

**File:** `src/app/(dashboard)/n8n-config/page.tsx`

```typescript
import { createClient } from '@/lib/supabase/server';
import { N8nConfigForm } from '@/components/n8n-config-form';

export default async function N8nConfigPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: instance } = await supabase
    .from('n8n_instances')
    .select('instance_url, is_active')
    .eq('user_id', user!.id)
    .single();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">n8n Configuration</h1>
        <p className="text-gray-600 mt-2">
          Connect your n8n instance to n8n-mcp
        </p>
      </div>

      <N8nConfigForm currentInstance={instance} />
    </div>
  );
}
```

**File:** `src/components/n8n-config-form.tsx`

```typescript
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { saveN8nConfig, testN8nConnection } from '@/app/(dashboard)/n8n-config/actions';

interface N8nConfigFormProps {
  currentInstance: {
    instance_url: string;
    is_active: boolean;
  } | null;
}

export function N8nConfigForm({ currentInstance }: N8nConfigFormProps) {
  const [instanceUrl, setInstanceUrl] = useState(
    currentInstance?.instance_url || ''
  );
  const [apiKey, setApiKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [error, setError] = useState('');

  async function handleTest() {
    setTesting(true);
    setError('');
    setTestResult(null);

    try {
      const result = await testN8nConnection(instanceUrl, apiKey);
      setTestResult('success');
    } catch (err) {
      setTestResult('error');
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError('');

    try {
      await saveN8nConfig(instanceUrl, apiKey);
      alert('Configuration saved successfully!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-6 max-w-2xl">
      <div className="space-y-6">
        <div>
          <Label htmlFor="instanceUrl">n8n Instance URL</Label>
          <Input
            id="instanceUrl"
            type="url"
            placeholder="https://your-n8n-instance.com"
            value={instanceUrl}
            onChange={(e) => setInstanceUrl(e.target.value)}
          />
          <p className="text-xs text-gray-500 mt-1">
            The URL of your n8n instance
          </p>
        </div>

        <div>
          <Label htmlFor="apiKey">n8n API Key</Label>
          <Input
            id="apiKey"
            type="password"
            placeholder="Enter your n8n API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <p className="text-xs text-gray-500 mt-1">
            Find this in your n8n Settings → API
          </p>
        </div>

        {testResult && (
          <div
            className={`p-4 rounded ${
              testResult === 'success'
                ? 'bg-green-50 text-green-800'
                : 'bg-red-50 text-red-800'
            }`}
          >
            {testResult === 'success' ? '✅ Connection successful!' : `❌ ${error}`}
          </div>
        )}

        <div className="flex gap-4">
          <Button
            onClick={handleTest}
            disabled={!instanceUrl || !apiKey || testing}
            variant="outline"
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </Button>

          <Button
            onClick={handleSave}
            disabled={!instanceUrl || !apiKey || saving || testResult !== 'success'}
          >
            {saving ? 'Saving...' : 'Save Configuration'}
          </Button>
        </div>

        {currentInstance && (
          <div className="pt-4 border-t">
            <p className="text-sm text-gray-600">
              Current instance:{' '}
              <span className="font-mono">{currentInstance.instance_url}</span>
              <span className="ml-2">
                {currentInstance.is_active ? '✅ Active' : '❌ Inactive'}
              </span>
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
```

**File:** `src/app/(dashboard)/n8n-config/actions.ts`

```typescript
'use server';

import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';

// Simplified encryption (in production, use the backend's encryption)
function encrypt(text: string, userId: string): string {
  // This is placeholder - in production, this should match backend encryption
  // For MVP, we'll use a simple base64 encoding as Supabase will be our secure storage
  return Buffer.from(text).toString('base64');
}

export async function testN8nConnection(
  instanceUrl: string,
  apiKey: string
): Promise<boolean> {
  try {
    const response = await fetch(`${instanceUrl}/api/v1/workflows`, {
      headers: {
        'X-N8N-API-KEY': apiKey,
      },
    });

    if (!response.ok) {
      throw new Error('Invalid credentials or instance URL');
    }

    return true;
  } catch (error) {
    throw new Error('Failed to connect to n8n instance');
  }
}

export async function saveN8nConfig(
  instanceUrl: string,
  apiKey: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error('Not authenticated');

  // Test connection first
  await testN8nConnection(instanceUrl, apiKey);

  // Encrypt API key (simplified for MVP)
  const encryptedKey = encrypt(apiKey, user.id);

  // Upsert configuration
  const { error } = await supabase.from('n8n_instances').upsert(
    {
      user_id: user.id,
      instance_url: instanceUrl,
      api_key_encrypted: encryptedKey,
      is_active: true,
      last_validated_at: new Date().toISOString(),
    },
    {
      onConflict: 'user_id,instance_url',
    }
  );

  if (error) throw error;
}
```

---

### Day 9: Polish & Deployment

#### 9.1 Add Usage Stats Page

**File:** `src/app/(dashboard)/usage/page.tsx`

```typescript
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';

export default async function UsagePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Get recent usage
  const { data: recentLogs } = await supabase
    .from('usage_logs')
    .select('tool_name, status, created_at')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(50);

  // Get stats
  const { count: totalRequests } = await supabase
    .from('usage_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user!.id);

  const { count: todayRequests } = await supabase
    .from('usage_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user!.id)
    .gte('created_at', new Date().toISOString().split('T')[0]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Usage Statistics</h1>
        <p className="text-gray-600 mt-2">
          Track your n8n-mcp API usage
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="text-sm font-medium text-gray-600">Total Requests</h3>
          <p className="text-3xl font-bold mt-2">{totalRequests || 0}</p>
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-medium text-gray-600">Today's Requests</h3>
          <p className="text-3xl font-bold mt-2">{todayRequests || 0}</p>
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="font-semibold mb-4">Recent Activity</h3>
        <div className="space-y-2">
          {recentLogs && recentLogs.length > 0 ? (
            recentLogs.map((log, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2 border-b last:border-0"
              >
                <span className="text-sm font-mono">{log.tool_name}</span>
                <div className="flex items-center gap-4">
                  <span
                    className={`text-sm ${
                      log.status === 'success'
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}
                  >
                    {log.status}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(log.created_at).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-600">No activity yet</p>
          )}
        </div>
      </Card>
    </div>
  );
}
```

#### 9.2 Deploy Frontend to Vercel

```bash
# In n8n-mcp-landing directory
cd ../n8n-mcp-landing

# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Deploy
vercel --prod

# Set environment variables in Vercel dashboard
# NEXT_PUBLIC_SUPABASE_URL
# NEXT_PUBLIC_SUPABASE_ANON_KEY
```

#### 9.3 Final Backend Build & Test

```bash
# In n8n-mcp directory
cd ../n8n-mcp

# Run all tests
npm test

# Type check
npm run typecheck

# Build
npm run build

# Test Docker build
docker build -t n8n-mcp:test .

# Test locally with docker-compose
docker-compose -f docker-compose.prod.yml up -d

# Verify
curl http://localhost:3000/health
```

---

## Phase 3: Testing & Launch

**Goal:** Test thoroughly and launch to 471 waitlist users
**Time:** 3 days
**Assignee:** All team members

### Day 10: Multi-User & Platform Testing

#### 10.1 Multi-User Testing

**Create 2+ test accounts:**

```bash
# Test User 1
Email: test1@example.com
n8n Instance: https://test-n8n-1.com
API Key: generated via dashboard

# Test User 2
Email: test2@example.com
n8n Instance: https://test-n8n-2.com
API Key: generated via dashboard
```

**Test isolation:**

1. User 1 creates API key
2. User 2 creates API key
3. Verify User 1 cannot see User 2's keys
4. Make MCP requests with both keys
5. Verify usage logs are isolated
6. Try User 1's key with User 2's data → should fail

**Checklist:**
- [ ] Users can only see their own API keys
- [ ] Users can only see their own n8n config
- [ ] Users can only see their own usage logs
- [ ] Cross-user API keys don't work
- [ ] Rate limiting works per user

#### 10.2 Platform Testing

**Test all MCP clients:**

**Claude Desktop:**
```json
// ~/Library/Application Support/Claude/claude_desktop_config.json (Mac)
// %APPDATA%\Claude\claude_desktop_config.json (Windows)
{
  "mcpServers": {
    "n8n-mcp": {
      "url": "https://api.n8n-mcp.com/mcp",
      "authentication": {
        "type": "bearer",
        "token": "nmcp_your_key_here"
      }
    }
  }
}
```

Test commands:
- "List n8n nodes"
- "Search for Slack nodes"
- "Get node info for HTTP Request"
- "Create a workflow with Webhook trigger"

**Cursor:**
```json
// ~/.cursor/mcp.json
{
  "servers": {
    "n8n-mcp": {
      "url": "https://api.n8n-mcp.com/mcp",
      "headers": {
        "Authorization": "Bearer nmcp_your_key_here"
      }
    }
  }
}
```

**Windsurf:**
```json
// Settings > MCP Servers
{
  "serverUrl": "https://api.n8n-mcp.com/mcp",
  "authToken": "nmcp_your_key_here"
}
```

**Checklist:**
- [ ] Claude Desktop connects successfully
- [ ] Cursor connects successfully
- [ ] Windsurf connects successfully
- [ ] All MCP tools work in each client
- [ ] Rate limiting headers appear
- [ ] Errors are descriptive

#### 10.3 Load Testing

**Install siege:**
```bash
brew install siege  # Mac
sudo apt install siege  # Linux
```

**Create test script:** `scripts/load-test.sh`

```bash
#!/bin/bash

API_URL="https://api.n8n-mcp.com/mcp"
API_KEY="nmcp_test_key"

# Create URLs file
cat > /tmp/urls.txt << EOF
$API_URL POST Content-Type: application/json
Authorization: Bearer $API_KEY
{"jsonrpc":"2.0","id":1,"method":"tools/list"}
EOF

# Run load test: 100 concurrent users, 1 minute
siege -c 100 -t 1M -f /tmp/urls.txt

# Expected results:
# - Availability: 100%
# - Response time: <500ms average
# - Some 429 rate limit responses (expected)
```

**Checklist:**
- [ ] Server handles 100 concurrent users
- [ ] Average response time <500ms
- [ ] No crashes or errors
- [ ] Rate limiting kicks in appropriately
- [ ] CPU usage <80%
- [ ] Memory usage <4GB

---

### Day 11: Documentation & Email Campaign

#### 11.1 Create User Documentation

**File:** `docs/user-guide.md`

```markdown
# n8n-mcp User Guide

## Getting Started

### 1. Sign Up

Visit https://www.n8n-mcp.com and click "Sign Up".
Enter your email and create a password.
Verify your email address.

### 2. Configure Your n8n Instance

1. Go to Dashboard → n8n Configuration
2. Enter your n8n instance URL (e.g., https://your-n8n.com)
3. Enter your n8n API key (find in n8n Settings → API)
4. Click "Test Connection"
5. Click "Save Configuration"

### 3. Create an API Key

1. Go to Dashboard → API Keys
2. Click "Create API Key"
3. Enter a name (e.g., "Claude Desktop")
4. Copy the generated key (you won't see it again!)

### 4. Configure Your MCP Client

#### Claude Desktop

File location:
- Mac: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Add this configuration:

\`\`\`json
{
  "mcpServers": {
    "n8n-mcp": {
      "url": "https://api.n8n-mcp.com/mcp",
      "authentication": {
        "type": "bearer",
        "token": "nmcp_your_key_here"
      }
    }
  }
}
\`\`\`

Restart Claude Desktop.

#### Cursor

File: `~/.cursor/mcp.json`

\`\`\`json
{
  "servers": {
    "n8n-mcp": {
      "url": "https://api.n8n-mcp.com/mcp",
      "headers": {
        "Authorization": "Bearer nmcp_your_key_here"
      }
    }
  }
}
\`\`\`

Restart Cursor.

## Usage

Try these commands:
- "List all n8n nodes"
- "Search for Slack nodes"
- "How do I use the HTTP Request node?"
- "Create a workflow that triggers on webhook"

## Troubleshooting

### "Unauthorized" Error
- Check your API key is correct
- Verify the key is active in your dashboard
- Ensure n8n instance is configured

### "Rate Limit Exceeded"
- Free tier: 100 requests/minute
- Wait 1 minute and try again
- Contact us for higher limits

### Connection Timeout
- Verify n8n instance is accessible
- Check your n8n API key is valid
- Test connection in dashboard

## Support

- Email: support@n8n-mcp.com
- Discord: [Join our community]
- GitHub: https://github.com/czlonkowski/n8n-mcp
```

#### 11.2 Create Email Templates

**Waitlist Invitation Email:**

```html
Subject: 🎉 You're invited to n8n-mcp hosted service!

Hi {{name}},

You're one of 471 users from our waitlist with early access to the hosted n8n-mcp service!

What is n8n-mcp?
Connect your n8n workflows to Claude, Cursor, Windsurf, and any MCP-compatible AI assistant.

Getting Started:
1. Sign up: https://www.n8n-mcp.com/signup?ref=waitlist
2. Configure your n8n instance
3. Generate an API key
4. Add to your MCP client
5. Start building AI-powered workflows!

Free for Waitlist Users:
✅ 100 requests/minute
✅ All MCP tools
✅ Community support
✅ No credit card required

Need help? Reply to this email or join our Discord.

Happy automating!
The n8n-mcp Team

---
Didn't sign up for the waitlist? Ignore this email.
```

#### 11.3 Prepare Launch Checklist

**File:** `docs/launch-checklist.md`

```markdown
# Launch Checklist

## Pre-Launch (Complete before sending emails)

### Infrastructure
- [ ] Production server running
- [ ] SSL certificates working
- [ ] DNS configured correctly
- [ ] Health endpoint responding
- [ ] Monitoring enabled

### Database
- [ ] Schema deployed
- [ ] RLS policies active
- [ ] Backups enabled
- [ ] Test data removed

### Backend
- [ ] Multi-tenant mode enabled
- [ ] API key validation working
- [ ] Rate limiting functional
- [ ] Encryption working
- [ ] All tests passing

### Frontend
- [ ] Deployed to production
- [ ] Auth flow working
- [ ] API key generation works
- [ ] n8n config saves correctly
- [ ] Usage stats displaying

### Testing
- [ ] Multi-user isolation verified
- [ ] All MCP clients tested
- [ ] Load test passed
- [ ] Security audit done

### Documentation
- [ ] User guide published
- [ ] Platform setup guides ready
- [ ] Troubleshooting docs complete
- [ ] Email templates ready

## Launch Day

### Morning
- [ ] Final smoke test
- [ ] Backup database
- [ ] Monitor logs
- [ ] Support email ready

### Soft Launch (First 50 users)
- [ ] Send email to first 50
- [ ] Monitor signups
- [ ] Watch for errors
- [ ] Respond to questions

### Full Launch (Next 421 users)
- [ ] Verify soft launch successful
- [ ] Send remaining emails
- [ ] Monitor onboarding funnel
- [ ] Track activation rate

## Post-Launch

### First 24 Hours
- [ ] Monitor error rates
- [ ] Check server resources
- [ ] Respond to support emails
- [ ] Fix critical bugs

### First Week
- [ ] Analyze usage patterns
- [ ] Collect user feedback
- [ ] Identify pain points
- [ ] Plan improvements
```

---

### Day 12: Launch!

#### 12.1 Pre-Launch Verification

```bash
# Run final checks
./scripts/pre-launch-check.sh
```

**File:** `scripts/pre-launch-check.sh`

```bash
#!/bin/bash

echo "🔍 Running pre-launch checks..."

# Check health endpoint
echo "1. Health check..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://api.n8n-mcp.com/health)
if [ "$STATUS" == "200" ]; then
  echo "✅ Health check passed"
else
  echo "❌ Health check failed: $STATUS"
  exit 1
fi

# Check SSL
echo "2. SSL certificate..."
openssl s_client -connect api.n8n-mcp.com:443 -servername api.n8n-mcp.com </dev/null 2>/dev/null | grep "Verify return code: 0"
if [ $? -eq 0 ]; then
  echo "✅ SSL valid"
else
  echo "❌ SSL invalid"
  exit 1
fi

# Check frontend
echo "3. Frontend check..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://www.n8n-mcp.com)
if [ "$STATUS" == "200" ]; then
  echo "✅ Frontend accessible"
else
  echo "❌ Frontend failed: $STATUS"
  exit 1
fi

# Check database connection
echo "4. Database check..."
# (Add Supabase connectivity test)

echo ""
echo "✅ All pre-launch checks passed!"
echo "Ready to launch! 🚀"
```

#### 12.2 Launch Procedure

**9:00 AM - Soft Launch (50 users)**

```bash
# Send to first 50 waitlist users
# Monitor: https://dashboard.n8n-mcp.com/analytics

# Watch logs
docker compose -f docker-compose.prod.yml logs -f n8n-mcp

# Monitor server
htop
```

**11:00 AM - Check Results**

Metrics to check:
- Signup rate: Target 70% (35/50)
- Activation rate: Target 60% (21/50)
- Error rate: Target <5%
- Support emails: Respond within 1 hour

**2:00 PM - Full Launch (421 users)**

If soft launch successful:
```bash
# Send to remaining waitlist
# Continue monitoring
```

#### 12.3 Monitoring During Launch

**Real-time monitoring:**

```bash
# Server resources
watch -n 5 'top -b -n 1 | head -20'

# Request rate
watch -n 5 'docker compose logs n8n-mcp | grep "POST /mcp" | tail -20'

# Error rate
watch -n 5 'docker compose logs n8n-mcp | grep "ERROR" | tail -10'

# Database connections
# Check Supabase dashboard
```

**Key metrics:**
- Server CPU: Should stay <60%
- Memory: Should stay <4GB
- Response time: Should be <500ms
- Error rate: Should be <2%

---

## Troubleshooting

### Common Issues

#### Issue 1: "Unauthorized" Errors

**Symptoms:**
- Users getting 401 errors
- API key validation failing

**Debug:**
```bash
# Check API key in database
# Via Supabase SQL Editor:
SELECT * FROM api_keys WHERE key_prefix LIKE 'nmcp_%';

# Check if user has n8n instance configured
SELECT * FROM n8n_instances WHERE user_id = 'xxx';

# Check backend logs
docker compose logs n8n-mcp | grep "validateApiKey"
```

**Solutions:**
- Verify API key was copied correctly
- Check n8n instance is configured
- Verify encryption key is set
- Test API key generation flow

#### Issue 2: Rate Limiting Too Aggressive

**Symptoms:**
- Users hitting rate limits quickly
- 429 errors frequent

**Debug:**
```bash
# Check rate limit settings
docker compose exec n8n-mcp env | grep RATE_LIMIT

# Check logs
docker compose logs n8n-mcp | grep "Rate limit exceeded"
```

**Solutions:**
```typescript
// Adjust in src/services/rate-limiter.ts
const rateLimiter = new RateLimiter(200, 60000); // Increase to 200/min

// Or set via environment
RATE_LIMIT_REQUESTS=200
```

#### Issue 3: n8n Connection Failures

**Symptoms:**
- "Failed to decrypt credentials"
- "n8n instance not accessible"

**Debug:**
```bash
# Test n8n connectivity
curl -H "X-N8N-API-KEY: xxx" https://user-n8n.com/api/v1/workflows

# Check encryption
# Verify MASTER_ENCRYPTION_KEY is set correctly
```

**Solutions:**
- Verify n8n instance is publicly accessible
- Check n8n API key is valid
- Test encryption/decryption manually
- Verify firewall rules

#### Issue 4: High Memory Usage

**Symptoms:**
- Server running out of memory
- Docker containers being killed

**Debug:**
```bash
# Check memory usage
docker stats

# Check session count
# Add logging to SessionManager
```

**Solutions:**
```typescript
// Reduce session TTL
const sessionManager = new SessionManager({
  maxSessions: 500,  // Reduce from 1000
  ttl: 1800000,  // 30 minutes instead of 1 hour
});

// Or add to server
# Upgrade to CPX41 (8 vCPU, 16GB) - €26/mo
```

#### Issue 5: Database Connection Errors

**Symptoms:**
- "Could not connect to Supabase"
- Queries timing out

**Debug:**
```bash
# Check Supabase dashboard
# Connection pooling status

# Check environment variables
docker compose exec n8n-mcp env | grep SUPABASE
```

**Solutions:**
- Verify SUPABASE_SERVICE_KEY is correct
- Check Supabase project is not paused
- Upgrade to Supabase Pro if hitting limits
- Add connection retry logic

### Debug Commands

**Check container status:**
```bash
docker compose ps
docker compose logs -f n8n-mcp
docker compose logs -f caddy
```

**Test API endpoint:**
```bash
# Health check
curl https://api.n8n-mcp.com/health

# Test with API key
curl -X POST https://api.n8n-mcp.com/mcp \
  -H "Authorization: Bearer nmcp_xxx" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

**Check database:**
```sql
-- Via Supabase SQL Editor

-- Count users
SELECT COUNT(*) FROM users;

-- Count active API keys
SELECT COUNT(*) FROM api_keys WHERE is_active = true;

-- Check recent usage
SELECT user_id, tool_name, status, created_at
FROM usage_logs
ORDER BY created_at DESC
LIMIT 20;

-- Find rate limited requests
SELECT user_id, COUNT(*) as rate_limited_count
FROM usage_logs
WHERE status = 'rate_limited'
AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY user_id
ORDER BY rate_limited_count DESC;
```

---

## Rollback Procedures

### Scenario 1: Critical Backend Bug

**If you need to rollback backend:**

```bash
# SSH to server
ssh root@your-server

# Stop containers
cd /opt/n8n-mcp
docker compose -f docker-compose.prod.yml down

# Revert to previous image
docker pull ghcr.io/czlonkowski/n8n-mcp:previous

# Update docker-compose to use previous image
# Or checkout previous git commit
git log  # Find previous working commit
git checkout <commit-hash>

# Redeploy
docker compose -f docker-compose.prod.yml up -d

# Verify
curl https://api.n8n-mcp.com/health
```

**Notify users:**
```
Subject: Brief Service Interruption

We experienced a technical issue and had to rollback to a previous version.
Service is now restored. We apologize for any inconvenience.
```

### Scenario 2: Database Schema Issue

**If schema migration causes issues:**

```sql
-- Via Supabase SQL Editor

-- Rollback last migration
BEGIN;

-- Drop new columns/tables (if added)
DROP TABLE IF EXISTS new_table;
ALTER TABLE existing_table DROP COLUMN IF EXISTS new_column;

-- Restore data from backup (if needed)
-- Contact Supabase support for restore

COMMIT;
```

### Scenario 3: Frontend Issue

**If frontend has bugs:**

```bash
# Rollback Vercel deployment
vercel rollback

# Or deploy previous version
git checkout <previous-commit>
vercel --prod
```

### Scenario 4: Complete Outage

**If entire service is down:**

1. **Immediate Actions:**
   - Post status update (Twitter, Discord)
   - Email all active users
   - Disable signup temporarily

2. **Investigation:**
```bash
# Check all services
docker compose ps
docker compose logs --tail=100

# Check server resources
htop
df -h

# Check Supabase status
# Visit Supabase dashboard
```

3. **Recovery:**
```bash
# Restart all services
docker compose -f docker-compose.prod.yml restart

# If that doesn't work, full redeploy
docker compose down
docker compose pull
docker compose up -d
```

4. **Post-mortem:**
   - Document what happened
   - Identify root cause
   - Implement fixes
   - Update runbook

---

## Success Metrics

### Week 1 Targets

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Signups | 300/471 (64%) | Supabase users table |
| Activation | 70% | Users with API key + n8n config |
| First MCP Call | 60% | Users with usage_logs entry |
| Error Rate | <2% | usage_logs WHERE status='error' |
| Support Response | <2 hours | Email metrics |

### Week 4 Targets

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Day 7 Retention | 40% | Active users 7 days after signup |
| Day 30 Retention | 25% | Active users after 30 days |
| Avg Requests/User/Day | >5 | usage_logs COUNT / users |
| Platform Distribution | Track | % Claude vs Cursor vs Windsurf |
| User Satisfaction | >4/5 | Survey after 7 days |

---

## Next Steps After MVP

### Post-MVP Release 1: Analytics (Weeks 5-6)

- Detailed usage dashboard
- Tool usage breakdown
- Performance metrics
- Error tracking (Sentry)

### Post-MVP Release 2: Paid Tiers (Weeks 7-10)

- Stripe integration
- Plan management
- Billing dashboard
- Upgrade/downgrade flows

### Post-MVP Release 3: Advanced Features (Weeks 11-12)

- Team collaboration
- Shared workflows
- API key rotation
- Custom alerts

---

**End of Implementation Guide**

This guide provides complete step-by-step instructions for implementing the n8n-mcp MVP in 2.5 weeks. Follow each phase carefully, test thoroughly, and launch with confidence!

For questions or issues during implementation:
- Check troubleshooting section
- Review existing code in n8n-mcp repo
- Consult MVP_DEPLOYMENT_PLAN_SIMPLIFIED.md

Good luck with your launch! 🚀