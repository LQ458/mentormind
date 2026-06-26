'use client'

import React from 'react'
import { AnimatePresence, motion } from 'framer-motion'

interface SubtitleOverlayProps {
  currentNarration: string | null
}

export default function SubtitleOverlay({ currentNarration }: SubtitleOverlayProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-6">
      <AnimatePresence>
        {currentNarration ? (
          <motion.div
            key={currentNarration}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.3 }}
            className="pointer-events-auto max-w-3xl max-h-[30vh] sm:max-h-[40vh] overflow-y-auto rounded-xl bg-black/70 backdrop-blur text-white text-sm sm:text-base leading-relaxed px-4 py-2.5 shadow-lg text-center"
          >
            {currentNarration}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
