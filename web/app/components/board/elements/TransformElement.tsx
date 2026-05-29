'use client'

import React, { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BlockMath } from 'react-katex'
import 'katex/dist/katex.min.css'
import type { ElementProps } from './types'

export default function TransformElement({ element }: ElementProps) {
  const from = (element.metadata?.transform_from as string | undefined) || element.content
  const to = (element.metadata?.transform_to as string | undefined) || element.content
  const [showTo, setShowTo] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => setShowTo(true), 900)
    return () => clearTimeout(id)
  }, [from, to])

  return (
    <div className="relative min-h-[3rem]">
      <AnimatePresence mode="wait">
        {!showTo ? (
          <motion.div
            key="from"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <BlockMath math={from} />
          </motion.div>
        ) : (
          <motion.div
            key="to"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <BlockMath math={to} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
