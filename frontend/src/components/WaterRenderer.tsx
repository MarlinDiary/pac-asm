'use client'

import { getImageProps } from 'next/image';
import { memo } from 'react';

interface WaterRendererProps {
  tilesX: number;
  tilesY: number;
  tileSize?: number;
  className?: string;
}

const DEFAULT_TILE_SIZE = 64;

function WaterRenderer({
  tilesX,
  tilesY,
  tileSize = DEFAULT_TILE_SIZE,
  className = ""
}: WaterRendererProps) {
  // Use the same optimized images and density choices as next/image. One
  // repeating paint replaces thousands of identical image/layout nodes.
  const { props: { src, srcSet } } = getImageProps({
    src: '/res/water.png',
    alt: 'Water tile',
    width: tileSize,
    height: tileSize,
  });
  const imageSet = srcSet?.split(', ').map(candidate => {
    const separator = candidate.lastIndexOf(' ');
    return `url("${candidate.slice(0, separator)}") ${candidate.slice(separator + 1)}`;
  }).join(', ');

  return (
    <div
      className={`relative ${className}`}
      style={{ width: tilesX * tileSize, height: tilesY * tileSize }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.13] dark:opacity-[0.008]"
        style={{
          backgroundImage: imageSet ? `image-set(${imageSet})` : `url("${src}")`,
          backgroundRepeat: 'repeat',
          backgroundSize: `${tileSize}px ${tileSize}px`,
        }}
      />
    </div>
  );
}

export default memo(WaterRenderer);
