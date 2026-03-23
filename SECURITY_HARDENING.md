# CONXA Security Hardening Guide

This document provides comprehensive security hardening recommendations for CONXA in production.

## Table of Contents
1. [Authentication & Authorization](#authentication--authorization)
2. [API Security](#api-security)
3. [Database Security](#database-security)
4. [Infrastructure Security](#infrastructure-security)
5. [Dependency Management](#dependency-management)
6. [Monitoring & Incident Response](#monitoring--incident-response)

---

## Authentication & Authorization

### 1. JWT Token Security

#### Current Implementation
- ✅ JWT tokens with configurable expiration
- ✅ bcrypt password hashing (cost factor 12+)
- ✅ Secure token generation using python-jose

#### Hardening Recommendations

**JWT Secret:**
```bash
# Generate strong JWT secret (256-bit)
openssl rand -base64 32

# Or use Python
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

**Token Configuration:**
```python
# In src/core/config.py
class Settings(BaseSettings):
    jwt_secret: str = Field(..., min_length=32)  # Enforce minimum length
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30  # Shorter for production
    refresh_token_expire_days: int = 7
```

**Best Practices:**
- [ ] JWT_SECRET minimum 32 characters
- [ ] Rotate JWT_SECRET quarterly
- [ ] Access tokens expire in 30 minutes or less
- [ ] Refresh tokens expire in 7-30 days
- [ ] Store refresh tokens securely (database, not localStorage)

### 2. Password Policy

**Current:** Basic email + password

**Recommendations:**
```python
# Add password validation
from pydantic import field_validator
import re

class UserCreate(BaseModel):
    password: str

    @field_validator('password')
    def validate_password(cls, v):
        if len(v) < 12:
            raise ValueError('Password must be at least 12 characters')
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain lowercase letter')
        if not re.search(r'[0-9]', v):
            raise ValueError('Password must contain digit')
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', v):
            raise ValueError('Password must contain special character')
        return v
```

- [ ] Minimum 12 characters
- [ ] Require uppercase, lowercase, digit, special character
- [ ] Check against common passwords (pwned passwords API)
- [ ] Implement password reset flow
- [ ] Account lockout after 5 failed attempts

### 3. Multi-Factor Authentication (MFA)

**Current:** Optional OTP via Twilio

**Recommendations:**
- [ ] Make MFA mandatory for admin users
- [ ] Support TOTP (Time-based OTP) via authenticator apps
- [ ] Backup codes for account recovery
- [ ] MFA enforcement at organization level

### 4. Session Management

**Recommendations:**
```python
# Track active sessions in database
class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("people.id"))
    token_jti: Mapped[str] = mapped_column(unique=True)  # JWT ID
    created_at: Mapped[datetime]
    expires_at: Mapped[datetime]
    ip_address: Mapped[str]
    user_agent: Mapped[str]
    revoked: Mapped[bool] = mapped_column(default=False)
```

- [ ] Track all active sessions
- [ ] Allow users to revoke sessions
- [ ] Invalidate all sessions on password change
- [ ] Log suspicious activity (IP changes, location changes)

---

## API Security

### 1. Rate Limiting

**Current:** SlowAPI with in-memory storage

**Production Upgrade:**
```python
# Use Redis-backed rate limiting
from slowapi import Limiter
from slowapi.util import get_remote_address
import redis

redis_client = redis.from_url(os.getenv("REDIS_URL"))

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=os.getenv("REDIS_URL"),
    strategy="fixed-window"
)

# Different limits per endpoint
@app.post("/auth/login")
@limiter.limit("5/minute")  # Strict for auth
async def login(): ...

@app.get("/search")
@limiter.limit("30/minute")  # More permissive for search
async def search(): ...
```

**Rate Limit Strategy:**
- [ ] Authentication: 5 requests/minute
- [ ] Signup: 3 requests/minute
- [ ] Password reset: 3 requests/hour
- [ ] Search: 30 requests/minute
- [ ] General API: 60 requests/minute

### 2. CORS Configuration

**Current:** Configurable via CORS_ORIGINS

**Production Settings:**
```python
# ❌ NEVER in production
CORS_ORIGINS=*

# ✅ Production configuration
CORS_ORIGINS=https://conxa-web.onrender.com,https://yourdomain.com

# In code (src/main.py)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins_list,  # Explicit list only
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],  # Explicit methods
    allow_headers=["Authorization", "Content-Type"],  # Explicit headers
    max_age=3600,  # Cache preflight for 1 hour
)
```

- [ ] No wildcard `*` origins with credentials
- [ ] Explicit domain list only
- [ ] Minimal allowed methods and headers
- [ ] Configure max_age for performance

### 3. Input Validation

**Current:** Pydantic schemas

**Enhancements:**
```python
from pydantic import Field, field_validator

class ExperienceInput(BaseModel):
    description: str = Field(
        ...,
        min_length=10,
        max_length=10000,
        description="Experience description"
    )

    @field_validator('description')
    def validate_no_code_injection(cls, v):
        # Prevent code injection in LLM prompts
        dangerous_patterns = ['```', '<script', 'javascript:', 'eval(']
        for pattern in dangerous_patterns:
            if pattern in v.lower():
                raise ValueError('Invalid characters in input')
        return v
```

**Validation Checklist:**
- [ ] All inputs have length limits
- [ ] Email validation on email fields
- [ ] URL validation on URL fields
- [ ] Sanitize HTML/JavaScript in user content
- [ ] Validate file uploads (type, size)
- [ ] Reject suspicious patterns in LLM inputs

### 4. API Versioning

**Future-proofing:**
```python
# Version 1 (current)
app.include_router(auth_router, prefix="/v1/auth")

# Future version
app.include_router(auth_router_v2, prefix="/v2/auth")

# Deprecation headers
@app.middleware("http")
async def add_version_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-API-Version"] = "1.0"
    return response
```

- [ ] Add `/v1` prefix to all routes
- [ ] Document API version in responses
- [ ] Plan deprecation strategy

### 5. Security Headers

**Implementation:**
```python
# In src/main.py
from fastapi.middleware.trustedhost import TrustedHostMiddleware

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["conxa-api.onrender.com", "yourdomain.com"]
)

@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Content-Security-Policy"] = "default-src 'self'"
    return response
```

- [ ] X-Content-Type-Options: nosniff
- [ ] X-Frame-Options: DENY
- [ ] X-XSS-Protection: 1; mode=block
- [ ] Strict-Transport-Security (HSTS)
- [ ] Content-Security-Policy

---

## Database Security

### 1. Connection Security

**Current:** PostgreSQL with asyncpg

**Hardening:**
```python
# In src/db/session.py
engine = create_async_engine(
    settings.database_url,
    echo=False,  # Never True in production (logs queries)
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
    pool_recycle=3600,
    connect_args={
        "ssl": "require",  # Enforce SSL
        "server_settings": {
            "application_name": "conxa-api"
        }
    }
)
```

**Checklist:**
- [ ] SSL/TLS enforced for all connections
- [ ] Strong database password (32+ characters)
- [ ] Connection pooling configured
- [ ] Query logging disabled in production
- [ ] Database user has minimal privileges

### 2. SQL Injection Prevention

**Current:** SQLAlchemy ORM (parameterized queries)

**Best Practices:**
```python
# ✅ Safe - parameterized
result = await db.execute(
    select(User).where(User.email == email)
)

# ❌ NEVER do this
result = await db.execute(
    f"SELECT * FROM users WHERE email = '{email}'"
)
```

- [ ] Always use SQLAlchemy ORM or parameterized queries
- [ ] Never concatenate user input into queries
- [ ] Validate and sanitize all inputs
- [ ] Use type hints and Pydantic validation

### 3. Sensitive Data Encryption

**Recommendations:**
```python
# Encrypt sensitive fields at rest
from cryptography.fernet import Fernet

class Person(Base):
    # Public fields
    name: Mapped[str]

    # Encrypted fields
    _phone_encrypted: Mapped[str] = mapped_column("phone")
    _email_encrypted: Mapped[str] = mapped_column("email")

    @property
    def phone(self):
        return decrypt(self._phone_encrypted)

    @phone.setter
    def phone(self, value):
        self._phone_encrypted = encrypt(value)
```

- [ ] Encrypt PII (email, phone) at rest
- [ ] Use envelope encryption for keys
- [ ] Rotate encryption keys annually
- [ ] Secure key storage (AWS KMS, Vault)

### 4. Database Backups

- [ ] Automated daily backups
- [ ] Backups encrypted at rest
- [ ] Test restore process monthly
- [ ] Off-site backup storage
- [ ] 30-day retention policy

---

## Infrastructure Security

### 1. Environment Variables

**Best Practices:**
- [ ] Never commit secrets to Git
- [ ] Use platform secret management (Render, AWS Secrets Manager)
- [ ] Rotate secrets quarterly
- [ ] Different secrets per environment
- [ ] Document all required variables

**Audit:**
```bash
# Check Git history for leaked secrets
git log -p | grep -i "password\|secret\|key" | head -50

# Use tools like truffleHog or gitleaks
pip install trufflehog
trufflehog --regex --entropy=True .
```

### 2. Container Security

**Docker Best Practices:**
```dockerfile
# Use specific versions, not latest
FROM python:3.11.7-slim

# Run as non-root user
RUN useradd -m -u 1000 appuser
USER appuser

# Minimal attack surface
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
    CMD curl -f http://localhost:8080/health || exit 1
```

- [ ] Pin specific versions
- [ ] Run as non-root user
- [ ] Minimal base image (slim/alpine)
- [ ] Regular image updates
- [ ] Scan for vulnerabilities (Trivy)

### 3. Network Security

**Render Configuration:**
- [ ] Enable private networking between services
- [ ] Database not publicly accessible
- [ ] Use internal URLs for service-to-service
- [ ] Configure IP allowlists (if needed)

### 4. Logging & Audit Trail

**Implementation:**
```python
import logging
import structlog

# Structured logging
logger = structlog.get_logger()

@app.middleware("http")
async def log_requests(request, call_next):
    logger.info(
        "request_started",
        method=request.method,
        path=request.url.path,
        client_ip=request.client.host,
    )

    response = await call_next(request)

    logger.info(
        "request_completed",
        method=request.method,
        path=request.url.path,
        status_code=response.status_code,
    )

    return response
```

**Log Security Events:**
- [ ] Authentication attempts (success/failure)
- [ ] Password changes
- [ ] Permission changes
- [ ] Data access (PII viewing)
- [ ] Search queries (for abuse detection)
- [ ] Credit transactions

---

## Dependency Management

### 1. Dependency Scanning

**Backend (Python):**
```bash
# Install safety
pip install safety

# Check for vulnerabilities
safety check

# Or use pip-audit
pip install pip-audit
pip-audit
```

**Frontend (Node.js):**
```bash
# Check for vulnerabilities
pnpm audit

# Fix automatically
pnpm audit --fix
```

### 2. Automated Updates

**GitHub Dependabot:**
```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "pip"
    directory: "/apps/api"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5

  - package-ecosystem: "npm"
    directory: "/apps/web"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
```

- [ ] Enable Dependabot
- [ ] Review dependency PRs weekly
- [ ] Pin versions in production
- [ ] Test updates in staging

### 3. Supply Chain Security

- [ ] Verify package signatures
- [ ] Use lock files (pnpm-lock.yaml, requirements.txt)
- [ ] Audit new dependencies before adding
- [ ] Use official packages only (PyPI, npm)
- [ ] Monitor for malicious packages

---

## Monitoring & Incident Response

### 1. Error Tracking

**Sentry Setup:**
```python
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration

sentry_sdk.init(
    dsn=os.getenv("SENTRY_DSN"),
    integrations=[FastApiIntegration()],
    traces_sample_rate=0.1,
    environment="production",
    before_send=scrub_sensitive_data,
)

def scrub_sensitive_data(event, hint):
    # Remove sensitive data from error reports
    if 'request' in event:
        if 'headers' in event['request']:
            event['request']['headers'].pop('Authorization', None)
    return event
```

### 2. Security Monitoring

**Alerts to Configure:**
- [ ] Multiple failed login attempts
- [ ] Suspicious search patterns
- [ ] Large data exports
- [ ] API rate limit violations
- [ ] Database connection failures
- [ ] Unusual credit usage patterns

### 3. Incident Response Plan

**Phase 1: Detection**
1. Security alert triggered
2. Verify alert legitimacy
3. Assess severity (P0-P4)

**Phase 2: Containment**
1. Isolate affected systems
2. Revoke compromised credentials
3. Block suspicious IPs
4. Preserve evidence (logs)

**Phase 3: Eradication**
1. Identify root cause
2. Remove vulnerability
3. Patch systems
4. Reset credentials

**Phase 4: Recovery**
1. Restore from clean backup (if needed)
2. Monitor for recurrence
3. Verify system integrity

**Phase 5: Post-Incident**
1. Write post-mortem
2. Update security measures
3. Train team
4. Notify affected users (if data breach)

---

## Compliance Considerations

### 1. Data Privacy (GDPR)

If serving EU users:
- [ ] Privacy policy published
- [ ] Cookie consent implemented
- [ ] Right to access (data export)
- [ ] Right to erasure (account deletion)
- [ ] Data processing agreement
- [ ] Data retention policy
- [ ] Breach notification plan

### 2. Data Residency

- [ ] Understand where data is stored (Render region)
- [ ] Compliance with local laws
- [ ] Cross-border data transfer agreements

### 3. Security Certifications

Consider pursuing:
- [ ] SOC 2 Type II (for enterprise customers)
- [ ] ISO 27001 (information security)
- [ ] PCI DSS (if handling payments)

---

## Security Checklist Summary

### Critical (Do Before Launch)
- [ ] JWT_SECRET is strong and unique
- [ ] CORS configured with explicit origins
- [ ] Database password is strong
- [ ] SSL/TLS enforced everywhere
- [ ] Rate limiting implemented
- [ ] Input validation comprehensive
- [ ] No secrets in Git history
- [ ] Error tracking configured (Sentry)

### High Priority (Week 1)
- [ ] Security headers configured
- [ ] Password policy enforced
- [ ] Session management improved
- [ ] Logging and audit trail
- [ ] Dependency scanning automated
- [ ] Backup and restore tested

### Medium Priority (Month 1)
- [ ] MFA available to users
- [ ] Redis-backed rate limiting
- [ ] Sensitive data encryption
- [ ] API versioning
- [ ] Security monitoring and alerts
- [ ] Incident response plan documented

### Nice to Have (Quarter 1)
- [ ] Security audit by third party
- [ ] Penetration testing
- [ ] Bug bounty program
- [ ] SOC 2 compliance
- [ ] Advanced threat detection

---

## Resources

### Tools
- **Dependency Scanning:** Safety (Python), pnpm audit (Node.js)
- **Container Scanning:** Trivy, Snyk
- **Secret Scanning:** TruffleHog, gitleaks
- **SAST:** Bandit (Python), ESLint security plugins
- **Monitoring:** Sentry, Datadog, New Relic
- **WAF:** Cloudflare, AWS WAF

### References
- OWASP Top 10: https://owasp.org/www-project-top-ten/
- FastAPI Security: https://fastapi.tiangolo.com/tutorial/security/
- NIST Cybersecurity Framework: https://www.nist.gov/cyberframework

---

**Document Version:** 1.0
**Last Updated:** 2026-03-23
**Review Cycle:** Quarterly or after security incidents
