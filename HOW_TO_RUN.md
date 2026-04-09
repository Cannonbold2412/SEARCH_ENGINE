# How to Run CONXA

This guide walks through setting up and running the CONXA platform locally.

## Prerequisites

- **Python 3.13+** (for backend)
- **Node.js 18+** (for frontend)
- **PostgreSQL 14+** with **pgvector** extension
- **ngrok** (optional, for mobile/Vapi testing)

## Quick Start

### 1. Clone and Setup

```bash
git clone <repository-url>
cd Search_Engine
```

### 2. Database Setup

#### Install PostgreSQL with pgvector

**macOS (Homebrew):**
```bash
brew install postgresql@14 pgvector
brew services start postgresql@14
```

**Ubuntu/Debian:**
```bash
sudo apt-get install postgresql-14 postgresql-14-pgvector
sudo systemctl start postgresql
```

**Windows:**
- Download and install PostgreSQL from https://www.postgresql.org/download/windows/
- Install pgvector: https://github.com/pgvector/pgvector#windows

#### Create Database

```bash
# Connect to PostgreSQL
psql postgres

# Create database and enable pgvector
CREATE DATABASE conxa;
\c conxa
CREATE EXTENSION vector;
\q
```

### 3. Backend Setup (`apps/api/`)

#### Install Dependencies

```bash
cd apps/api
pip install -r requirements.txt  # or use virtual environment
```

#### Configure Environment

Copy the example environment file:
```bash
cp .env.example .env
```

Edit `apps/api/.env` with your settings:

```bash
# Database (update with your credentials)
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/conxa

# Auth
JWT_SECRET=your-secret-key-change-in-production

# LLM Provider (choose one)
# Option 1: OpenAI
OPENAI_API_KEY=sk-...

# Option 2: Groq (faster, cheaper)
CHAT_API_BASE_URL=https://api.groq.com/openai/v1
CHAT_API_KEY=your_groq_api_key
CHAT_MODEL=llama-3.3-70b-versatile

# Embeddings (OpenAI)
EMBED_MODEL=text-embedding-3-large
EMBED_DIMENSION=384

# CORS (for local dev, allow all)
CORS_ORIGINS=*
```

#### Run Migrations

```bash
alembic upgrade head
```

#### (Optional) Seed Demo Profiles

```bash
python -m src.db.seed_demo_profiles
```

#### Start Backend Server

```bash
# Option 1: Using uvicorn directly
uvicorn src.main:app --reload

# Option 2: Using Makefile
make dev

# Server runs on http://localhost:8000
```

### 4. Frontend Setup (`apps/web/`)

#### Install Dependencies

```bash
cd apps/web
npm install
```

#### Configure Environment

Copy the example environment file:
```bash
cp .env.example .env.local
```

Edit `apps/web/.env.local`:

```bash
# Backend API
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000

# Vapi Voice (optional - for voice features)
# Get these from https://dashboard.vapi.ai
NEXT_PUBLIC_VAPI_PUBLIC_KEY=your_vapi_public_key
NEXT_PUBLIC_VAPI_ASSISTANT_ID=your_vapi_assistant_id
```

#### Start Frontend Server

```bash
npm run dev

# App runs on http://localhost:3000
```

### 5. Access the Application

1. Open http://localhost:3000 in your browser
2. Click "Sign up" to create an account
3. Fill in your profile and experience cards
4. Start searching!

## Advanced Setup

### ngrok for Mobile/Vapi Testing

When testing on mobile devices or using Vapi voice integration, you need a public HTTPS URL for the API.

#### Install ngrok

**macOS:**
```bash
brew install ngrok
```

**Windows:**
Download from https://ngrok.com/download

**Linux:**
```bash
curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null
echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list
sudo apt update && sudo apt install ngrok
```

#### Setup ngrok Authentication

```bash
ngrok config add-authtoken YOUR_AUTHTOKEN
```

Get your authtoken from https://dashboard.ngrok.com/get-started/your-authtoken

#### Expose Backend API

**Option 1: Using ngrok directly**
```bash
# Make sure backend is running on port 8000
ngrok http 8000
```

**Option 2: Using PowerShell script (Windows)**
```powershell
# Create scripts/ngrok-tunnel.ps1
cd scripts
# Run the ngrok tunnel
./ngrok-tunnel.ps1
```

