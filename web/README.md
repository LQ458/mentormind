# MentorMind Web Interface

A simple Next.js web interface for testing the MentorMind backend service.

## Features

- 🎓 **Student Query Interface**: Input learning questions
- 📋 **Lesson Plan Viewer**: Display generated lesson plans with steps
- 🎥 **Output Preview**: View generated scripts, audio, and video metadata
- 💰 **Cost Analysis**: Real-time cost tracking
- 📊 **System Status**: Monitor backend services
- 🎨 **Clean UI**: Modern, responsive design with Tailwind CSS

## Quick Start

### 1. Install Dependencies

```bash
cd web
npm install
```

### 2. Run Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## Project Structure

```
web/
├── app/
│   ├── api/                    # API routes
│   │   ├── backend/           # Backend simulation
│   │   └── files/             # File serving routes
│   ├── layout.tsx            # Root layout
│   ├── page.tsx             # Main page (client component)
│   └── globals.css          # Global styles
├── public/                   # Static assets
└── package.json             # Dependencies
```

## API Endpoints

### `POST /api/backend`
Process a student query and generate a lesson plan.

**Request:**
```json
{
  "studentQuery": "我想学习Python编程"
}
```

**Response:**
```json
{
  "lesson_plan": { ... },
  "output_result": { ... },
  "quality_assessment": { ... }
}
```

### `GET /api/backend`
Get system status and configuration.

### `GET /api/files/audio/[filename]`
Get audio file metadata (placeholder).

### `GET /api/files/video/[filename]`
Get video file metadata (placeholder).

## Integration with Backend

The web interface currently uses simulated data. To connect to the actual MentorMind backend:

1. Update the API calls in `app/page.tsx` to point to your backend server
2. Implement real file serving in the API routes
3. Add authentication if needed

## Development

### Technologies Used

- **Next.js 14** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS** - Utility-first CSS framework
- **Lucide React** - Icon library
- **Axios** - HTTP client

### Key Components

1. **Main Page (`app/page.tsx`)**
   - Student query input with example queries
   - Lesson plan display with tabs
   - Cost analysis panel
   - System status monitoring

2. **API Routes**
   - Simulate backend responses
   - Provide file metadata
   - Handle CORS if needed

### Customization

- Update colors in `tailwind.config.js`
- Modify layout in `app/layout.tsx`
- Add new API endpoints as needed
- Extend with real backend integration

## Production Deployment

### Build for Production

```bash
npm run build
npm start
```

### Environment Variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000  # Your backend URL
```

### Docker Deployment

```bash
docker build -t mentormind-web .
docker run -p 3000:3000 mentormind-web
```

## Notes

- The video and audio files are placeholders in this demo
- All costs are simulated for demonstration
- The backend integration is simulated but follows the actual API structure
- Chinese language support is built-in for teaching content

## Next Steps

1. **Real Backend Integration**: Connect to the actual MentorMind Python backend
2. **File Upload**: Allow uploading of audio/video for processing
3. **User Authentication**: Add student/teacher accounts
4. **Progress Tracking**: Track student learning progress
5. **Real-time Updates**: WebSocket for live generation status