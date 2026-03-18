'use client'

import { useState, useRef } from 'react'

export default function DevFormPage() {
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<string>('Ready')
  const [logs, setLogs] = useState<string[]>([])
  const [progress, setProgress] = useState<number>(0)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const addLog = (msg: string) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev])
  }

  const handleUpload = async () => {
    if (!file) return
    setIsUploading(true)
    setStatus('Uploading...')
    setLogs([])
    addLog(`Starting upload: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`)
    
    const startTime = performance.now()
    
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('language', 'zh')
      formData.append('process', 'false') // Just transcribe for speed test

      const response = await fetch('/api/backend/ingest/audio', {
        method: 'POST',
        body: formData,
      })

      const endTime = performance.now()
      const duration = ((endTime - startTime) / 1000).toFixed(2)
      
      addLog(`Request completed in ${duration}s with status ${response.status}`)

      const data = await response.json()
      
      if (response.ok) {
        setStatus('Success')
        addLog(`Response: ${JSON.stringify(data).substring(0, 500)}...`)
        if (data.status === 'processing') {
            addLog(`Background Job ID: ${data.job_id}`)
            startPolling(data.job_id)
        }
      } else {
        setStatus('Failed')
        addLog(`Error: ${data.error || 'Unknown error'}`)
        if (data.details) addLog(`Details: ${data.details}`)
      }
    } catch (err) {
      setStatus('Error')
      addLog(`Network/Fetch Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsUploading(false)
    }
  }

  const startPolling = async (jobId: string) => {
    setStatus('Polling...')
    addLog(`Starting polling for job ${jobId}`)
    let attempts = 0
    const maxAttempts = 600
    
    const poll = async () => {
      if (attempts >= maxAttempts) {
        addLog('Polling timed out after 20 minutes')
        setStatus('Timeout')
        return
      }
      
      try {
        const res = await fetch(`/api/backend/job-status/${jobId}`)
        const data = await res.json()
        
        if (data.success && data.text) {
          addLog(`Transcription Complete! Length: ${data.text.length} chars`)
          addLog(`Text snippet: ${data.text.substring(0, 200)}...`)
          setStatus('Finalized')
          return
        } else if (data.status === 'failed') {
          addLog(`Job failed: ${data.error}`)
          setStatus('Job Failed')
          return
        }
        
        attempts++
        if (attempts % 5 === 0) addLog(`still waiting... (attempt ${attempts})`)
        setTimeout(poll, 2000)
      } catch (err) {
        addLog(`Polling error: ${err}`)
        setTimeout(poll, 5000)
      }
    }
    
    poll()
  }

  return (
    <div className="p-10 max-w-4xl mx-auto bg-gray-900 text-white min-h-screen">
      <h1 className="text-4xl font-bold mb-2 text-blue-400">Developer Speed Test Form</h1>
      <p className="text-gray-400 mb-8">Direct diagnostic tool for large file uploads and ASR performance.</p>
      
      <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 mb-8 shadow-2xl">
        <div className="flex flex-col gap-4">
          <input 
            type="file" 
            ref={fileInputRef}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-gray-400
              file:mr-4 file:py-2 file:px-4
              file:rounded-full file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-600 file:text-white
              hover:file:bg-blue-700 cursor-pointer"
          />
          
          <button
            onClick={handleUpload}
            disabled={!file || isUploading}
            className={`py-3 px-6 rounded-lg font-bold text-lg transition-all ${
              !file || isUploading 
                ? 'bg-gray-600 cursor-not-allowed' 
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:scale-105 active:scale-95 shadow-lg shadow-blue-500/20'
            }`}
          >
            {isUploading ? '🚀 Processing...' : '📤 Start Speed Test'}
          </button>
        </div>
        
        <div className="mt-6 flex items-center gap-4">
          <div className="text-sm font-medium text-gray-500 uppercase tracking-widest">Status:</div>
          <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
            status === 'Success' || status === 'Finalized' ? 'bg-green-500/20 text-green-400' :
            status === 'Failed' || status === 'Error' ? 'bg-red-500/20 text-red-400' :
            status === 'Ready' ? 'bg-gray-700 text-gray-300' : 'bg-blue-500/20 text-blue-400 animate-pulse'
          }`}>
            {status}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        <div className="bg-black/50 p-6 rounded-xl border border-gray-800 font-mono text-sm h-96 overflow-y-auto flex flex-col-reverse">
          {logs.map((log, i) => (
            <div key={i} className={`mb-1 ${log.includes('Error') || log.includes('Failed') ? 'text-red-400' : log.includes('Success') ? 'text-green-400' : 'text-gray-300'}`}>
              {log}
            </div>
          ))}
          {logs.length === 0 && <div className="text-gray-600 italic">No activity yet. Select a file and start.</div>}
        </div>
      </div>
      
      <div className="mt-8 text-center text-gray-500 text-xs">
        MentorMind Dev Diagnostics Tool • Bypasses Client-Side Buffering & Chat UI
      </div>
    </div>
  )
}
