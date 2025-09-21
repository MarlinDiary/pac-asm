'use client';

import * as React from 'react';
import { motion, type Variants } from 'motion/react';

interface StarProps {
  size?: number;
  animation?: keyof typeof animations;
  className?: string;
  style?: React.CSSProperties;
}

const animations = {
  'path-loop': {
    group: {},
    path: {
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
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size = 24, animation = 'path-loop', className, style }: StarProps) {
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
      initial="initial"
      animate="animate"
      className={className}
      style={style}
    >
      <motion.path
        d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"
        variants={variants.path}
        initial="initial"
        animate="animate"
      />
    </motion.svg>
  );
}

function Star(props: StarProps) {
  return <IconComponent {...props} />;
}

export {
  animations,
  Star,
  Star as StarIcon,
  type StarProps,
  type StarProps as StarIconProps,
};