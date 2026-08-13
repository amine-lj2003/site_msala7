# HSA Backend — Google OAuth

Small Express server that verifies Google Sign-In tokens from your frontend
and manages login sessions with a cookie. This is what makes the login
"real" — the frontend button alone can't be trusted to prove who someone is.

## 1. Get a Google Client ID

1. Go to https://console.cloud.google.com/apis/credentials
2. Create Credentials → OAuth client ID → Application type: Web application
3. Under "Authorized JavaScript origins", add every origin you'll load the
   site from, e.g.:
   - `http://localhost:5500` (if using VS Code Live Server)
   - `https://yourdomain.com` (production)
4. Copy the generated Client ID (ends in `.apps.googleusercontent.com`)

You'll paste this Client ID in **two** places:
- `HSAsaif2.html` → `data-client_id="..."`
- `backend/.env` → `GOOGLE_CLIENT_ID=...`

## 2. Install and configure the backend

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env`:
- `GOOGLE_CLIENT_ID` — the Client ID from step 1
- `SESSION_SECRET` — generate one with:
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `FRONTEND_ORIGIN` — the exact origin your HTML is served from (must match,
  including protocol and port, e.g. `http://localhost:5500`)

## 3. Run it

```bash
npm start
```

You should see:
```
HSA backend listening on http://localhost:4000
```

## 4. Serve the frontend (not as a file:// URL)

Google's sign-in button won't render if you just double-click the HTML
file. Serve it, for example:

```bash
# from the folder containing HSAsaif2.html
python3 -m http.server 5500
```

Then visit `http://localhost:5500/HSAsaif2.html`.

If `FRONTEND_ORIGIN` in `.env` doesn't exactly match this URL's origin,
requests will be blocked by CORS.

## How it works

1. User clicks the Google button → Google returns a signed ID token
   (`credential`) to the page.
2. The page POSTs that token to `POST /auth/google` on this backend.
3. The backend verifies the token's signature, audience, and expiry
   directly with Google (`google-auth-library`) — it does not trust
   anything the browser claims.
4. On success, the backend stores the user in a server-side session and
   sets an `httpOnly` cookie, so client-side JS can never read or forge it.
5. `GET /auth/me` lets the frontend check "am I still logged in?" on page
   load. `POST /auth/logout` ends the session.

## Going to production

- Set `COOKIE_SECURE=true` in `.env` and serve both frontend and backend
  over HTTPS — browsers drop secure cookies over plain HTTP.
- Deploy the backend somewhere persistent (Render, Railway, Fly.io, a VPS,
  etc.) and update `BACKEND_URL` in the HTML's `<script>` to that URL.
- Swap the in-memory session store (Express's default) for something
  persistent like `connect-redis` or `connect-pg-simple` if you expect more
  than one server process or a restart shouldn't log everyone out.
