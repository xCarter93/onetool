"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence, useInView } from "motion/react";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

export interface DataPoint {
  /** Numeric value for the data point */
  value: number;
  /** Optional label for the data point */
  label?: string;
}

export interface SimpleGraphProps {
  /** Array of data points to plot on the graph */
  data: DataPoint[];
  /** Color of the line (CSS color value) */
  lineColor?: string;
  /** Color of the dots (CSS color value) */
  dotColor?: string;
  /** Width of the graph container */
  width?: string | number;
  /** Height of the graph in pixels */
  height?: number;
  /** Duration of the line draw animation in seconds */
  animationDuration?: number;
  /** Show background grid lines */
  showGrid?: boolean;
  /** Style of grid lines */
  gridStyle?: "solid" | "dashed" | "dotted";
  /** Which grid lines to show */
  gridLines?: "vertical" | "horizontal" | "both";
  /** Thickness of grid lines in pixels */
  gridLineThickness?: number;
  /** Show dots at each data point */
  showDots?: boolean;
  /** Size of the dots in pixels */
  dotSize?: number;
  /** Ring drawn around each dot — set to the surface colour behind the chart */
  dotRingColor?: string;
  /** Horizontal inset of the plot area, in pixels */
  paddingX?: number;
  /** Vertical inset of the plot area, in pixels */
  paddingY?: number;
  /** Show glow effect on dots when hovering */
  dotHoverGlow?: boolean;
  /** Curve the line between points */
  curved?: boolean;
  /** Show gradient fill under the line */
  gradientFade?: boolean;
  /** Thickness of the main graph line in pixels */
  graphLineThickness?: number;
  /** Calculate and display percentage difference between periods */
  calculatePercentageDifference?: boolean;
  /** Animate when scrolled into view */
  animateOnScroll?: boolean;
  /** Only animate once (requires animateOnScroll) */
  animateOnce?: boolean;
  /** Additional CSS classes */
  className?: string;
}

