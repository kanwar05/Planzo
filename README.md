# PLANZO

PLANZO is split into two independent applications:

```text
Planzo/
├── frontend/   # React + Vite + Tailwind
└── server/     # Node.js + Express + MongoDB
```

## Start the frontend

```bash
cd frontend
npm install
npm run dev
```

## Start the backend

```bash
cd server
cp .env.example .env
npm install
npm run dev
```

The frontend expects the API at `http://localhost:5001/api`. Override it with
`VITE_API_URL` in `frontend/.env` when needed.

See [`server/README.md`](server/README.md) for environment variables, API
routes, authorization rules, Cloudinary vendor image uploads, and example
requests.
