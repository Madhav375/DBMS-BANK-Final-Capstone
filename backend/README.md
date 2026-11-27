# Nexora Bank Backend

## Local setup
1. Install Node.js.
2. Run `npm install` in this directory.
3. Copy `.env.example` to `.env` and enter your database credentials and a strong JWT secret.
4. Import the SQL scripts in the `database` folder into your MySQL database.
5. Run `npm start`.

## Deploy on Render
- Create a Web Service from this repository.
- Build command: `npm install`.
- Start command: `npm start`.
- Add environment variables from `.env.example` (use your hosted DB credentials).
- Set `FRONTEND_ORIGIN` to your deployed Vercel origin (https://...; no trailing slash).
- Set `NODE_ENV=production` so the authentication cookie uses secure cross-site settings.
- After deploying, verify `/api/health`.
