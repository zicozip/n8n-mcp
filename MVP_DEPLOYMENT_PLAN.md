# n8n-mcp Hosted Service: MVP Deployment Plan

**Project:** Multi-Tenant n8n-MCP Service on Hetzner
**Domain:** www.n8n-mcp.com (already owned)
**Goal:** Launch MVP to 471 waitlist users (free tier)
**Timeline:** 3-4 weeks to MVP launch
**Date:** 2025-10-11
**Version:** 3.0 - MVP Focus

---

## Executive Summary

### MVP Scope (Waitlist Launch - No Payments)

**What We're Building:**
- Multi-tenant n8n-mcp service hosted on Hetzner
- User authentication and dashboard (Supabase)
- API key management
- Per-user n8n instance configuration
- Support for Claude Desktop, Cursor, Windsurf, and all MCP clients
- Free tier for all 471 waitlist users

**What We're NOT Building (Post-MVP):**
- Stripe/payment integration (will add after learnings)
- Usage tracking analytics (basic only for MVP)
- Advanced rate limiting per plan (simple rate limit for MVP)
- Customer support portal (email support only for MVP)

### Critical Discovery: 70% Already Built!

**n8n-mcp analysis** revealed the codebase already has:
- ✅ `InstanceContext` pattern for per-user isolation
- ✅ LRU cache with TTL for API clients
- ✅ All 16 MCP tools context-aware
- ✅ HTTP header extraction for multi-tenant
- ✅ Session management with cleanup

**Implementation reduced from 15-20 days to 5-7 days!**

### Infrastructure Sizing (Telemetry-Based)

**Current Usage (600 DAU distributed):**
- Peak RPS: 116 max, 44 p99, 21 p95, 6.6 avg
- Concurrent users: 8 max, 4 p95, 2 avg
- Peak hours: 13:00-16:00 UTC

**MVP Launch Config (471 waitlist users):**
- 1x CPX31 (4 vCPU, 8GB RAM, 160GB) - €14.00/mo
- PostgreSQL Basic (2 vCPU, 4GB, 80GB) - €33.00/mo
- Load Balancer LB11 - €5.49/mo
- Object Storage 100GB - €2.00/mo
- **Total: €54.49/month (~€0.12/user)**

**Scale trigger:** Add 2nd app server when DAU > 800 or RPS > 30 sustained

### Timeline

| Week | Phase | Deliverable |
|------|-------|-------------|
| **Week 1** | Infrastructure + Multi-tenant backend | Working MCP service with API key auth |
| **Week 2** | Dashboard (Next.js 15 + Supabase) | User can sign up, create keys, configure n8n |
| **Week 3** | Integration + Testing | All platforms tested, waitlist invited |
| **Week 4** | Launch + Monitoring | MVP live, gathering feedback |

**Launch Date:** End of Week 4 (November 8, 2025 target)

---

## Repository Structure

### Separate Repositories (User Decision)

```
1. n8n-mcp (backend service)
   ├── Multi-tenant API key authentication
   ├── MCP server (HTTP Streamable only)
   ├── Docker Compose deployment
   └── Located: /Users/romualdczlonkowski/Pliki/n8n-mcp/n8n-mcp

2. n8n-mcp-landing (frontend web app)
   ├── Next.js 15 + Supabase + shadcn/ui
   ├── User dashboard and authentication
   ├── API key management UI
   └── Located: /Users/romualdczlonkowski/Pliki/n8n-mcp-landing
   └── Already using Next.js 15.3.4 ✅
```

**Rationale:** Separate repos allow independent deployments and users configure MCP clients via URLs anyway.

---

## Release Plan

### MVP (Week 1-4): Waitlist Launch

**Goal:** Get 471 waitlist users using hosted n8n-mcp service (free)

#### Backend (n8n-mcp service)

**What's Needed:**
1. **API Key Authentication** (2-3 days)
   - PostgreSQL connection for user data
   - API key validation middleware
   - Load per-user n8n credentials
   - **Discovery:** 70% already implemented via `InstanceContext`

2. **HTTP Streamable Only** (1 day)
   - Remove SSE transport code
   - Simplify to StreamableHTTP only
   - Update health checks

3. **Docker Compose Stack** (2 days)
   - Production docker-compose.yml (3 containers)
   - Nginx load balancer
   - Redis for sessions
   - Prometheus + Grafana monitoring
   - Zero-downtime deployment script

4. **Database Schema** (1 day)
   - Supabase PostgreSQL schema
   - Tables: users, api_keys, n8n_instances, usage_logs
   - RLS policies
   - Indexes for performance

**Total Backend:** 6-7 days

#### Frontend (n8n-mcp-landing)

**What's Needed:**
1. **Supabase Authentication** (2 days)
   - Email/password signup (no OAuth for MVP)
   - Email verification flow
   - Protected routes middleware
   - **Already Next.js 15 ✅**

2. **Dashboard Pages** (3-4 days)
   - Landing page update (redirect users to hosted service)
   - Dashboard overview
   - API key management (create, view, revoke)
   - n8n instance configuration form
   - Account settings
   - **Use existing shadcn/ui components ✅**

