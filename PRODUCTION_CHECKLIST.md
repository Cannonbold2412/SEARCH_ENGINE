# CONXA Production Deployment Checklist

This checklist ensures a smooth and secure deployment of CONXA to production.

## Table of Contents
1. [Pre-Deployment Setup](#pre-deployment-setup)
2. [Environment Configuration](#environment-configuration)
3. [Database Setup](#database-setup)
4. [Deployment](#deployment)
5. [Post-Deployment Verification](#post-deployment-verification)
6. [Monitoring Setup](#monitoring-setup)
7. [Security Hardening](#security-hardening)

---

## Pre-Deployment Setup

### 1. Code Preparation
- [ ] All code changes merged to main branch
- [ ] CI/CD pipeline passing (all tests green)
- [ ] Version number updated in relevant files
- [ ] Documentation updated (README, API docs)
- [ ] Dependencies reviewed for security vulnerabilities
- [ ] Docker images built successfully locally

### 2. Account Setup
- [ ] Render.com account created (or preferred hosting provider)
- [ ] GitHub repository access configured
- [ ] External service accounts created:
  - [ ] Groq API account (or OpenAI)
  - [ ] Jina AI account (or alternative embeddings provider)
  - [ ] Twilio account (if using OTP)
  - [ ] SendGrid account (if using email verification)
  - [ ] Vapi account (if using voice features)

### 3. Domain & DNS
- [ ] Domain name purchased (optional)
- [ ] DNS records configured
- [ ] SSL/TLS certificate plan (Render provides free Let's Encrypt)

---

## Environment Configuration

### 1. Generate Secrets

Generate strong secrets for production:

```bash
# JWT Secret (256-bit random string)
openssl rand -base64 32

# Or use Python
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 2. Backend Environment Variables

Configure these in your Render dashboard or deployment platform:

#### Required Variables

```bash
# Database (Render auto-configures this)
DATABASE_URL=<provided-by-render>

# JWT Authentication (CRITICAL - must be unique)
JWT_SECRET=<generate-strong-secret-256-bit>

# LLM Chat Provider
CHAT_API_BASE_URL=https://api.groq.com/openai/v1
CHAT_API_KEY=<your-groq-api-key>
CHAT_MODEL=llama-3.3-70b-versatile

# Embedding Provider
EMBED_API_BASE_URL=https://api.jina.ai/v1
EMBED_API_KEY=<your-jina-api-key>
EMBED_MODEL=jina-embeddings-v3

# CORS (CRITICAL - set to your actual domain)
CORS_ORIGINS=https://your-frontend-domain.onrender.com
```

#### Optional Variables

```bash
# Rate Limiting (recommended)
AUTH_LOGIN_RATE_LIMIT=10/minute
AUTH_SIGNUP_RATE_LIMIT=5/minute
AUTH_VERIFY_RATE_LIMIT=10/minute

# OTP via Twilio (if enabled)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=<your-twilio-auth-token>
TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Email via SendGrid (if enabled)
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=no-reply@yourdomain.com
SENDGRID_FROM_NAME=CONXA
EMAIL_VERIFY_URL_BASE=https://your-frontend-domain.onrender.com/verify-email

# Voice via Vapi (if enabled)
VAPI_API_KEY=<your-vapi-api-key>

# Public API URL (for profile photos)
API_PUBLIC_URL=https://your-api-domain.onrender.com
```

### 3. Frontend Environment Variables

```bash
# API Base URL (points to your backend)
NEXT_PUBLIC_API_BASE_URL=https://your-api-domain.onrender.com

# Vapi Voice (if enabled)
NEXT_PUBLIC_VAPI_PUBLIC_KEY=<your-vapi-public-key>
NEXT_PUBLIC_VAPI_ASSISTANT_ID=<your-vapi-assistant-id>
```

### 4. Environment Variable Checklist

- [ ] All required environment variables set
- [ ] JWT_SECRET is unique and secure (not default value)
- [ ] CORS_ORIGINS set to actual frontend domain (not *)
- [ ] API keys validated and working
- [ ] No secrets committed to Git
- [ ] Backup copy of environment variables stored securely

---

## Database Setup

### 1. Database Provisioning

Using Render:
- [ ] PostgreSQL database created in Render dashboard
- [ ] Database plan selected (Free or Starter)
- [ ] Database URL noted (starts with `postgresql://...`)
- [ ] pgvector extension will be auto-installed on first migration

### 2. Database Configuration

- [ ] Connection pooling configured (if using paid tier)
- [ ] Backup schedule configured (if using paid tier)
- [ ] Database size limits understood

### 3. Migration Strategy

Migrations run automatically on container startup via:
```bash
alembic upgrade head
```

- [ ] Understand migration process
- [ ] Have rollback plan (database snapshot)
- [ ] Test migrations in staging environment first (if available)

---

## Deployment

### Using Render.com (Recommended)

#### 1. Initial Setup

1. **Connect Repository:**
   - [ ] Go to Render dashboard
   - [ ] Click "New" → "Blueprint"
   - [ ] Connect GitHub repository
   - [ ] Select branch (main)
   - [ ] Render will detect `render.yaml`

2. **Review Services:**
   - [ ] Database: `conxa-db` (PostgreSQL)
   - [ ] API: `conxa-api` (Docker)
   - [ ] Web: `conxa-web` (Docker)

3. **Configure Environment:**
   - [ ] Set all environment variables in Render dashboard
   - [ ] Generate JWT_SECRET in Render
   - [ ] Link database URL to API service

#### 2. Deploy

- [ ] Click "Apply" to deploy all services
- [ ] Wait for builds to complete (5-10 minutes)
- [ ] Monitor build logs for errors

#### 3. Deployment Checklist

- [ ] Database provisioned successfully
- [ ] API service deployed and healthy
- [ ] Web service deployed and healthy
- [ ] Health check passing: `https://your-api.onrender.com/health`
- [ ] API docs accessible: `https://your-api.onrender.com/docs`
- [ ] Frontend accessible: `https://your-web.onrender.com`

### Using Docker Compose (Self-Hosted)

If deploying to your own server:

```bash
# 1. Copy environment file
cp .env.docker.example .env

# 2. Edit .env with production values
nano .env

# 3. Build and start services
docker-compose up -d

# 4. Check logs
docker-compose logs -f

# 5. Run migrations (if needed)
docker-compose exec api alembic upgrade head
```

- [ ] Docker Compose configuration reviewed
- [ ] Production values set in .env
- [ ] Services running successfully
- [ ] Reverse proxy configured (Nginx/Caddy)
- [ ] SSL certificates configured

---

## Post-Deployment Verification

### 1. Health Checks

Test the following endpoints:

```bash
# API Health Check
curl https://your-api.onrender.com/health
# Expected: {"status":"ok","service":"conxa-api","database":"connected"}

# API Root
curl https://your-api.onrender.com/
# Expected: JSON with service info

# API Docs
curl https://your-api.onrender.com/docs
# Expected: HTML swagger docs
```

- [ ] API health check returns 200 OK
- [ ] Database status shows "connected"
- [ ] API documentation accessible

### 2. Authentication Flow

Test user authentication:

- [ ] Sign up with new email
- [ ] Email verification works (if enabled)
- [ ] Login with credentials
- [ ] JWT token received
- [ ] Protected endpoints require authentication
- [ ] Token refresh works

### 3. Core Functionality

Test critical user flows:

#### Builder Flow
- [ ] User can describe experience (text input)
- [ ] LLM processes input successfully
- [ ] Experience cards created
- [ ] Cards saved to database
- [ ] Cards visible in profile

#### Search Flow
- [ ] User can perform search with natural language
- [ ] Search results returned
- [ ] Results ranked appropriately
- [ ] "Why matched" explanations generated
- [ ] Credits deducted correctly

#### Contact Unlock
- [ ] User can unlock contact details
- [ ] Credits deducted
- [ ] Contact info revealed
- [ ] Idempotency works (no double charge)

### 4. Performance Testing

- [ ] Page load times acceptable (<3s)
- [ ] API response times acceptable (<2s for most endpoints)
- [ ] Database queries optimized
- [ ] No obvious memory leaks (monitor for 24 hours)

### 5. Frontend Verification

- [ ] All pages load correctly
- [ ] Navigation works
- [ ] Forms submit successfully
- [ ] Error messages display properly
- [ ] Responsive design works on mobile
- [ ] Browser console has no critical errors

---

## Monitoring Setup

### 1. Error Tracking

**Sentry (Recommended):**

1. Create Sentry account: https://sentry.io
2. Create new project for backend and frontend
3. Add to backend `requirements.txt`:
   ```
   sentry-sdk[fastapi]>=1.40.0
   ```
4. Configure in `src/main.py`:
   ```python
   import sentry_sdk
   sentry_sdk.init(
       dsn=os.getenv("SENTRY_DSN"),
       traces_sample_rate=0.1,
       environment="production"
   )
   ```

- [ ] Sentry account created
- [ ] Sentry DSN added to environment variables
- [ ] Test error tracking (trigger test error)
- [ ] Error notifications configured

### 2. Logging

- [ ] Structured logging configured
- [ ] Log retention policy set
- [ ] Critical errors send alerts
- [ ] Log levels appropriate (INFO in prod, DEBUG in dev)

### 3. Uptime Monitoring

Free options:
- UptimeRobot: https://uptimerobot.com
- StatusCake: https://www.statuscake.com
- Render built-in health checks

- [ ] Uptime monitoring service configured
- [ ] Monitor `/health` endpoint every 5 minutes
- [ ] Alert on downtime (email/SMS)
- [ ] Status page created (optional)

### 4. Performance Monitoring (Optional)

- [ ] APM tool selected (Datadog, New Relic, Scout)
- [ ] Slow query alerts configured
- [ ] Memory usage monitored
- [ ] CPU usage monitored

---

## Security Hardening

### 1. Secrets Management

- [ ] All secrets stored in Render's secret management (not in code)
- [ ] JWT_SECRET is strong and unique
- [ ] API keys rotated from default values
- [ ] Database password is strong
- [ ] No secrets in Git history (verify with `git log -p | grep -i password`)

### 2. CORS Configuration

**CRITICAL:** Update CORS in production:

```python
# ❌ NEVER use in production with credentials
CORS_ORIGINS=*

# ✅ Use explicit origins
CORS_ORIGINS=https://your-frontend.onrender.com,https://yourdomain.com
```

- [ ] CORS_ORIGINS set to explicit domain(s)
- [ ] Wildcard `*` removed for production
- [ ] Test CORS from actual frontend domain

### 3. Rate Limiting

Current setup uses in-memory rate limiting (SlowAPI). For production:

**Recommended:** Upgrade to Redis-backed rate limiting
- [ ] Redis instance provisioned (Render or external)
- [ ] Rate limiting backend switched to Redis
- [ ] Test rate limits working across multiple instances

**Current Setup:**
- [ ] Rate limits configured appropriately
- [ ] Auth endpoints have stricter limits
- [ ] Search endpoints have reasonable limits

### 4. Database Security

- [ ] Database has strong password
- [ ] Database not publicly accessible (Render handles this)
- [ ] Connection uses SSL/TLS
- [ ] SQL injection prevented (SQLAlchemy parameterized queries)

### 5. API Security

- [ ] HTTPS enforced (redirect HTTP → HTTPS)
- [ ] Security headers configured:
  ```python
  # Add to main.py
  from fastapi.middleware.trustedhost import TrustedHostMiddleware
  app.add_middleware(TrustedHostMiddleware, allowed_hosts=["your-domain.com"])
  ```
- [ ] API versioning strategy in place
- [ ] Input validation comprehensive (Pydantic schemas)

### 6. Dependency Security

- [ ] Run security audit on dependencies:
  ```bash
  # Backend
  pip install safety
  safety check

  # Frontend
  pnpm audit
  ```
- [ ] Update vulnerable packages
- [ ] Set up automated dependency scanning (GitHub Dependabot)

---

## Backup & Disaster Recovery

### 1. Database Backups

**Render (Paid Tiers):**
- [ ] Daily backups enabled
- [ ] Backup retention policy set (30 days recommended)
- [ ] Test restore process

**Self-Hosted:**
- [ ] Automated backup script configured
- [ ] Backups stored off-site
- [ ] Backup restoration tested

### 2. Code & Configuration

- [ ] Git repository backed up (GitHub has redundancy)
- [ ] Environment variables documented and backed up securely
- [ ] Infrastructure as Code (render.yaml) in version control

### 3. Disaster Recovery Plan

Document the recovery process:
- [ ] RTO (Recovery Time Objective) defined (e.g., 4 hours)
- [ ] RPO (Recovery Point Objective) defined (e.g., 24 hours)
- [ ] Runbook for common incidents:
  - [ ] Database restore
  - [ ] Service restart
  - [ ] Rollback deployment
  - [ ] API key rotation

---

## Production Maintenance

### Daily
- [ ] Check error tracking dashboard
- [ ] Review system health
- [ ] Monitor uptime status

### Weekly
- [ ] Review application logs
- [ ] Check performance metrics
- [ ] Review user feedback

### Monthly
- [ ] Update dependencies
- [ ] Review security alerts
- [ ] Analyze costs and usage
- [ ] Review and test backups

### Quarterly
- [ ] Rotate API keys
- [ ] Security audit
- [ ] Performance optimization review
- [ ] Disaster recovery test

---

## Troubleshooting

### Common Issues

#### 1. Database Connection Failed

**Symptoms:** Health check shows "disconnected"

**Solutions:**
- Verify DATABASE_URL is correct
- Check database is running (Render dashboard)
- Verify network connectivity
- Check connection pool settings

#### 2. CORS Errors in Frontend

**Symptoms:** Browser console shows CORS error

**Solutions:**
- Verify CORS_ORIGINS includes frontend domain
- Check protocol (http vs https)
- Verify trailing slashes match
- Clear browser cache

#### 3. Authentication Failures

**Symptoms:** Unable to login, "Invalid credentials"

**Solutions:**
- Verify JWT_SECRET is set correctly
- Check token expiration settings
- Verify user exists in database
- Check password hashing (bcrypt)

#### 4. LLM API Errors

**Symptoms:** Experience card creation fails

**Solutions:**
- Verify API keys are valid
- Check API rate limits
- Monitor API provider status
- Implement fallback provider

#### 5. Slow Performance

**Symptoms:** Requests taking >5 seconds

**Solutions:**
- Check database connection pool
- Optimize slow queries (add indexes)
- Enable caching (Redis)
- Scale up infrastructure

---

## Emergency Rollback

If something goes wrong in production:

### 1. Immediate Actions

```bash
# Render: Rollback to previous deployment
# Go to Render dashboard → Select service → "Manual Deploy" → Select previous commit

# Self-hosted: Rollback with Git
git revert <problematic-commit>
docker-compose down
docker-compose up -d
```

### 2. Communication

- [ ] Notify users via status page
- [ ] Post incident update
- [ ] Estimate time to resolution

### 3. Post-Incident

- [ ] Document what went wrong
- [ ] Create post-mortem report
- [ ] Implement fixes
- [ ] Update deployment checklist

---

## Success Criteria

Your deployment is successful when:

- ✅ All health checks passing
- ✅ No critical errors in logs
- ✅ All core user flows working
- ✅ Authentication and authorization working
- ✅ Database backups configured
- ✅ Monitoring and alerts set up
- ✅ Security hardening complete
- ✅ Documentation up to date
- ✅ Team trained on operations
- ✅ Incident response plan ready

---

## Support Resources

- **Documentation:** See `README.md` and `PRODUCTION_READINESS.md`
- **Render Support:** https://render.com/docs
- **FastAPI Docs:** https://fastapi.tiangolo.com
- **Next.js Docs:** https://nextjs.org/docs
- **PostgreSQL Docs:** https://www.postgresql.org/docs/

---

**Checklist Version:** 1.0
**Last Updated:** 2026-03-23
**Maintained By:** Development Team
