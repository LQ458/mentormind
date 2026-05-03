'use client'

import React from 'react'

interface SkeletonProps {
  className?: string
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full'
  as?: keyof JSX.IntrinsicElements
}

export function Skeleton({ className = '', rounded = 'md', as: Tag = 'div' }: SkeletonProps) {
  const roundedCls = {
    none: '',
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    full: 'rounded-full',
  }[rounded]
  return (
    <Tag
      aria-hidden="true"
      className={`skeleton-shimmer ${roundedCls} ${className}`}
    />
  )
}

export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={`h-3 ${i === lines - 1 ? 'w-3/5' : 'w-full'}`}
        />
      ))}
    </div>
  )
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`p-6 rounded-xl border border-gray-200 bg-white ${className}`} aria-hidden="true">
      <Skeleton className="h-4 w-24 mb-3" />
      <Skeleton className="h-6 w-2/3 mb-4" />
      <SkeletonText lines={3} />
    </div>
  )
}
