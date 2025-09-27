import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// Load environment variables once at startup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Only load .env in development
if (process.env.NODE_ENV !== 'production') {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { passport } from "./googleAuth";

const app = express();

// Configure CORS to allow requests from Whop and development environments
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);
    
    // List of allowed origins
    const allowedOrigins = [
      /^https:\/\/.*\.apps\.whop\.com$/,  // Any Whop app subdomain
      /^https:\/\/whop\.com$/,             // Main Whop domain
      /^http:\/\/localhost:\d+$/,          // Local development
      /^https:\/\/.*\.replit\.dev$/,       // Replit domains
      /^https:\/\/.*\.repl\.co$/           // Replit alternative domains
    ];
    
    // Check if the origin matches any allowed pattern
    const allowed = allowedOrigins.some(pattern => 
      pattern.test(origin)
    );
    
    if (allowed) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true, // Allow cookies and authentication
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['set-cookie'],
  maxAge: 86400 // Cache preflight response for 24 hours
};

app.use(cors(corsOptions));

// Root endpoint FIRST - immediate health check response for deployment
app.get('/', (req, res) => {
  // Set timeout to ensure fast response for Cloud Run health checks
  res.setTimeout(5000, () => {
    res.status(408).json({ status: 'timeout', service: 'nutrima-api' });
  });
  
  try {
    res.status(200).json({ 
      status: 'ok', 
      service: 'nutrima-api', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
    });
  } catch (error) {
    res.status(500).json({ status: 'error', service: 'nutrima-api' });
  }
});

// Health check endpoint - fast response without external dependencies
app.get('/health', (req, res) => {
  res.setTimeout(5000, () => {
    res.status(408).json({ status: 'timeout' });
  });
  
  try {
    res.status(200).json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(500).json({ status: 'error' });
  }
});

// Increase payload size limit for image uploads (10MB)
// Skip JSON parsing for Stripe webhook (it needs raw body)
app.use((req, res, next) => {
  if (req.path === '/api/stripe/webhook') {
    next();
  } else {
    express.json({ limit: '10mb' })(req, res, next);
  }
});
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// Configure session middleware (required for passport and fallback auth)
app.use(session({
  secret: process.env.SESSION_SECRET || "healthy-mama-session-secret-2025",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days for better persistence
    sameSite: process.env.NODE_ENV === "production" ? 'none' : 'lax', // 'none' for cross-site in production
    domain: process.env.NODE_ENV === "production" ? undefined : undefined // Let browser handle domain
  },
  name: 'healthy-mama-session', // Custom session name
  rolling: true, // Reset expiry on activity
  proxy: true // Trust proxy for secure cookies behind reverse proxy
}));

app.use(passport.initialize());
app.use(passport.session());

// Request logging middleware (only once)
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    if (process.env.NODE_ENV === 'production') {
      console.error('Server error:', err);
    } else {
      throw err;
    }
  });

  // Setup frontend serving
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = process.env.PORT ? parseInt(process.env.PORT) : 5000;

  server.on('error', (error: any) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Trying to find available port...`);
      // Try to find next available port for development
      const tryPort = port + 1;
      server.listen(tryPort, "0.0.0.0", () => {
        console.log(`Server running on port ${tryPort} (fallback)`);
      });
    } else {
      console.error(`Server error: ${error.message}`);
      if (process.env.NODE_ENV !== 'production') {
        throw error;
      }
    }
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on port ${port}`);
    // Send ready signal for health checks
    if (process.send) process.send('ready');
  });

  // Graceful shutdown for autoscale deployment
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
})();