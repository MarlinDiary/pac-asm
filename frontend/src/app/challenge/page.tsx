'use client'

import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import GamePage from '@/components/GamePage'
import { getMap } from '@/data/maps'

export default function ChallengePage() {
  // Load the map for challenge mode
  const levelMap = getMap('challenge')
  if (!levelMap) {
    notFound()
  }

  return (
    <Suspense fallback={null}>
      <GamePage levelMap={levelMap} levelId="challenge" isChallenge={true} />
    </Suspense>
  )
}