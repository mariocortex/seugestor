import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import apiRoutes from "./server/routes/api.ts";
import cors from 'cors';
import session from 'express-session';
import cookieParser from 'cookie-parser';

async function startServer() {
  const app = express();
  const PORT = 3004;

  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });
  app.use(cors());
  app.use(cookieParser());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  app.use(session({
    secret: 'meta-automator-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { 
      secure: process.env.NODE_ENV === "production", 
      sameSite: process.env.NODE_ENV === "production" ? 'none' : 'lax',
      httpOnly: true 
    }
  }));

  // Health check
  app.get("/health", (req, res) => {
    res.json({ status: "ok", env: process.env.NODE_ENV, time: new Date().toISOString() });
  });

  // API routes
  app.use("/api", apiRoutes);
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
