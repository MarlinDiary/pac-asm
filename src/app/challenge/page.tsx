'use client'

import { notFound } from 'next/navigation'
import GamePage from '@/components/GamePage'
import { getMapByLevel } from '@/data/maps'

export default function ChallengePage() {
  // Load the map for challenge mode - using a default level
  const levelMap = getMapByLevel('1') // You can change this to any default level
  if (!levelMap) {
    notFound()
  }

  return <GamePage levelMap={levelMap} levelId="challenge" isChallenge={true} />
}