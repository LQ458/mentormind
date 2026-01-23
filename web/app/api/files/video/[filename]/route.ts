import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: { filename: string } }
) {
  // In production, this would serve actual video files
  // For demo, we return a placeholder response
  return NextResponse.json({
    message: 'Video file placeholder',
    filename: params.filename,
    note: 'In production, this would stream the actual MP4 file'
  })
}