**PowerShell script content (scripts/ngrok-tunnel.ps1):**
```powershell
# Expose local FastAPI (port 8000) via ngrok for mobile/Vapi testing
Write-Host "Starting ngrok tunnel for CONXA API (port 8000)..." -ForegroundColor Cyan

# Check if ngrok is installed
if (-not (Get-Command ngrok -ErrorAction SilentlyContinue)) {
    Write-Host "Error: ngrok not found. Install from https://ngrok.com/download" -ForegroundColor Red
    exit 1
}

# Check if backend is running
$backendRunning = Test-NetConnection -ComputerName localhost -Port 8000 -InformationLevel Quiet -WarningAction SilentlyContinue
if (-not $backendRunning) {
    Write-Host "Warning: Backend not detected on port 8000. Make sure to start it first." -ForegroundColor Yellow
}

# Start ngrok
Write-Host "Tunnel will be created at https://xxxx.ngrok.io" -ForegroundColor Green
Write-Host "Update NEXT_PUBLIC_API_BASE_URL in apps/web/.env.local with the ngrok URL" -ForegroundColor Yellow
Write-Host ""

ngrok http 8000
```

#### Update Frontend Environment

After starting ngrok, copy the HTTPS URL (e.g., `https://abc123.ngrok.io`) and update `apps/web/.env.local`:

```bash
NEXT_PUBLIC_API_BASE_URL=https://abc123.ngrok.io
```

Restart the frontend:
```bash
npm run dev
```

#### Update CORS Settings

Update `apps/api/.env` to allow requests from your ngrok URL:

```bash
CORS_ORIGINS=http://localhost:3000,https://abc123.ngrok.io
```

Restart the backend.

### Production-like Build

#### Backend

```bash
cd apps/api
uvicorn src.main:app --host 0.0.0.0 --port 8000
```

#### Frontend

```bash
cd apps/web
npm run build
npm run start
```

## Common Commands Reference

### Backend (`apps/api/`)

```bash
# Development server with auto-reload
uvicorn src.main:app --reload

# Run migrations
alembic upgrade head

# Create new migration
alembic revision --autogenerate -m "description"

# Lint (check)
ruff check src/

# Lint (fix)
ruff check src/ --fix

# Format code
ruff format src/

# Run tests (when available)
pytest
pytest tests/test_file.py::test_name -v  # single test
```

### Frontend (`apps/web/`)

```bash
# Development server
npm run dev

# Production build
npm run build

# Start production server
npm run start

# Lint
npm run lint

# Lint with auto-fix
npm run lint -- --fix
```

## Troubleshooting

### Database Connection Issues

**Error: `FATAL: password authentication failed`**
- Update `DATABASE_URL` in `apps/api/.env` with correct credentials
- Format: `postgresql://username:password@localhost:5432/conxa`

**Error: `extension "vector" does not exist`**
- Install pgvector extension
- Run `CREATE EXTENSION vector;` in the conxa database

### Port Already in Use

**Backend (port 8000):**
```bash
# Find and kill process
lsof -ti:8000 | xargs kill -9  # macOS/Linux
Get-Process -Id (Get-NetTCPConnection -LocalPort 8000).OwningProcess | Stop-Process  # Windows PowerShell
```

**Frontend (port 3000):**
```bash
# Find and kill process
lsof -ti:3000 | xargs kill -9  # macOS/Linux
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process  # Windows PowerShell
```

### CORS Errors

If you see CORS errors in the browser console:
1. Check `CORS_ORIGINS` in `apps/api/.env` includes your frontend URL
2. Restart the backend after changing `.env`
3. For production, never use `CORS_ORIGINS=*` with credentials

### Missing Environment Variables

**Backend:**
- Ensure all required variables in `.env.example` are set in `.env`
- Minimum required: `DATABASE_URL`, `JWT_SECRET`, and either `OPENAI_API_KEY` or `CHAT_API_BASE_URL`+`CHAT_API_KEY`

**Frontend:**
- Ensure `NEXT_PUBLIC_API_BASE_URL` is set in `.env.local`
- Restart the dev server after changing `.env.local`

## Next Steps

1. **Read the docs:**
   - `README.md` - Architecture overview
   - `AGENTS.md` - Detailed codebase guide
   - `.github/copilot-instructions.md` - Quick reference

2. **Explore the API:**
   - API docs: http://localhost:8000/docs (Swagger UI)
   - Health check: http://localhost:8000/health

3. **Build something:**
   - Create experience cards in the builder
   - Run searches to find people
   - Unlock contacts to connect

## Support

For issues or questions, check existing documentation or raise an issue in the repository.
