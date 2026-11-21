import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { requireUser } from "./auth.js";
import { auth } from "./firebase.js";
import {
  listConversations, createConversation, getConversation, getMessages,
  addMessage, renameConversation, deleteConversation, addUsage, getUsage
} from "./store.js";
import { streamGemini } from "./gemini.js";

const app = express();
app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
const origins = (process.env.ALLOWED_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean);
app.use(cors({
  origin(origin, cb) {
    if (!origin || origins.length === 0 || origins.includes(origin)) return cb(null, true);
    return cb(new Error("This website is not allowed to access the Chatbury API."));
  },
  credentials: true
}));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, service: "Chatbury V3 API" }));
app.get("/api/health", (_req, res) => res.json({ ok: true, service: "Chatbury V3 API" }));

app.use("/api", requireUser);
app.get("/api/me", (req, res) => res.json({ uid: req.user.uid, email: req.user.email }));

app.get("/api/conversations", async (req, res, next) => {
  try { res.json(await listConversations(req.user.uid)); } catch (e) { next(e); }
});
app.post("/api/conversations", async (req, res, next) => {
  try {
    const id = await createConversation(req.user.uid, req.body?.title || "New conversation");
    res.status(201).json({ id });
  } catch (e) { next(e); }
});
app.get("/api/conversations/:id/messages", async (req, res, next) => {
  try {
    const rows = await getMessages(req.user.uid, req.params.id);
    if (!rows) return res.status(404).json({ error: "Conversation not found." });
    res.json(rows);
  } catch (e) { next(e); }
});
app.patch("/api/conversations/:id", async (req, res, next) => {
  try {
    const title = String(req.body?.title || "").trim();
    if (!title) return res.status(400).json({ error: "A conversation title is required." });
    if (!(await renameConversation(req.user.uid, req.params.id, title))) return res.status(404).json({ error: "Conversation not found." });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
app.delete("/api/conversations/:id", async (req, res, next) => {
  try {
    if (!(await deleteConversation(req.user.uid, req.params.id))) return res.status(404).json({ error: "Conversation not found." });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
app.get("/api/usage", async (req, res, next) => {
  try { res.json(await getUsage(req.user.uid)); } catch (e) { next(e); }
});
app.get("/api/models", (_req, res) => res.json({ models: [process.env.GEMINI_MODEL || "gemini-2.5-flash"] }));

app.post("/api/chat/stream", async (req, res) => {
  const { message, conversationId, regenerate = false } = req.body || {};
  if (typeof message !== "string" || !message.trim()) return res.status(400).json({ error: "Message cannot be empty." });
  if (message.length > 20000) return res.status(413).json({ error: "Message is too long." });

  let id = conversationId;
  try {
    if (id) {
      if (!(await getConversation(req.user.uid, id))) return res.status(404).json({ error: "Conversation not found." });
    } else {
      id = await createConversation(req.user.uid, message.trim().slice(0, 40));
    }

    const prior = await getMessages(req.user.uid, id);
    if (!prior) return res.status(404).json({ error: "Conversation not found." });
    if (!regenerate) await addMessage(req.user.uid, id, "user", message.trim());
    const history = regenerate ? prior.slice(0, -1) : prior;
    const key = req.get("x-gemini-api-key") || req.get("x-goog-api-key") || process.env.GEMINI_API_KEY;
    if (!key) return res.status(503).json({ error: "Gemini API key is missing. Add one in Chatbury Settings or configure GEMINI_API_KEY on the server." });

    res.status(200);
    res.set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"
    });
    res.flushHeaders?.();
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    send("meta", { conversationId: id });

    try {
      const result = await streamGemini({
        apiKey: key,
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
        prompt: message.trim(),
        history,
        onText: text => send("delta", { text })
      });
      if (result.text) await addMessage(req.user.uid, id, "assistant", result.text);
      await addUsage(req.user.uid, result.inputTokens, result.outputTokens);
      send("done", { conversationId: id, inputTokens: result.inputTokens, outputTokens: result.outputTokens });
    } catch (e) {
      send("error", { error: e.message || "AI request failed." });
    }
    res.end();
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: e.message || "Server error." });
    else { res.write(`event: error\ndata: ${JSON.stringify({ error: e.message || "Server error." })}\n\n`); res.end(); }
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Something went wrong on the server." : err.message });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, "0.0.0.0", () => console.log(`Chatbury V3 API listening on ${port}`));