3. **Integration with Backend** (1 day)
   - Supabase client setup
   - RLS policies
   - Type generation from database

**Total Frontend:** 6-7 days

#### Infrastructure & DevOps

**What's Needed:**
1. **Hetzner Setup** (1 day)
   - Provision CPX31 + PostgreSQL + LB
   - DNS configuration (www + api subdomains)
   - SSL certificates (Let's Encrypt)

2. **CI/CD Pipeline** (1 day)
   - GitHub Actions for backend
   - Docker build + push to GHCR
   - Automated deployment via SSH
   - Rollback procedure

**Total DevOps:** 2 days

#### Testing & Launch

**What's Needed:**
1. **Testing** (3 days)
   - Unit tests (authentication, multi-tenant isolation)
   - Integration tests (full user flow)
   - Platform testing (Claude, Cursor, Windsurf)
   - Load testing (simulate 471 users)

2. **Documentation** (2 days)
   - User onboarding guide
   - Platform-specific setup guides
   - Troubleshooting docs
   - Admin playbook

3. **Waitlist Invitation** (1 day)
   - Email campaign to 471 users
   - Onboarding support
   - Feedback collection

**Total Testing:** 6 days

### Post-MVP Release 1 (Week 5-6): Usage Analytics

**Goal:** Understand how users are using the service

**Features:**
- Usage tracking dashboard (requests per hour/day)
- Tool usage analytics (which MCP tools most popular)
- User engagement metrics (DAU, WAU, retention)
- Error tracking (Sentry integration)

**Estimate:** 1-2 weeks

### Post-MVP Release 2 (Week 7-10): Paid Tiers

**Goal:** Start generating revenue from power users

**Features:**
- Stripe integration (Pro + Enterprise tiers)
- Plan limits enforcement (rate limiting per plan)
- Upgrade/downgrade flows
- Billing dashboard
- Customer portal

**Estimate:** 3-4 weeks

### Post-MVP Release 3 (Week 11-12): Advanced Features

**Goal:** Differentiate from self-hosted

**Features:**
- Shared workflow templates (community)
- Team collaboration (multiple users per account)
- API key rotation automation
- Advanced monitoring (custom alerts)
- Priority support ticketing

**Estimate:** 2 weeks

---

## MVP Technical Architecture

### 1. Backend Architecture (n8n-mcp)

#### Multi-Tenant Flow

```
User Request with Bearer Token
  ↓
[Nginx Load Balancer]
  ↓
[API Key Validation Middleware]
  ├─> Query PostgreSQL for api_key
  ├─> Load user's n8n credentials
  └─> Create InstanceContext
  ↓
[MCP Tool Handler] (existing code!)
  ├─> getN8nApiClient(context)
  └─> Uses LRU cache (80%+ hit rate)
  ↓
[User's n8n Instance]
  ↓
[Response to User]
```

#### Docker Compose Stack

```yaml
services:
  nginx:
    - Load balancing (least_conn)
    - Rate limiting (global)
    - Health checks
    - WebSocket support

  mcp-app-1, mcp-app-2, mcp-app-3:
    - n8n-mcp containers (HTTP Streamable only)
    - Health checks every 30s
    - Graceful shutdown (SIGTERM)
    - Resource limits (2GB RAM, 1 CPU each)

  redis:
    - Session storage
    - Rate limit tracking
    - Persistence (AOF)

  prometheus:
    - Metrics collection
    - 30-day retention

  grafana:
    - Dashboards
    - Alerting
```

#### Files to Modify

**1. src/http-server-single-session.ts** (200 lines modified)
```typescript
// ADD: API key validation
async function validateApiKey(apiKey: string): Promise<UserContext> {
  const { data, error } = await supabase
    .from('api_keys')
    .select('user_id, n8n_instances(instance_url, api_key_encrypted)')
    .eq('key_hash', await bcrypt.hash(apiKey, 10))
    .eq('is_active', true)
    .single();

  if (error || !data) throw new UnauthorizedError();

  // Decrypt n8n API key
  const n8nApiKey = decrypt(data.n8n_instances.api_key_encrypted, data.user_id);

  return {
    user_id: data.user_id,
    n8n_url: data.n8n_instances.instance_url,
    n8n_api_key: n8nApiKey
  };
}

// MODIFY: Request handler
async handleRequest(req: Request): Promise<Response> {
  const apiKey = req.headers.get('Authorization')?.replace('Bearer ', '');
  const userContext = await validateApiKey(apiKey);

  // Create InstanceContext (existing pattern!)
  const context: InstanceContext = {
    n8nApiUrl: userContext.n8n_url,
    n8nApiKey: userContext.n8n_api_key
  };

  // Existing code handles the rest!
  return this.mcpServer.handleRequest(req, context);
}
```

**2. src/services/api-key-validator.ts** (NEW - 400 lines)
- PostgreSQL connection pooling
- bcrypt validation
- n8n credential decryption (AES-256-GCM)
- Rate limit checking
- Audit logging

**3. Remove SSE Transport** (1 day)
- Delete `src/http-server-single-session.ts` lines handling SSE
- Keep only StreamableHTTPServerTransport
- Update tests

**4. Database Connection**
```typescript
// NEW: src/services/database.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!, // Service role bypasses RLS
  {
    auth: { persistSession: false },
    db: { schema: 'public' }
  }
);
```

#### Environment Variables

```bash
# New for MVP
DATABASE_URL=postgresql://...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJxxx... # Service role key
AUTH_MODE=api_key # New mode
ENABLE_MULTI_TENANT=true
MASTER_ENCRYPTION_KEY=xxx # For n8n credentials

# Existing
NODE_ENV=production
MCP_MODE=http
PORT=3000
NODES_DB_PATH=/app/data/nodes.db
```

### 2. Frontend Architecture (n8n-mcp-landing)

#### Supabase Schema

```sql
-- Users table (extends auth.users)
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- API Keys table
CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL, -- For display: "nmcp_abc123..."
  name TEXT NOT NULL,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);

-- n8n Instance Configuration
CREATE TABLE public.n8n_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  instance_url TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL, -- Encrypted with per-user key
  is_active BOOLEAN DEFAULT TRUE,
  last_validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_instance UNIQUE(user_id, instance_url)
);

-- Usage tracking (basic for MVP)
CREATE TABLE public.usage_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id),
  api_key_id UUID REFERENCES public.api_keys(id),
  tool_name TEXT NOT NULL,
  status TEXT NOT NULL, -- 'success' | 'error' | 'rate_limited'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.n8n_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own data" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can manage own API keys" ON public.api_keys
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own n8n config" ON public.n8n_instances
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own usage" ON public.usage_logs
  FOR SELECT USING (auth.uid() = user_id);
```

#### Next.js 15 App Structure

```
src/app/
├── (auth)/
│   ├── login/page.tsx
│   ├── signup/page.tsx
│   └── verify-email/page.tsx
├── (dashboard)/
│   ├── dashboard/page.tsx      # Overview
│   ├── api-keys/page.tsx       # Create, view, revoke keys
│   ├── n8n-config/page.tsx     # Configure n8n instance
│   └── settings/page.tsx       # Account settings
├── api/
│   ├── auth/callback/route.ts  # Supabase auth callback
│   └── webhooks/
│       └── (future stripe webhook)
├── layout.tsx
├── page.tsx                    # Landing page (updated)
└── middleware.ts               # Auth protection

src/components/
├── api-key-card.tsx
├── n8n-config-form.tsx
├── usage-chart.tsx (basic for MVP)
└── ui/ (existing shadcn/ui)

src/lib/
├── supabase/
│   ├── client.ts               # Browser client
│   ├── server.ts               # Server client
│   └── middleware.ts           # Auth middleware
└── utils.ts (existing)
```

#### Key Components

**1. Authentication Setup**

```typescript
// src/lib/supabase/middleware.ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => request.cookies.get(name)?.value,
        set: (name, value, options) => {
          response.cookies.set({ name, value, ...options });
        },
        remove: (name, options) => {
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Protected routes
  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return response;
}
```

**2. API Key Management**

```typescript
// src/app/(dashboard)/api-keys/page.tsx
'use server';

import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

export async function generateApiKey(name: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Generate secure key
  const key = crypto.randomBytes(32).toString('base64url');
  const fullKey = `nmcp_${key}`;
  const hash = await bcrypt.hash(fullKey, 10);
  const prefix = `nmcp_${key.substring(0, 8)}...`;

  // Store in database
  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      user_id: user!.id,
      key_hash: hash,
      key_prefix: prefix,
      name: name
    })
    .select()
    .single();

  return { key: fullKey, id: data.id }; // Show only once!
}
```

**3. n8n Configuration Form**

```typescript
// src/app/(dashboard)/n8n-config/page.tsx
'use server';

import { encrypt } from '@/lib/encryption';

export async function saveN8nConfig(
  instanceUrl: string,
  apiKey: string
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Test connection
  const response = await fetch(`${instanceUrl}/api/v1/workflows`, {
    headers: { 'X-N8N-API-KEY': apiKey }
  });

  if (!response.ok) {
    throw new Error('Invalid n8n credentials');
  }

  // Encrypt and store
  const encryptedKey = encrypt(apiKey, user!.id);

  await supabase.from('n8n_instances').upsert({
    user_id: user!.id,
    instance_url: instanceUrl,
    api_key_encrypted: encryptedKey,
    last_validated_at: new Date().toISOString()
  });
}
```

### 3. Infrastructure Setup

#### Hetzner Provisioning

```bash
# Via Hetzner Cloud Console
1. Create project "n8n-mcp-production"
2. Create CPX31 server (€14/mo)
   - Location: Falkenstein, Germany
   - Image: Ubuntu 22.04 LTS
   - SSH keys: Add your public key
3. Create Managed PostgreSQL Basic (€33/mo)
   - Version: PostgreSQL 15
   - Backups: Enabled
4. Create Load Balancer LB11 (€5.49/mo)
   - Algorithm: Least connections
   - Health checks: HTTP /health
5. Create Object Storage (€2/mo)
   - For backups and logs
```

#### DNS Configuration

```
A    www.n8n-mcp.com    → Load Balancer IP
A    api.n8n-mcp.com    → Load Balancer IP
TXT  _acme-challenge    → (for SSL verification)
```

#### Docker Compose Deployment

```bash
# On server
cd /opt
git clone https://github.com/czlonkowski/n8n-mcp.git
cd n8n-mcp

# Create secrets
mkdir -p secrets
echo "your-postgres-password" > secrets/postgres_password.txt
echo "your-master-encryption-key" > secrets/master_encryption_key.txt
chmod 600 secrets/*.txt

# Create .env
cat > .env << EOF
DATABASE_URL=postgresql://user:pass@postgres-host:5432/n8n_mcp
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJxxx...
AUTH_MODE=api_key
ENABLE_MULTI_TENANT=true
NODE_ENV=production
EOF

# Build and deploy
docker compose -f docker-compose.prod.yml up -d

# Verify
curl http://localhost:3000/health
```

#### Zero-Downtime Deployment

```bash
# Install docker-rollout plugin
curl -fsSL https://github.com/wowu/docker-rollout/releases/latest/download/docker-rollout \
  -o ~/.docker/cli-plugins/docker-rollout
chmod +x ~/.docker/cli-plugins/docker-rollout

# Deploy script (6x per day)
#!/bin/bash
# deploy.sh

set -e

echo "Building new image..."
docker build -t ghcr.io/czlonkowski/n8n-mcp:latest .
docker push ghcr.io/czlonkowski/n8n-mcp:latest

echo "Rolling update..."
docker rollout mcp-app-1 mcp-app-2 mcp-app-3

echo "Deployment complete!"
```

---

## MVP User Flow

### 1. User Signs Up (n8n-mcp-landing)

```
1. Visit www.n8n-mcp.com
2. Click "Get Started" (from waitlist email)
3. Sign up with email/password
4. Verify email (Supabase Auth link)
5. Redirected to dashboard
```

### 2. User Configures n8n Instance

```
1. Navigate to "n8n Configuration"
2. Enter n8n instance URL (e.g., https://my-n8n.com)
3. Enter n8n API key
4. Click "Test Connection"
   ├─> Backend validates credentials
   └─> Shows ✅ or ❌
5. Click "Save"
   ├─> Encrypt n8n API key
   └─> Store in PostgreSQL
```

### 3. User Creates API Key

```
1. Navigate to "API Keys"
2. Click "Create New Key"
3. Enter friendly name (e.g., "Claude Desktop")
4. Click "Generate"
5. Modal shows key ONCE:
   ┌──────────────────────────────────────┐
   │ Your API Key (save this securely!)   │
   │ nmcp_abc123def456ghi789jkl012mno345  │
   │ [Copy to Clipboard]                  │
   └──────────────────────────────────────┘
6. User copies key
7. Key hash stored in database
```

### 4. User Configures MCP Client

#### Claude Desktop

```json
// Settings > Connectors > Add Custom Connector
{
  "name": "n8n-mcp Hosted",
  "url": "https://api.n8n-mcp.com/mcp",
  "authentication": {
    "type": "bearer",
    "token": "nmcp_abc123def456ghi789jkl012mno345"
  }
}
```

#### Cursor

```json
// ~/.cursor/mcp.json
{
  "servers": {
    "n8n-mcp": {
      "url": "https://api.n8n-mcp.com/mcp",
      "headers": {
        "Authorization": "Bearer nmcp_abc123def456ghi789jkl012mno345"
      }
    }
  }
}
```

#### Windsurf

```json
// Settings > MCP Servers
{
  "serverUrl": "https://api.n8n-mcp.com/mcp",
  "authToken": "nmcp_abc123def456ghi789jkl012mno345"
}
```

### 5. User Tests Connection

```
1. Open MCP client (Claude/Cursor/Windsurf)
2. Type: "list n8n nodes"
3. MCP request flow:
   ┌─────────────────────────────────┐
   │ Client sends Bearer token       │
   └────────────┬────────────────────┘
                ▼
   ┌─────────────────────────────────┐
   │ Nginx routes to n8n-mcp         │
   └────────────┬────────────────────┘
                ▼
   ┌─────────────────────────────────┐
   │ Validate API key (PostgreSQL)   │
   └────────────┬────────────────────┘
                ▼
   ┌─────────────────────────────────┐
   │ Load user's n8n credentials     │
   └────────────┬────────────────────┘
                ▼
   ┌─────────────────────────────────┐
   │ Create InstanceContext          │
   └────────────┬────────────────────┘
                ▼
   ┌─────────────────────────────────┐
   │ Execute MCP tool (existing!)    │
   └────────────┬────────────────────┘
                ▼
   ┌─────────────────────────────────┐
   │ Return node list from nodes.db  │
   └─────────────────────────────────┘
4. User sees list of 536 n8n nodes
5. Success! ✅
```

---

## Landing Page Migration Strategy

### Current State

**www.n8n-mcp.com** (n8n-mcp-landing repo):
- Landing page with waitlist signup (471 users)
- Community videos
- Feature showcase
- GitHub link for installation

### MVP Changes

**Update Landing Page to Direct Users to Hosted Service:**

```typescript
// src/app/page.tsx - Update hero section

export default function HomePage() {
  return (
    <>
      <HeroSection>
        <h1>n8n-mcp: AI-Powered n8n Workflows</h1>
        <p>Use Claude, Cursor, Windsurf with your n8n workflows</p>

        {/* OLD: GitHub installation instructions */}
        {/* NEW: Sign up for hosted service */}

        <div className="cta-buttons">
          <Button href="/signup" size="lg">
            Start Using Now (Free)
          </Button>
          <Button href="/docs" variant="outline">
            View Documentation
          </Button>
        </div>

        <p className="text-sm text-muted">
          471 users from our waitlist already have access!
          No credit card required.
        </p>
      </HeroSection>

      <FeaturesSection>
        {/* Highlight hosted benefits */}
        <Feature icon="🚀">
          <h3>Instant Setup</h3>
          <p>No installation needed. Sign up and start using in 5 minutes.</p>
        </Feature>

        <Feature icon="🔒">
          <h3>Secure & Private</h3>
          <p>Your n8n credentials encrypted. Your workflows stay in your instance.</p>
        </Feature>

        <Feature icon="🌍">
          <h3>All MCP Clients</h3>
          <p>Works with Claude Desktop, Cursor, Windsurf, and more.</p>
        </Feature>

        <Feature icon="💬">
          <h3>Community Support</h3>
          <p>Join 471 users already building AI workflows.</p>
        </Feature>
      </FeaturesSection>

      {/* Keep existing community videos */}
      <CommunityVideosSection />

      {/* Add: Self-hosting still available */}
      <SelfHostingSection>
        <h2>Prefer Self-Hosting?</h2>
        <p>
          n8n-mcp is open source. You can still install it locally.
          <a href="https://github.com/czlonkowski/n8n-mcp">
            View on GitHub →
          </a>
        </p>
      </SelfHostingSection>
    </>
  );
}
```

### Migration Steps

1. **Keep existing landing page** (don't break links)
2. **Add signup flow** (new routes: /signup, /login)
3. **Add dashboard** (new routes: /dashboard/*)
4. **Update hero CTA** from "Install" to "Sign Up"
5. **Keep GitHub link** in footer (for self-hosters)
6. **Add "How It Works"** section explaining hosted service

### Content Updates

**Before (self-hosted focus):**
> "Install n8n-mcp and connect your n8n instance to Claude Desktop."

**After (hosted service focus):**
> "Connect your n8n instance to Claude, Cursor, Windsurf in 5 minutes. No installation needed."

**Keep both options visible:**
- Primary CTA: "Start Using Now" → /signup
- Secondary: "Self-Host" → GitHub

---

## MVP Success Metrics

### Week 1-2: Alpha Testing (Internal)

| Metric | Target |
|--------|--------|
| Backend deployed | ✅ |
| Frontend deployed | ✅ |
| Internal testing complete | 10 test users |
| All platforms tested | Claude, Cursor, Windsurf |
| Zero critical bugs | 0 P0 issues |

### Week 3-4: Beta Launch (Waitlist)

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Signups** | 300/471 (64%) | First 2 weeks |
| **Activation** | 70% | Users who configure n8n + create key |
| **First MCP Call** | 60% | Users who make ≥1 MCP request |
| **Day 7 Retention** | 40% | Active 7 days after signup |
| **Platform Distribution** | - | % Claude vs Cursor vs Windsurf |

### Operational Metrics (Ongoing)

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| **Uptime** | 99%+ | < 99% in 24h |
| **Response Time (p95)** | <500ms | >800ms for 5min |
| **Error Rate** | <1% | >2% for 5min |
| **Database Queries** | <50ms p95 | >100ms for 5min |
| **API Key Validation** | <20ms | >50ms |

### User Feedback Collection

**Methods:**
1. In-app feedback form (dashboard)
2. Email survey after 7 days
3. Weekly office hours (optional)
4. Discord/Slack community (existing?)

**Key Questions:**
- How easy was setup? (1-5 scale)
- Which MCP client do you use?
- What workflows are you building?
- Would you pay for this? How much?
- What features do you need?

---

## Post-MVP: Learnings → Paid Tiers

### Hypothesis to Test

**Assumption:** Users will pay for higher rate limits and priority support.

**Data to Collect:**
- Average requests per user per day
- Peak usage times
- Most-used MCP tools
- Churn reasons (if users stop)
- Feature requests frequency

### Pricing Strategy (Post-MVP)

Based on learnings, implement:

```
Free Tier (Waitlist - MVP)
├─ 600 requests/hour (10/min)
├─ 10k requests/day
├─ 2 API keys
└─ Community support

Pro Tier (~€10/month)
├─ 6,000 requests/hour (100/min)
├─ 100k requests/day
├─ 10 API keys
├─ Email support (24h response)
└─ Workflow sharing (future)

Enterprise Tier (Custom)
├─ Unlimited requests
├─ Unlimited API keys
├─ Dedicated support
├─ SLA guarantee
└─ Custom integrations
```

### When to Add Payments

**Criteria:**
1. ✅ 200+ active users (DAU)
2. ✅ 80%+ satisfaction score
3. ✅ <5% churn rate
4. ✅ Clear value proposition validated
5. ✅ User requests for paid features

**Timeline:** 4-6 weeks after MVP launch

---

## Risk Assessment

### Technical Risks

**RISK-01: Multi-tenant isolation failure**
- **Impact:** User A accesses User B's data
- **Likelihood:** Low (RLS policies + validation)
- **Mitigation:**
  - Comprehensive testing with 2+ test users
  - Audit logs for all API key validations
  - Automated tests for RLS policies

**RISK-02: n8n credential leakage**
- **Impact:** User's n8n instance compromised
- **Likelihood:** Low (AES-256-GCM encryption)
- **Mitigation:**
  - Encryption tested thoroughly
  - Master key rotation procedure documented
  - Monitor for unusual n8n API calls

**RISK-03: Database bottleneck**
- **Impact:** Slow response times, user frustration
- **Likelihood:** Medium (471 users hitting simultaneously)
- **Mitigation:**
  - Connection pooling (Supavisor)
  - Composite indexes on (user_id, created_at)
  - Cache API key lookups (Redis)

**RISK-04: Docker Compose limitations**
- **Impact:** Can't scale beyond single host
- **Likelihood:** Low (need >5k DAU to hit limits)
- **Mitigation:**
  - Document Kubernetes migration path
  - Re-evaluate at 2k DAU

### Business Risks

**RISK-05: Low waitlist conversion**
- **Impact:** <200/471 users sign up
- **Likelihood:** Medium (email list may be stale)
- **Mitigation:**
  - Send personalized invitations
  - Offer early bird benefits
  - Follow up with non-responders

**RISK-06: High churn**
- **Impact:** Users sign up but don't return
- **Likelihood:** Medium (setup friction, not enough value)
- **Mitigation:**
  - Optimize onboarding flow (measure drop-offs)
  - Email engagement campaigns
  - User interviews to understand blockers

**RISK-07: Insufficient value for paid tier**
- **Impact:** No one converts to paid (post-MVP)
- **Likelihood:** Medium (unknown willingness to pay)
- **Mitigation:**
  - Collect payment intent data during MVP
  - Survey users on pricing
  - Offer early bird discounts to validate pricing

### Operational Risks

**RISK-08: Overwhelmed by support**
- **Impact:** Can't keep up with 471 users' questions
- **Likelihood:** High (new users will have issues)
- **Mitigation:**
  - Comprehensive documentation
  - FAQ page
  - Community Discord/Slack
  - Automated onboarding emails

**RISK-09: Infrastructure costs exceed budget**
- **Impact:** €54.49/mo not enough at scale
- **Likelihood:** Low (telemetry shows headroom)
- **Mitigation:**
  - Monitor resource usage daily
  - Scale trigger: Add server when CPU >60%
  - Break-even: Only need 3.5 paying users post-MVP

---

## Timeline & Milestones

### Week 1: Backend Multi-Tenant + Infrastructure

**Days 1-2: Infrastructure Setup**
- [ ] Provision Hetzner CPX31 + PostgreSQL + Load Balancer
- [ ] Configure DNS (www + api subdomains)
- [ ] Set up SSL certificates (Let's Encrypt)
- [ ] Deploy monitoring (Prometheus + Grafana)

**Days 3-5: Multi-Tenant Backend**
- [ ] Implement API key validation (src/services/api-key-validator.ts)
- [ ] Modify HTTP server for multi-tenant (src/http-server-single-session.ts)
- [ ] Remove SSE transport code
- [ ] Add PostgreSQL connection (src/services/database.ts)
- [ ] Implement n8n credential decryption

**Days 6-7: Testing & Docker**
- [ ] Unit tests (authentication, validation)
- [ ] Integration tests (multi-user scenarios)
- [ ] Create docker-compose.prod.yml
- [ ] Test zero-downtime deployment

**Deliverable:** Working n8n-mcp service with API key authentication

### Week 2: Frontend Dashboard

**Days 1-2: Authentication**
- [ ] Set up Supabase project
- [ ] Implement email/password signup
- [ ] Email verification flow
- [ ] Protected routes middleware
- [ ] Login/logout flows

**Days 3-4: Dashboard Pages**
- [ ] Dashboard overview (basic stats)
- [ ] API key management page
  - Create new key
  - View existing keys
  - Revoke keys
- [ ] n8n configuration page
  - Form for URL + API key
  - Test connection button
  - Save (encrypted)

**Days 5-6: Polish & Integration**
- [ ] Account settings page
- [ ] Error handling and loading states
- [ ] Toast notifications (Sonner)
- [ ] Type generation from Supabase schema
- [ ] RLS policy testing

**Day 7: Deployment**
- [ ] Deploy frontend to Vercel or Hetzner
- [ ] Test full user flow (signup → API key → MCP call)
- [ ] Fix critical bugs

**Deliverable:** Functional dashboard where users can sign up and configure n8n-mcp

### Week 3: Integration Testing & Documentation

**Days 1-2: Platform Testing**
- [ ] Test Claude Desktop integration (Windows, Mac, Linux)
- [ ] Test Cursor integration
- [ ] Test Windsurf integration
- [ ] Test custom HTTP client (curl)
- [ ] Verify all 16 MCP tools work

**Days 3-4: Load Testing**
- [ ] Simulate 471 users
- [ ] Test peak load (116 RPS from telemetry)
- [ ] Verify rate limiting works
- [ ] Database query performance testing
- [ ] Fix performance bottlenecks

**Days 5-7: Documentation**
- [ ] User onboarding guide
  - How to sign up
  - How to configure n8n
  - How to create API keys
- [ ] Platform-specific setup guides
  - Claude Desktop step-by-step
  - Cursor step-by-step
  - Windsurf step-by-step
- [ ] Troubleshooting docs
  - Common errors
  - Debug steps
- [ ] Admin playbook
  - Deployment procedures
  - Rollback procedures
  - Incident response

**Deliverable:** Fully tested system with comprehensive documentation

### Week 4: Launch to Waitlist

**Days 1-2: Pre-Launch Prep**
- [ ] Final security audit
- [ ] Backup procedures tested
- [ ] Monitoring alerts configured (Slack)
- [ ] Status page set up (optional)
- [ ] Landing page updated (hosted service focus)

**Day 3: Soft Launch (50 users)**
- [ ] Email first 50 users from waitlist
- [ ] Monitor closely for issues
- [ ] Gather immediate feedback
- [ ] Fix critical bugs

**Days 4-5: Full Launch (471 users)**
- [ ] Email remaining 421 users
- [ ] Monitor onboarding funnel
- [ ] Respond to support questions
- [ ] Track activation rate

**Days 6-7: Post-Launch**
- [ ] Analyze metrics (signups, activation, retention)
- [ ] User interviews (5-10 users)
- [ ] Identify top pain points
- [ ] Plan Release 1 (analytics)

**Deliverable:** MVP live with 471 waitlist users invited

---

## Implementation Checklist

### Pre-Development

- [ ] Budget approved (€54.49/month for 4+ months)
- [ ] Team assignments clear (backend, frontend, devops)
- [ ] Accounts created:
  - [ ] Hetzner Cloud
  - [ ] Supabase
  - [ ] GitHub Container Registry (GHCR)
  - [ ] (Future) Stripe
- [ ] Development environment set up locally
- [ ] Access to n8n-mcp and n8n-mcp-landing repos

### Week 1 Checklist

**Infrastructure:**
- [ ] Hetzner CPX31 provisioned
- [ ] PostgreSQL Basic provisioned
- [ ] Load Balancer LB11 provisioned
- [ ] Object Storage provisioned
- [ ] DNS records created (www, api)
- [ ] SSL certificates obtained (Let's Encrypt)

**Backend:**
- [ ] `src/services/api-key-validator.ts` implemented
- [ ] `src/http-server-single-session.ts` modified for multi-tenant
- [ ] SSE transport code removed
- [ ] `src/services/database.ts` created
- [ ] n8n credential encryption implemented
- [ ] Unit tests written (80%+ coverage)
- [ ] Integration tests written
- [ ] docker-compose.prod.yml created
- [ ] Zero-downtime deployment script tested

**Verification:**
- [ ] Can authenticate with API key
- [ ] Multi-user isolation works (test with 2+ users)
- [ ] n8n credentials loaded correctly per user
- [ ] MCP tools work with InstanceContext
- [ ] Health checks pass
- [ ] Docker Compose deploys successfully

### Week 2 Checklist

**Supabase:**
- [ ] Supabase project created
- [ ] Database schema deployed (users, api_keys, n8n_instances, usage_logs)
- [ ] RLS policies enabled and tested
- [ ] Indexes created
- [ ] Email auth configured (SMTP)
- [ ] Email templates customized

**Frontend:**
- [ ] Authentication flow implemented (signup, login, logout)
- [ ] Email verification tested
- [ ] Protected routes middleware works
- [ ] Dashboard overview page
- [ ] API key management page (create, view, revoke)
- [ ] n8n configuration page (form, test, save)
- [ ] Account settings page
- [ ] Error handling and loading states
- [ ] Toast notifications working
- [ ] TypeScript types generated from Supabase

**Verification:**
- [ ] User can sign up and verify email
- [ ] User can create API key and see it once
- [ ] User can configure n8n instance (encrypted)
- [ ] User can revoke API key
- [ ] RLS policies prevent cross-user data access
- [ ] Frontend deployed (Vercel or Hetzner)

### Week 3 Checklist

**Testing:**
- [ ] Claude Desktop tested (Mac, Windows)
- [ ] Cursor tested
- [ ] Windsurf tested
- [ ] All 16 MCP tools tested
- [ ] Load test (471 users simulated)
- [ ] Database performance verified (<50ms p95)
- [ ] Rate limiting tested
- [ ] Error scenarios tested (invalid API key, invalid n8n creds, etc.)

**Documentation:**
- [ ] User onboarding guide written
- [ ] Platform setup guides written (Claude, Cursor, Windsurf)
- [ ] Troubleshooting docs written
- [ ] Admin playbook written
- [ ] API reference updated
- [ ] Landing page updated with hosted service info

**Verification:**
- [ ] End-to-end user flow works flawlessly
- [ ] Documentation is clear and comprehensive
- [ ] No critical bugs remaining
- [ ] Performance meets targets

### Week 4 Checklist

**Pre-Launch:**
- [ ] Security audit completed
- [ ] Backup procedures documented and tested
- [ ] Monitoring alerts configured
- [ ] Email templates for waitlist invitation
- [ ] Landing page updated (CTA to signup)
- [ ] Support email set up

**Launch:**
- [ ] Soft launch email sent (50 users)
- [ ] Monitoring onboarding metrics
- [ ] Support questions answered
- [ ] Critical bugs fixed
- [ ] Full launch email sent (421 users)

**Post-Launch:**
- [ ] Metrics analyzed (signups, activation, retention)
- [ ] User feedback collected (survey, interviews)
- [ ] Pain points identified
- [ ] Release 1 planned (analytics)

---

## Cost Summary

### MVP Development Costs

**Infrastructure (Monthly):**
- CPX31 (4 vCPU, 8GB): €14.00
- PostgreSQL Basic: €33.00
- Load Balancer LB11: €5.49
- Object Storage 100GB: €2.00
- **Total: €54.49/month**

**Cost per user:** €54.49 / 471 = **€0.12/user/month**

**4-month MVP period:** €54.49 × 4 = **€217.96**

**Development Time:**
- Backend: 7 days
- Frontend: 7 days
- Testing: 7 days
- Launch: 7 days
- **Total: 28 days (4 weeks)**

### Break-Even Analysis (Post-MVP)

**With Paid Tiers (Post-MVP Release 2):**

Assumptions:
- 10% convert to Pro (€10/month) = 47 users = €470/month
- 2% convert to Enterprise (€100/month avg) = 9 users = €900/month
- **Total revenue: €1,370/month**

Costs:
- Infrastructure: €54.49
- Stripe fees (3%): €41.10
- **Net profit: €1,274.51/month**

Break-even: 3.5 paying users = **Achieved at 1% conversion** ✅

---

## Next Steps

### Immediate Actions (Today)

1. **Review this MVP plan** - Confirm scope and timeline
2. **Assign team roles** - Backend, frontend, devops
3. **Create Hetzner account** - If not already done
4. **Create Supabase project** - Free tier for development
5. **Set up local development**:
   - Backend: n8n-mcp repo
   - Frontend: n8n-mcp-landing repo

### Week 1 Kick-off (Monday)

1. **Infrastructure setup** (Day 1)
   - Provision Hetzner resources
   - Configure DNS
   - Set up monitoring

2. **Start backend development** (Day 2)
   - Create branch: `feature/multi-tenant`
   - Begin API key validation implementation
   - Set up PostgreSQL connection

3. **Start frontend development** (Day 2)
   - Create branch: `feature/dashboard`
   - Set up Supabase authentication
   - Begin dashboard layout

### Questions to Answer

Before starting development:

1. **Team**
   - Who is responsible for backend?
   - Who is responsible for frontend?
   - Who is responsible for devops?
   - Do we need to hire contractors?

2. **Budget**
   - €54.49/month infrastructure approved?
   - Budget for 4+ months until revenue?

3. **Timeline**
   - 4-week MVP realistic?
   - Any external dependencies?
   - Hard deadlines?

4. **Scope**
   - MVP features confirmed?
   - Any must-haves missing?
   - Any nice-to-haves to remove?

---

## Conclusion

**MVP is achievable in 4 weeks** thanks to:
1. ✅ 70% multi-tenant code already exists (InstanceContext)
2. ✅ Landing page already on Next.js 15
3. ✅ Infrastructure sizing validated by telemetry (600 DAU baseline)
4. ✅ All technologies researched with production patterns

**Key Success Factors:**
- Focus ruthlessly on MVP scope (no scope creep!)
- Leverage existing code (InstanceContext pattern)
- Use proven patterns (Supabase + Next.js 15)
- Test with real users early (50-user soft launch)
- Gather feedback relentlessly

**After MVP:**
- Release 1: Usage analytics (1-2 weeks)
- Release 2: Paid tiers with Stripe (3-4 weeks)
- Release 3: Advanced features (2 weeks)

**Go/No-Go Decision:**

✅ **Proceed if:**
- Team capacity available (3-4 weeks full-time or 6-8 weeks part-time)
- Budget approved (€217.96 for 4 months)
- Commitment to post-launch support (monitoring, user support)

❌ **Delay if:**
- Team at capacity with other projects
- Uncertainty about maintaining hosted service long-term
- Budget constraints

---

**Document Version:** 3.0 - MVP Focus
**Last Updated:** 2025-10-11
**Next Review:** After Week 1 completion
**Owner:** n8n-mcp Team
