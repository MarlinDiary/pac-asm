'use client'

import { notFound } from 'next/navigation'
import { useParams } from 'next/navigation'
import GamePage from '@/components/GamePage'
import { getMapByLevel } from '@/data/maps'

export default function LevelPage() {
  const params = useParams()
  const id = params.id as string

  // Load the map for this level
  const levelMap = getMapByLevel(id)
  if (!levelMap) {
    notFound()
  }

  return <GamePage levelMap={levelMap} levelId={id} />
}