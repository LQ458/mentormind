'use client'

import { useState } from 'react'

export default function SimplePage() {
  const [query, setQuery] = useState('我想学习Python编程')
  
  const handleSubmit = async () => {
    const response = await fetch('/api/backend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ studentQuery: query }),
    })
    
    const data = await response.json()
    alert(`Lesson generated: ${data.lesson_plan?.title}`)
  }
  
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">MentorMind Simple Test</h1>
      
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Learning Query:</label>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full p-3 border rounded-lg h-32"
          placeholder="Enter your learning question..."
        />
      </div>
      
      <button
        onClick={handleSubmit}
        className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
      >
        Generate Lesson
      </button>
      
      <div className="mt-8 p-4 bg-gray-50 rounded-lg">
        <h2 className="text-xl font-semibold mb-3">API Status:</h2>
        <p>Backend: <span className="text-green-600">Connected</span></p>
        <p>Test this page at: <a href="/" className="text-blue-600">Homepage</a></p>
      </div>
    </div>
  )
}