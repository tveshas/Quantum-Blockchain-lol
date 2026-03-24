# QuantumPay

**A quantum-safe payment integrity system using Quantum Hash Functions based on Controlled Alternate Quantum Walks (CAQW), as described in Abd El-Latif et al., Information Processing and Management, 2021.**

## Prerequisites

- Python 3.10+
- pip

## Setup & Run

```bash
# 1. Install backend dependencies
cd backend
pip install -r requirements.txt

# 2. Start the API server
uvicorn main:app --reload --port 8000
```

Then open `frontend/index.html` directly in your browser (just double-click or use File → Open).

> **Note:** If `liboqs-python` fails to install (it requires the liboqs C library), the backend will automatically fall back to mock crypto values. The demo will still run — you'll see realistic timing numbers, but the actual PQC algorithms won't be executing.

## Tech Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Backend  | FastAPI, uvicorn                    |
| Crypto   | cryptography (RSA), liboqs-python (Kyber/Dilithium) |
| Frontend | Vanilla HTML/CSS/JS                 |
| Charts   | Chart.js (CDN)                      |

## Endpoints

| Method | Path              | Description                  |
|--------|-------------------|------------------------------|
| POST   | /classical/send   | RSA-2048 encrypt + sign      |
| POST   | /quantum/send     | Kyber-768 + Dilithium-3      |
| GET    | /log              | Last 50 gateway log entries  |
| GET    | /health           | Health check                 |

## Project Structure

```
quantumshield/
├── backend/
│   ├── main.py               # FastAPI server
│   ├── crypto_classical.py   # RSA encryption + signing
│   ├── crypto_quantum.py     # Kyber + Dilithium via liboqs
│   ├── gateway.py            # Gateway logic, in-memory log
│   └── requirements.txt
├── frontend/
│   ├── index.html            # Single page app, 4 tabs
│   ├── dashboard.js          # Live dashboard tab
│   ├── comparison.js         # RSA vs Kyber comparison tab
│   ├── bb84.js               # BB84 animation tab
│   └── styles.css
└── README.md
```
