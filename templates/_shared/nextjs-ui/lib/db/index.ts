import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";

// Strip common URL prefixes so DATABASE_URL works with both
// plain paths ("local.db") and URL formats ("file:local.db")
let dbPath = process.env.DATABASE_URL || "local.db";
dbPath = dbPath.replace(/^file:/, "").replace(/^sqlite[^:]*:\/\/\//, "");

const sqlite = new Database(dbPath);
export const db = drizzle(sqlite, { schema });
