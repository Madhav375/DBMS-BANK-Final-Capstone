# Nexora Bank Frontend

## Local setup
1. Install Node.js.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and keep `VITE_API_URL=http://localhost:5000` for local backend.
4. Run `npm run dev`.

## Deploy on Vercel
- Import this frontend repository.
- Framework preset: Vite.
- Root directory: repository root.
- Build command: `npm run build`.
- Output directory: `dist`.
- Add environment variable `VITE_API_URL` with the deployed backend URL (for example, your Render URL, without a trailing slash).
