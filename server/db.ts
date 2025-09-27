import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

let pool: any;
let db: any;
let isInitialized = false;

function initializeDatabase() {
  if (isInitialized) return { pool, db };

  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('⚠️  DATABASE_URL not set. Using memory storage for development.');
    }
    pool = {} as any;
    db = {} as any;
  } else {
    try {
      pool = new Pool({ connectionString: process.env.DATABASE_URL });
      db = drizzle({ client: pool, schema });

      if (process.env.NODE_ENV !== 'production') {
        console.log('✅ Database connection initialized');
      }
    } catch (error: any) {
      console.error('Database initialization failed:', error.message);
      pool = {} as any;
      db = {} as any;
    }
  }

  isInitialized = true;
  return { pool, db };
}

// Lazy initialization - only connect when first used
function getDatabase() {
  if (!isInitialized) {
    initializeDatabase();
  }
  return { pool, db };
}

// Initialize immediately for backward compatibility, but without connection test
initializeDatabase();

export { pool, db, getDatabase };