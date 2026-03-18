export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const normalizedBody = {
            topic: body.topic,
            language: body.language,
            student_level: body.student_level ?? body.studentLevel,
            duration_minutes: body.duration_minutes ?? body.durationMinutes,
            include_video: body.include_video ?? body.includeVideo,
            include_exercises: body.include_exercises ?? body.includeExercises,
            include_assessment: body.include_assessment ?? body.includeAssessment,
            voice_id: body.voice_id ?? body.voiceId,
            custom_requirements: body.custom_requirements ?? body.customRequirements,
            target_audience: body.target_audience ?? body.targetAudience,
            difficulty_level: body.difficulty_level ?? body.difficultyLevel,
        }
        const authHeader = request.headers.get('Authorization')
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        }
        if (authHeader) {
            headers.Authorization = authHeader
        }

        const backendResponse = await fetch(`${BACKEND_URL}/create-class`, {
            method: 'POST',
            headers,
            body: JSON.stringify(normalizedBody),
        })

        if (!backendResponse.ok) {
            const errorText = await backendResponse.text()
            console.error('create-class backend error:', errorText)
            throw new Error(`Backend error: ${backendResponse.status}`)
        }

        const data = await backendResponse.json()
        return NextResponse.json(data)
    } catch (error) {
        console.error('create-class proxy error:', error)
        return NextResponse.json(
            { error: 'Failed to create class', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
