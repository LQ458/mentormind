export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
    // Get all headers
    const headersList = Object.fromEntries(request.headers.entries())

    // Get relevant environment variables
    const envVars = {
        BACKEND_URL: process.env.BACKEND_URL || 'Not Set',
        NODE_ENV: process.env.NODE_ENV || 'Not Set',
        ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || 'Not Set',
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'Not Set',
        NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'Not Set',
    }

    return NextResponse.json({
        timestamp: new Date().toISOString(),
        requestInfo: {
            url: request.url,
            method: request.method,
        },
        headers: headersList,
        environment: envVars
    })
}
