export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server'
import { backendHeaders } from '../_auth'
import { backendErrorResponse, backendJsonResponse, logBackendProxyError, proxyFailureResponse } from '../_proxyErrors'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(request: NextRequest) {
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
        const headers = backendHeaders(request, { 'Content-Type': 'application/json' })

        const backendResponse = await fetch(`${BACKEND_URL}/create-class`, {
            method: 'POST',
            headers,
            body: JSON.stringify(normalizedBody),
        })

        if (!backendResponse.ok) {
            const errorText = await backendResponse.text()
            logBackendProxyError('create-class proxy', backendResponse.status, errorText)
            return backendErrorResponse('Failed to create class', backendResponse.status)
        }

        return await backendJsonResponse(backendResponse, 'create-class proxy')
    } catch (error) {
        console.error('create-class proxy error:', error)
        return proxyFailureResponse('Failed to create class')
    }
}
