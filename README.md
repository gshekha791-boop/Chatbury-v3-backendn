# Chatbury V3 backend

This is a Node.js + Express backend designed for the supplied Chatbury V3 HTML frontend.

## Features
- Verifies Firebase Authentication ID tokens on all `/api/*` routes.
- Stores each user's conversations and messages in Cloud Firestore.
- Streams Gemini responses using Server-Sent Events (SSE).
- Supports conversation history, rename, delete, and usage totals.
- Keeps the Gemini server key in environment variables; the frontend can also send a session key using `X-Gemini-API-Key`.

## Important before deployment
This backend is a generated integration starter. It has not yet been connected to your live Firebase project or tested against your deployed frontend. Do not call it live until the setup and smoke tests below pass.

## 1. Firebase Admin credentials
In Firebase Console:
1. Open Project settings (gear icon) -> Service accounts.
2. Generate a new private key for the Firebase Admin SDK.
3. Keep the downloaded JSON private. Never upload it to a public repository or put it in your HTML.
4. In your hosting provider's Secrets / Environment Variables, add `FIREBASE_SERVICE_ACCOUNT_JSON` with the complete JSON content as a single line. Alternatively, base64-encode it and set `FIREBASE_SERVICE_ACCOUNT_BASE64`.

The project must be `chatbury-fb5fa`, the same Firebase project used by your frontend.

## 2. Firestore
Create/enable Cloud Firestore in the same Firebase project. The backend uses collections `conversations`, `messages`, and `usage`. It also requires Firestore indexes for:
- `conversations`: `uid` ascending + `updated_at` descending
- `messages`: `conversationId` ascending + `created_at` ascending

Firestore may show an index-creation link in the server error/log when the first query runs. Open it and create the suggested index.

## 3. Hosting secrets
Set:
- `FIREBASE_SERVICE_ACCOUNT_JSON` (required)
- `GEMINI_API_KEY` (optional if users provide a session key in Chatbury Settings)
- `GEMINI_MODEL` (optional; defaults to `gemini-2.5-flash`)
- `ALLOWED_ORIGINS` (comma-separated deployed frontend origins; leave empty only while testing)

Do not commit `.env` or service-account JSON.

## 4. Run locally
```bash
npm install
cp .env.example .env
# Fill .env values
npm start
```
Health check: `http://localhost:3000/health`

## 5. Connect the HTML
The supplied HTML currently has `API_BASE = ''`. Once deployed, set it to the backend origin, for example:
```js
const API_BASE = 'https://YOUR-BACKEND-HOST';
```
Keep the existing Firebase Web SDK config in the HTML. Do not paste `google-services.json` into the HTML.

## API routes
- `GET /health`
- `GET /api/conversations`
- `POST /api/conversations`
- `GET /api/conversations/:id/messages`
- `PATCH /api/conversations/:id` with `{ "title": "..." }`
- `DELETE /api/conversations/:id`
- `GET /api/usage`
- `GET /api/models`
- `POST /api/chat/stream` with `{ "message": "...", "conversationId": "...", "regenerate": false }`

All `/api/*` routes require `Authorization: Bearer <Firebase ID token>`.

## Compatibility note
The frontend's exact request/response adapter should be checked during integration. This backend returns conversation arrays and message arrays directly, and uses `PATCH` for rename. If the HTML adapter expects different property names or methods, adjust one side before deployment.
