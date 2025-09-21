'use client';

import * as React from 'react';
import { motion, type Variants } from 'motion/react';

interface HammerProps {
  size?: number;
  animation?: keyof typeof animations;
  className?: string;
  style?: React.CSSProperties;
}

const animations = {
  'path-loop': {
    group: {},
    path1: {
      initial: {
        pathLength: 0,
        opacity: 0,
      },
      animate: {
        pathLength: [0, 1, 1, 0],
        opacity: [0, 1, 1, 0],
        transition: {
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
          times: [0, 0.3, 0.7, 1],
        },
      },
    },
    path2: {
      initial: {
        pathLength: 0,
        opacity: 0,
      },
      animate: {
        pathLength: [0, 1, 1, 0],
        opacity: [0, 1, 1, 0],
        transition: {
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
          times: [0, 0.3, 0.7, 1],
          delay: 0.2,
        },
      },
    },
    path3: {
      initial: {
        pathLength: 0,
        opacity: 0,
      },
      animate: {
        pathLength: [0, 1, 1, 0],
        opacity: [0, 1, 1, 0],
        transition: {
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
          times: [0, 0.3, 0.7, 1],
          delay: 0.4,
        },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size = 24, animation = 'path-loop', className, style }: HammerProps) {
  const variants = animations[animation];

  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      variants={variants.group}
      className={className}
      style={style}
    >
      <motion.path
        d="m15 12-8.373 8.373a1 1 0 1 1-3-3L12 9"
        variants={variants.path1}
        initial="initial"
        animate="animate"
      />
      <motion.path
        d="m18 15 4-4"
        variants={variants.path2}
        initial="initial"
        animate="animate"
      />
      <motion.path
        d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756L9 2.96l.92.82A6.18 6.18 0 0 1 12 8.4V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5"
        variants={variants.path3}
        initial="initial"
        animate="animate"
      />
    </motion.svg>
  );
}

function Hammer(props: HammerProps) {
  return <IconComponent {...props} />;
}

export {
  animations,
  Hammer,
  Hammer as HammerIcon,
  type HammerProps,
  type HammerProps as HammerIconProps,
};
