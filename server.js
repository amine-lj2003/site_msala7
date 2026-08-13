require("dotenv").config();

const express = require("express");
const session = require("express-session");
const cors = require("cors");
const { OAuth2Client } = require("google-auth-library");

const {
  GOOGLE_CLIENT_ID,
  SESSION_SECRET,
  FRONTEND_ORIGIN,
  PORT = 4000,
  COOKIE_SECURE = "false",
} = process.env;

// FIX: this used to check `.includes(<your real client id>)`, which meant
// the server refused to start the moment you put your REAL client ID in
// .env. It should only reject the placeholder value from .env.example.
if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.includes("YOUR_GOOGLE_CLIENT_ID")) {
  console.error(
    "Missing GOOGLE_CLIENT_ID. Copy .env.example to .env and set your real Google Client ID."
  );
  process.exit(1);
}
if (!SESSION_SECRET || SESSION_SECRET.includes("replace_with")) {
  console.error(
    "Missing SESSION_SECRET. Copy .env.example to .env and set a real random secret."
  );
  process.exit(1);
}

const app = express();
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

app.use(express.json());

// Allow the frontend origin to send cookies with its requests
app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true,
  })
);

app.use(
  session({
    name: "hsa_sid",
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: COOKIE_SECURE === "true", // set true only when served over HTTPS
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  })
);

/**
 * POST /auth/google
 * Body: { credential: "<Google ID token from the frontend>" }
 *
 * Verifies the token with Google (signature, audience, expiry) instead of
 * trusting whatever the browser sends. On success, stores a minimal user
 * profile in the server-side session and sets a session cookie.
 */
app.post("/auth/google", async (req, res) => {
  const { credential } = req.body;
  if (!credential) {
    return res.status(400).json({ error: "Missing credential" });
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      // FIX: use the env var instead of a hardcoded literal, so there's a
      // single source of truth for the Client ID.
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    if (!payload || !payload.email_verified) {
      return res.status(401).json({ error: "Email not verified by Google" });
    }

    req.session.user = {
      sub: payload.sub, // stable Google user ID
      name: payload.name,
      email: payload.email,
      picture: payload.picture,
    };

    return res.json({ user: req.session.user });
  } catch (err) {
    console.error("Google token verification failed:", err.message);
    return res.status(401).json({ error: "Invalid Google token" });
  }
});

/**
 * GET /auth/me
 * Returns the currently signed-in user based on the session cookie,
 * or 401 if nobody is signed in.
 */
app.get("/auth/me", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Not signed in" });
  }
  return res.json({ user: req.session.user });
});

/**
 * POST /auth/logout
 * Destroys the session and clears the cookie.
 */
app.post("/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: "Could not log out" });
    }
    res.clearCookie("hsa_sid");
    return res.json({ ok: true });
  });
});

// Example of a protected route: anything that needs a real signed-in user
app.get("/api/protected-example", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Not signed in" });
  }
  return res.json({
    message: `Hello ${req.session.user.name}, this data required a valid session.`,
  });
});

app.listen(PORT, () => {
  // FIX: log the actual configured PORT instead of a hardcoded 5500.
  console.log(`HSA backend listening on http://localhost:${PORT}`);
});
