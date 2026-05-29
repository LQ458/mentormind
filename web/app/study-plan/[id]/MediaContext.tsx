'use client'

import { useState, useEffect, useCallback } from 'react'

interface MediaItem {
  id: string
  media_type: string
  file_size_bytes: number
  extracted_text: string | null
  ai_answer: string | null
  question: string | null
  context_metadata: Record<string, string>
  has_file: boolean
  created_at: string | null
}

interface StorageUsage {
  usage_bytes: number
  usage_mb: number
  quota_bytes: number
  quota_mb: number | null
  item_count: number
  is_unlimited: boolean
}

export default function MediaContextTab({ getAuthHeaders }: { getAuthHeaders: () => Promise<Record<string, string>> }) {
  const [items, setItems] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [usage, setUsage] = useState<StorageUsage | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const fetchItems = useCallback(async () => {
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/backend/user/media-context?limit=50', {
        headers,
      })
      if (res.ok) {
        const data = await res.json()
        setItems(data.items || [])
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [getAuthHeaders])

  const fetchUsage = useCallback(async () => {
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/backend/user/storage-usage', {
        headers,
      })
      if (res.ok) {
        setUsage(await res.json())
      }
    } catch {
      // silent
    }
  }, [getAuthHeaders])

  useEffect(() => {
    fetchItems()
    fetchUsage()
  }, [fetchItems, fetchUsage])

  const handleDelete = async (id: string) => {
    setDeleting(id)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`/api/backend/user/media-context/${id}`, {
        method: 'DELETE',
        headers,
      })
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== id))
        fetchUsage()
      }
    } catch {
      // silent
    } finally {
      setDeleting(null)
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  const formatDate = (iso: string | null) => {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  }

  if (loading) {
    return <div className="text-center py-8 text-gray-400">Loading your context...</div>
  }

  return (
    <div className="space-y-4">
      {/* Storage usage bar */}
      {usage && (
        <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
              <span className="font-medium">{usage.item_count} items</span>
              <span className="text-gray-300">|</span>
              <span>{formatSize(usage.usage_bytes)} used</span>
              {!usage.is_unlimited && usage.quota_mb && (
                <>
                  <span className="text-gray-300">|</span>
                  <span>{usage.quota_mb} MB limit</span>
                </>
              )}
              {usage.is_unlimited && (
                <span className="text-green-600 text-xs font-medium bg-green-50 px-2 py-0.5 rounded-full">Unlimited</span>
              )}
            </div>
            {!usage.is_unlimited && usage.quota_bytes > 0 && (
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-500 rounded-full h-2 transition-all"
                  style={{ width: `${Math.min(100, (usage.usage_bytes / usage.quota_bytes) * 100)}%` }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg mb-2">No saved context yet</p>
          <p className="text-sm">Use the screenshot or highlight tool while studying to save context here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => {
            const isExpanded = expandedId === item.id
            return (
              <div
                key={item.id}
                className="border border-gray-200 rounded-lg overflow-hidden hover:border-gray-300 transition-colors"
              >
                <div
                  className="flex items-center gap-3 p-3 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                >
                  <span className="text-lg">
                    {item.media_type === 'image' ? '\uD83D\uDDBC\uFE0F' : '\uD83D\uDCDD'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {item.question || item.extracted_text?.slice(0, 60) || 'Saved context'}
                    </p>
                    <p className="text-xs text-gray-400">
                      {formatDate(item.created_at)}
                      {item.context_metadata?.subject && ` \u00B7 ${item.context_metadata.subject}`}
                      {item.context_metadata?.unit_title && ` \u00B7 ${item.context_metadata.unit_title}`}
                    </p>
                  </div>
                  <span className="text-xs text-gray-300">{formatSize(item.file_size_bytes)}</span>
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100 p-4 bg-gray-50 space-y-3">
                    {item.has_file && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">Screenshot</p>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/backend/user/media-context/${item.id}/image`}
                          alt="Saved screenshot"
                          className="max-w-full max-h-48 rounded border border-gray-200"
                        />
                      </div>
                    )}
                    {item.extracted_text && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">Extracted Text</p>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap bg-white p-2 rounded border border-gray-200">
                          {item.extracted_text}
                        </p>
                      </div>
                    )}
                    {item.question && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">Question</p>
                        <p className="text-sm text-gray-700">{item.question}</p>
                      </div>
                    )}
                    {item.ai_answer && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">AI Answer</p>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.ai_answer}</p>
                      </div>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(item.id) }}
                      disabled={deleting === item.id}
                      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                    >
                      {deleting === item.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
