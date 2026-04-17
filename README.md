# CampusIQ App

CampusIQ is a Retrieval-Augmented Generation (RAG) app for FAST-NUCES university Q&A.

- Backend: FastAPI + ChromaDB + LLM routing (Gemini primary, Grok fallback)
- Frontend: React + Vite chat UI

## Project Structure

- `main.py`: FastAPI server and `/rag/retrieve` endpoint
- `run_retrieval.py`: RAG pipeline orchestration (expansion, HyDE, retrieval, answering)
- `retrieval/`: prompt builders and retrieval helpers
- `frontend/`: React chat app
- `chroma_db/`: local vector DB storage

## Prerequisites

- Python 3.11+
- Node.js 18+
- npm 9+

## 1) Clone And Enter Project

```bash
git clone https://github.com/soban23/campus-iq
cd campusiq-app
```

## 2) Backend Setup

Create and activate virtual environment:

### Windows (PowerShell)

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

### macOS/Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

## 3) Environment Variables



```dotenv
GOOGLE_GENERATIVE_AI_API_KEY=your_google_api_key
CHROMA_PATH=./chroma_db
COLLECTION_NAME=uni_documents_2025
DEFAULT_MODEL=gemini-2.5-flash

# Optional fallback (used when Gemini fails)
GROK_API_KEY=your_grok_or_groq_api_key
GROK_API_URL=https://api.groq.com/openai/v1/chat/completions
GROK_BACKUP_MODEL=llama-3.3-70b-versatile

# Optional CORS override (comma-separated)
# CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

## 4) Run Backend API

```bash
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Check health:

- `GET http://127.0.0.1:8000/`

## 5) Frontend Setup

In a new terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on Vite default URL (usually `http://localhost:5173`).

