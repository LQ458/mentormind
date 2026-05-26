import { betterAuth } from 'better-auth'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.BETTER_AUTH_DB_URL,
  max: 5,
  idleTimeoutMillis: 30000,
})

export const auth = betterAuth({
  database: pool,
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  session: {
    strategy: 'jwt',
    expiresIn: 60 * 60 * 24, // 24 hours
    updateAge: 60 * 60,      // refresh every hour
  },
  secret: process.env.BETTER_AUTH_SECRET || '',
  basePath: '/api/auth',
  baseURL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  trustedOrigins: [
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    process.env.BACKEND_URL || 'http://127.0.0.1:8000',
  ].filter(Boolean) as string[],
})