const SimpleGraph = ({
  data,
  lineColor = "#5227FF",
  dotColor = "#5227FF",
  width = "100%",
  height = 300,
  animationDuration = 2,
  showGrid = true,
  gridStyle = "solid",
  gridLines = "both",
  gridLineThickness = 1,
  showDots = true,
  dotSize = 6,
  dotRingColor = "white",
  paddingX = 8,
  paddingY = 24,
  dotHoverGlow = false,
  curved = true,
  gradientFade = false,
  graphLineThickness = 3,
  calculatePercentageDifference = false,
  animateOnScroll = false,
  animateOnce = true,
  className,
}: SimpleGraphProps) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipRotation, setTooltipRotation] = useState<number>(0);
  const [tooltipOffsetX, setTooltipOffsetX] = useState<number>(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: animateOnce, amount: 0.3 });

  const shouldAnimate = animateOnScroll ? isInView : true;

  /* The plot is laid out in real CSS pixels, not in a fixed viewBox: a fixed
   * viewBox + the default preserveAspectRatio letterboxes the SVG whenever the
   * container's aspect ratio differs from it, so the line never reaches the
   * container's edges. Measured box → 1:1 units → strokes and dots also render
   * at their stated pixel size. */
  const [box, setBox] = useState({ w: 0, h: height });

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      setBox({ w: r.width, h: r.height });
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const baseline = box.h - paddingY;

  const { points, pathD } = useMemo(() => {
    if (!data || data.length === 0 || box.w === 0) {
      return { points: [], pathD: "" };
    }

    const values = data.map((d) => d.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const rangeVal = maxVal - minVal || 1;

    const padding = 0.1;
    const paddedMin = minVal - rangeVal * padding;
    const paddedMax = maxVal + rangeVal * padding;
    const paddedRange = paddedMax - paddedMin;

    const graphWidth = Math.max(0, box.w - paddingX * 2);
    const graphHeight = Math.max(0, box.h - paddingY * 2);

    const calculatedPoints = data.map((d, i) => {
      const x = paddingX + (i / (data.length - 1 || 1)) * graphWidth;
      const y =
        paddingY +
        graphHeight -
        ((d.value - paddedMin) / paddedRange) * graphHeight;
      return { x, y, value: d.value, label: d.label };
    });

    let path = "";
    if (calculatedPoints.length > 0) {
      if (curved && calculatedPoints.length > 1) {
        path = `M ${calculatedPoints[0].x},${calculatedPoints[0].y}`;

        for (let i = 0; i < calculatedPoints.length - 1; i++) {
          const current = calculatedPoints[i];
          const next = calculatedPoints[i + 1];

          const controlX1 = current.x + (next.x - current.x) * 0.5;
          const controlY1 = current.y;
          const controlX2 = current.x + (next.x - current.x) * 0.5;
          const controlY2 = next.y;

          path += ` C ${controlX1},${controlY1} ${controlX2},${controlY2} ${next.x},${next.y}`;
        }
      } else {
        path = calculatedPoints
          .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x},${p.y}`)
          .join(" ");
      }
    }

    return {
      points: calculatedPoints,
      pathD: path,
    };
  }, [data, curved, box.w, box.h, paddingX, paddingY]);

  const widthStyle = typeof width === "number" ? `${width}px` : width;

  const handleMouseMove = (
    event: React.MouseEvent<SVGElement>,
    index: number,
  ) => {
    if (!svgRef.current) return;

    const svg = svgRef.current;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const svgPoint = point.matrixTransform(svg.getScreenCTM()?.inverse());

    const dotX = points[index].x;

    const deltaX = svgPoint.x - dotX;

    const maxRotation = 15;
    const rotation = Math.max(
      -maxRotation,
      Math.min(maxRotation, deltaX * 0.2),
    );

    const maxOffset = 20;
    const offsetX = Math.max(-maxOffset, Math.min(maxOffset, deltaX * 0.15));

    setTooltipRotation(rotation);
    setTooltipOffsetX(offsetX);
  };

  const getPercentageDifference = (
    index: number,
  ): { percentage: number; isIncrease: boolean } | null => {
    if (!calculatePercentageDifference || index === 0 || !data[index - 1]) {
      return null;
    }

    const currentValue = data[index].value;
    const previousValue = data[index - 1].value;

    if (previousValue === 0) return null;

    const difference = currentValue - previousValue;
    const percentage = (difference / Math.abs(previousValue)) * 100;

    return {
      percentage: Math.abs(percentage),
      isIncrease: difference >= 0,
    };
  };

  const gradientFillPath = useMemo(() => {
    if (!gradientFade || points.length === 0) return "";

    let path = `M ${points[0].x},${baseline} L ${points[0].x},${points[0].y}`;

    if (curved && points.length > 1) {
      for (let i = 0; i < points.length - 1; i++) {
        const current = points[i];
        const next = points[i + 1];

        const controlX1 = current.x + (next.x - current.x) * 0.5;
        const controlY1 = current.y;
        const controlX2 = current.x + (next.x - current.x) * 0.5;
        const controlY2 = next.y;

        path += ` C ${controlX1},${controlY1} ${controlX2},${controlY2} ${next.x},${next.y}`;
      }
    } else {
      for (let i = 1; i < points.length; i++) {
        path += ` L ${points[i].x},${points[i].y}`;
      }
    }

    path += ` L ${points[points.length - 1].x},${baseline} Z`;

    return path;
  }, [points, curved, gradientFade, baseline]);

  return (
    <div
      ref={containerRef}
      className={cn("relative", className)}
      style={{ width: widthStyle, height: `${height}px` }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${box.w} ${box.h}`}
        className="w-full h-full"
        style={{ overflow: "visible" }}
      >
        <defs>
          <linearGradient
            id="line-gradient"
            x1="0"
            y1={paddingY}
            x2="0"
            y2={baseline}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>

        {showGrid && (
          <g opacity="0.1">
            {(gridLines === "horizontal" || gridLines === "both") &&
              [0, 1, 2, 3, 4].map((i) => (
                <line
                  key={`h-${i}`}
                  x1={paddingX}
                  y1={paddingY + (i * (baseline - paddingY)) / 4}
                  x2={box.w - paddingX}
                  y2={paddingY + (i * (baseline - paddingY)) / 4}
                  stroke="currentColor"
                  strokeWidth={gridLineThickness}
                  strokeDasharray={
                    gridStyle === "dashed"
                      ? "5,5"
                      : gridStyle === "dotted"
                        ? "1,3"
                        : undefined
                  }
                />
              ))}
            {(gridLines === "vertical" || gridLines === "both") &&
              points.map((point, i) => (
                <line
                  key={`v-${i}`}
                  x1={point.x}
                  y1={paddingY}
                  x2={point.x}
                  y2={baseline}
                  stroke="currentColor"
                  strokeWidth={gridLineThickness}
                  strokeDasharray={
                    gridStyle === "dashed"
                      ? "5,5"
                      : gridStyle === "dotted"
                        ? "1,3"
                        : undefined
                  }
                />
              ))}
          </g>
        )}

        {gradientFade && (
          <motion.path
            d={gradientFillPath}
            fill="url(#line-gradient)"
            initial={{ opacity: 0 }}
            animate={{ opacity: shouldAnimate ? 1 : 0 }}
            transition={{
              duration: 0.6,
              delay: animationDuration,
              ease: "easeInOut",
            }}
          />
        )}

        <motion.path
          d={pathD}
          fill="none"
          stroke={lineColor}
          strokeWidth={graphLineThickness}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: shouldAnimate ? 1 : 0 }}
          transition={{
            duration: animationDuration,
            ease: "easeInOut",
          }}
        />

        {showDots &&
          points.map((point, index) => (
            <g
              key={index}
              onMouseEnter={() => {
                setHoveredIndex(index);
                setTooltipRotation(0);
                setTooltipOffsetX(0);
              }}
              onMouseLeave={() => setHoveredIndex(null)}
              onMouseMove={(e) => handleMouseMove(e, index)}
              style={{ cursor: "pointer" }}
            >
              {/* Hit target: half the point spacing, so neighbours never overlap. */}
              <circle
                cx={point.x}
                cy={point.y}
                r={Math.max(
                  dotSize * 2,
                  (box.w - paddingX * 2) / (points.length - 1 || 1) / 2,
                )}
                fill="transparent"
                style={{ pointerEvents: "all" }}
              />

              {dotHoverGlow && hoveredIndex === index && (
                <motion.circle
                  cx={point.x}
                  cy={point.y}
                  r={dotSize * 2}
                  fill={dotColor}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.3 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ filter: "blur(8px)", pointerEvents: "none" }}
                />
              )}

              <motion.circle
                cx={point.x}
                cy={point.y}
                r={dotSize}
                fill={dotColor}
                strokeWidth="2"
                /* Ring goes through style, not the presentation attribute:
                 * var() only resolves in CSS. */
                style={{ pointerEvents: "none", stroke: dotRingColor }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{
                  scale: hoveredIndex === index ? 1.5 : 1,
                  opacity: shouldAnimate ? 1 : 0,
                }}
                transition={{
                  scale: { type: "spring", stiffness: 400, damping: 25 },
                  opacity: {
                    duration: 0.3,
                    delay:
                      (index / (points.length - 1 || 1)) * animationDuration,
                  },
                }}
              />
            </g>
          ))}

        <AnimatePresence>
          {hoveredIndex !== null &&
            points[hoveredIndex] &&
            !(calculatePercentageDifference && hoveredIndex === 0) &&
            (() => {
              return (
                <foreignObject
                  key={hoveredIndex}
                  x={points[hoveredIndex].x - 75}
                  y={points[hoveredIndex].y - 84}
                  width="150"
                  height="84"
                  style={{ overflow: "visible", pointerEvents: "none" }}
                >
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8, x: 0 }}
                    animate={{
                      opacity: 1,
                      scale: 1,
                      x: tooltipOffsetX,
                      rotate: tooltipRotation,
                    }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{
                      duration: 0.15,
                      x: { type: "spring", stiffness: 300, damping: 30 },
                      rotate: { type: "spring", stiffness: 300, damping: 30 },
                    }}
                    className="flex items-center justify-center"
                    style={{ pointerEvents: "none" }}
                  >
                    <div className="relative">
                      <div className="bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100 px-3 py-2 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 whitespace-nowrap">
                        {calculatePercentageDifference && hoveredIndex > 0 ? (
                          (() => {
                            const diff = getPercentageDifference(hoveredIndex);
                            if (!diff) {
                              return (
                                <div className="text-sm font-semibold">
                                  {points[hoveredIndex].value.toFixed(2)}
                                </div>
                              );
                            }
                            return (
                              <div className="flex items-center gap-1.5">
                                {diff.isIncrease ? (
                                  <TrendingUp className="w-4 h-4 text-green-400" />
                                ) : (
                                  <TrendingDown className="w-4 h-4 text-red-400" />
                                )}
                                <span
                                  className={cn(
                                    "text-sm font-semibold",
                                    diff.isIncrease
                                      ? "text-green-400"
                                      : "text-red-400",
                                  )}
                                >
                                  {diff.isIncrease ? "+" : "-"}
                                  {diff.percentage.toFixed(1)}%
                                </span>
                              </div>
                            );
                          })()
                        ) : (
                          <div className="text-sm font-semibold">
                            {points[hoveredIndex].value.toFixed(2)}
                          </div>
                        )}
                        {data[hoveredIndex].label && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {data[hoveredIndex].label}
                          </div>
                        )}
                      </div>
                      <div
                        className="absolute left-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-white dark:border-t-[#1a1a1a]"
                        style={{
                          bottom: "-4px",
                          transform: "translateX(-50%)",
                        }}
                      />
                    </div>
                  </motion.div>
                </foreignObject>
              );
            })()}
        </AnimatePresence>
      </svg>
    </div>
  );
};

SimpleGraph.displayName = "SimpleGraph";

export default SimpleGraph;
