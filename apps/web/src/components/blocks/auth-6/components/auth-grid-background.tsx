"use client"

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from "react"
import { motion } from "motion/react"

import { cn } from "@/lib/utils"

export interface AnimatedGridPatternProps extends ComponentPropsWithoutRef<"svg"> {
  width?: number
  height?: number
  x?: number
  y?: number
  strokeDasharray?: number
  numSquares?: number
  maxOpacity?: number
  duration?: number
  repeatDelay?: number
}

type Square = {
  id: number
  pos: [number, number]
  iteration: number
}

// Deterministic 0..1 hash so cell placement stays stable across renders without
// Math.random, so SSR and client agree and the no-randomness gate stays green.
function pseudoRandom(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453
  return value - Math.floor(value)
}

export function AnimatedGridPattern({
  width = 40,
  height = 40,
  x = -1,
  y = -1,
  strokeDasharray = 0,
  numSquares = 30,
  className,
  maxOpacity = 0.1,
  duration = 3,
  repeatDelay = 1,
  ...props
}: AnimatedGridPatternProps) {
  const id = useId()
  const containerRef = useRef<SVGSVGElement | null>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [squares, setSquares] = useState<Array<Square>>([])

  const getPos = useCallback(
    (seed: number): [number, number] => {
      const cols = Math.max(1, Math.floor(dimensions.width / width))
      const rows = Math.max(1, Math.floor(dimensions.height / height))
      return [
        Math.floor(pseudoRandom(seed) * cols),
        Math.floor(pseudoRandom(seed + 0.5) * rows),
      ]
    },
    [dimensions.height, dimensions.width, height, width]
  )

  const generateSquares = useCallback(
    (count: number) => {
      return Array.from({ length: count }, (_, index) => ({
        id: index,
        pos: getPos(index + 1),
        iteration: 0,
      }))
    },
    [getPos]
  )

  const updateSquarePosition = useCallback(
    (squareId: number) => {
      setSquares((currentSquares) => {
        const current = currentSquares[squareId]
        if (!current || current.id !== squareId) {
          return currentSquares
        }

        const nextSquares = currentSquares.slice()
        const nextIteration = current.iteration + 1
        nextSquares[squareId] = {
          ...current,
          pos: getPos((squareId + 1) * 97 + nextIteration * 13),
          iteration: nextIteration,
        }

        return nextSquares
      })
    },
    [getPos]
  )

  useEffect(() => {
    if (dimensions.width && dimensions.height) {
      setSquares(generateSquares(numSquares))
    }
  }, [dimensions.width, dimensions.height, generateSquares, numSquares])

  useEffect(() => {
    const element = containerRef.current
    if (!element) {
      return
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions((currentDimensions) => {
          const nextWidth = entry.contentRect.width
          const nextHeight = entry.contentRect.height

          if (
            currentDimensions.width === nextWidth &&
            currentDimensions.height === nextHeight
          ) {
            return currentDimensions
          }

          return { width: nextWidth, height: nextHeight }
        })
      }
    })

    resizeObserver.observe(element)

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  return (
    <svg
      ref={containerRef}
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 h-full w-full fill-gray-400/12 stroke-gray-400/9 dark:fill-gray-500/9 dark:stroke-gray-500/8",
        className
      )}
      {...props}
    >
      <defs>
        <pattern
          id={id}
          width={width}
          height={height}
          patternUnits="userSpaceOnUse"
          x={x}
          y={y}
        >
          <path
            d={`M.5 ${height}V.5H${width}`}
            fill="none"
            strokeDasharray={strokeDasharray}
          />
        </pattern>
      </defs>

      <rect width="100%" height="100%" fill={`url(#${id})`} />

      <svg x={x} y={y} className="overflow-visible">
        {squares.map(({ pos: [squareX, squareY], id, iteration }, index) => (
          <motion.rect
            key={`${id}-${iteration}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: maxOpacity }}
            transition={{
              duration,
              repeat: 1,
              delay: index * 0.1,
              repeatType: "reverse",
              repeatDelay,
            }}
            onAnimationComplete={() => updateSquarePosition(id)}
            width={width - 1}
            height={height - 1}
            x={squareX * width + 1}
            y={squareY * height + 1}
            fill="currentColor"
            strokeWidth="0"
          />
        ))}
      </svg>
    </svg>
  )
}

export function AuthGridBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <AnimatedGridPattern
        numSquares={28}
        maxOpacity={0.12}
        duration={3}
        repeatDelay={1.1}
        className="text-primary fill-primary/12 stroke-primary/15 dark:fill-primary/10 dark:stroke-primary/12 inset-x-0 inset-y-[-30%] h-[200%] skew-y-12 mask-[radial-gradient(560px_circle_at_center,white,transparent)]"
      />
    </div>
  )
}