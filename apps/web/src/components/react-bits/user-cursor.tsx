"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type SVGProps,
} from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useVelocity,
  type MotionValue,
  type SpringOptions,
} from "motion/react";

import { cn } from "@/lib/utils";

export type UserCursorTrigger = "always" | "hover" | "press";

export interface UserCursorClassNames {
  /** Root wrapper (the surface the cursor lives in). */
  root?: string;
  /** The motion layer that follows the pointer. */
  cursor?: string;
  /** The arrow / glyph element. */
  arrow?: string;
  /** The label pill. */
  label?: string;
  /** Inner text node of the label. */
  labelText?: string;
}

export interface UserCursorProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
> {
  /** Wrapped content. The custom cursor is shown over this region. */
  children?: ReactNode;
  /** Text rendered inside the label pill. */
  name?: string;
  /** Replace the default arrow with custom JSX. Receives the resolved color. */
  arrow?: ReactNode | ((color: string) => ReactNode);
  /** Replace the default label with custom JSX. */
  label?: ReactNode;
  /** Solid fill color for the arrow + label. */
  color?: string;
  /** Text color used inside the label. */
  textColor?: string;
  /** Arrow size in px (square bounding box). */
  size?: number;
  /** Visual tilt of the arrow in degrees. Used as the resting angle when `directionAwareTilt` is on. */
  tilt?: number;
  /** Smoothly rotate the arrow + label to point in the direction of pointer movement. */
  directionAwareTilt?: boolean;
  /** Maximum rotation applied to the label when `directionAwareTilt` is on, in degrees. */
  labelTiltStrength?: number;
  /** When the cursor should be visible. */
  trigger?: UserCursorTrigger;
  /** Show or hide the label pill. */
  showLabel?: boolean;
  /** Hide the OS / browser cursor inside the surface. */
  hideNativeCursor?: boolean;
  /** Render the cursor in a fixed full-viewport layer instead of the surface. */
  fullScreen?: boolean;
  /** Spring config for the cursor body. Lower stiffness = floatier. */
  spring?: SpringOptions;
  /** Spring config for the label pill (defaults to a slightly laggier spring). */
  labelSpring?: SpringOptions;
  /** Pixel offset from the pointer to the cursor's anchor. */
  offset?: { x?: number; y?: number };
  /** Pixel offset from the cursor's anchor to the label pill. */
  labelOffset?: { x?: number; y?: number };
  /** Scale applied while the pointer is pressed. */
  pressScale?: number;
  /** Granular className overrides. */
  classNames?: UserCursorClassNames;
  /** Render nothing on touch / coarse-pointer devices. Defaults to true. */
  hideOnTouch?: boolean;
  /** z-index applied to the cursor layer. */
  zIndex?: number;
  /**
   * Drive the cursor from an external MotionValue instead of the pointer.
   * Supply BOTH `positionX` and `positionY` to enter controlled mode: pointer
   * listeners are not attached and the native cursor is left alone, so several
   * of these can be scripted over one surface (fake collaborator cursors).
   * When either is omitted the component behaves exactly as before.
   */
  positionX?: MotionValue<number>;
  /** See `positionX`. Both must be supplied for controlled mode. */
  positionY?: MotionValue<number>;
}

interface ArrowGlyphProps extends SVGProps<SVGSVGElement> {
  color: string;
  size: number;
}

const ArrowGlyph = ({ color, size, ...rest }: ArrowGlyphProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden
    {...rest}
  >
    <path
      d="M5.2 3.4c-.7-.3-1.5.4-1.2 1.1l5.7 14.8c.3.8 1.5.8 1.8 0l2.4-6 6-2.4c.8-.3.8-1.5 0-1.8L5.2 3.4Z"
      fill={color}
      stroke="rgba(0,0,0,0.18)"
      strokeWidth={1.2}
      strokeLinejoin="round"
    />
  </svg>
);

const DEFAULT_SPRING: SpringOptions = {
  stiffness: 380,
  damping: 32,
  mass: 0.6,
};

const DEFAULT_LABEL_SPRING: SpringOptions = {
  stiffness: 220,
  damping: 26,
  mass: 0.7,
};

const UserCursor = forwardRef<HTMLDivElement, UserCursorProps>(
  function UserCursor(
    {
      children,
      name = "Sophie",
      arrow,
      label,
      color = "#F39C2A",
      textColor = "#ffffff",
      size = 28,
      tilt = -14,
      directionAwareTilt = false,
      labelTiltStrength = 8,
      trigger = "hover",
      showLabel = true,
      hideNativeCursor = true,
      fullScreen = false,
      spring,
      labelSpring,
      offset,
      labelOffset,
      pressScale = 0.92,
      classNames,
      hideOnTouch = true,
      zIndex = 50,
      positionX,
      positionY,
      className,
      style,
      onPointerEnter,
      onPointerLeave,
      onPointerMove,
      onPointerDown,
      onPointerUp,
      ...rest
    },
    ref,
  ) {
    const surfaceRef = useRef<HTMLDivElement | null>(null);
    const [visible, setVisible] = useState(trigger === "always");
    const [pressed, setPressed] = useState(false);
    const [coarsePointer, setCoarsePointer] = useState(false);

    const offsetX = offset?.x ?? 0;
    const offsetY = offset?.y ?? 0;
    const labelOffsetX = labelOffset?.x ?? size * 0.9;
    const labelOffsetY = labelOffset?.y ?? size * 0.2 + 6;

    const cursorSpring = { ...DEFAULT_SPRING, ...spring };
    const pillSpring = { ...DEFAULT_LABEL_SPRING, ...labelSpring };

    /** Controlled = the caller scripts the position; we never read the pointer. */
    const controlled = positionX !== undefined && positionY !== undefined;

    const ownX = useMotionValue(-9999);
    const ownY = useMotionValue(-9999);
    const rawX = positionX ?? ownX;
    const rawY = positionY ?? ownY;

    const cursorX = useSpring(rawX, cursorSpring);
    const cursorY = useSpring(rawY, cursorSpring);
    const labelX = useSpring(rawX, pillSpring);
    const labelY = useSpring(rawY, pillSpring);

    const velocityX = useVelocity(rawX);
    const velocityY = useVelocity(rawY);
    const smoothVx = useSpring(velocityX, {
      stiffness: 120,
      damping: 26,
      mass: 0.5,
    });
    const smoothVy = useSpring(velocityY, {
      stiffness: 120,
      damping: 26,
      mass: 0.5,
    });

    const ARROW_NATURAL_DEG = -138;
    const VELOCITY_FULL = 600;
    const VELOCITY_MIN = 40;

    const arrowRotate = useTransform<number, number>(
      [smoothVx, smoothVy],
      ([vx, vy]) => {
        if (!directionAwareTilt) return tilt;
        const speed = Math.hypot(vx, vy);
        if (speed < VELOCITY_MIN) return tilt;
        const k = Math.min(
          1,
          (speed - VELOCITY_MIN) / (VELOCITY_FULL - VELOCITY_MIN),
        );
        const dir = (Math.atan2(vy, vx) * 180) / Math.PI;
        const target = dir - ARROW_NATURAL_DEG;
        let delta = target - tilt;
        delta = ((delta + 540) % 360) - 180;
        return tilt + delta * k;
      },
    );

    const labelRotate = useTransform<number, number>(
      [smoothVx, smoothVy],
      ([vx, vy]) => {
        if (!directionAwareTilt) return 0;
        const speed = Math.hypot(vx, vy);
        if (speed < VELOCITY_MIN) return 0;
        const k = Math.min(
          1,
          (speed - VELOCITY_MIN) / (VELOCITY_FULL - VELOCITY_MIN),
        );
        const horizShare = Math.abs(vx) / (speed + 1e-3);
        const sway =
          Math.sign(vy) * horizShare * labelTiltStrength * k +
          Math.sign(vx) * (1 - horizShare) * (labelTiltStrength * 0.4) * k;
        return sway;
      },
    );

    const smoothArrowRotate = useSpring(arrowRotate, {
      stiffness: 220,
      damping: 24,
      mass: 0.5,
    });
    const smoothLabelRotate = useSpring(labelRotate, {
      stiffness: 160,
      damping: 22,
      mass: 0.6,
    });

    useEffect(() => {
      if (typeof window === "undefined" || !hideOnTouch) return;
      const mq = window.matchMedia("(pointer: coarse)");
      const update = () => setCoarsePointer(mq.matches);
      update();
      mq.addEventListener?.("change", update);
      return () => mq.removeEventListener?.("change", update);
    }, [hideOnTouch]);

    useEffect(() => {
      if (!fullScreen || coarsePointer || controlled) return;
      const move = (e: PointerEvent) => {
        rawX.set(e.clientX + offsetX);
        rawY.set(e.clientY + offsetY);
        if (trigger === "always") return;
        if (!visible) setVisible(true);
      };
      const down = () => trigger === "press" && setVisible(true);
      const up = () => {
        setPressed(false);
        if (trigger === "press") setVisible(false);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerdown", down);
      window.addEventListener("pointerup", up);
      return () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerdown", down);
        window.removeEventListener("pointerup", up);
      };
    }, [
      fullScreen,
      coarsePointer,
      controlled,
      offsetX,
      offsetY,
      rawX,
      rawY,
      trigger,
      visible,
    ]);

    const handlePointerEnter = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (!fullScreen && trigger !== "always") setVisible(true);
        onPointerEnter?.(e);
      },
      [fullScreen, trigger, onPointerEnter],
    );

    const handlePointerLeave = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (!fullScreen && trigger !== "always") setVisible(false);
        setPressed(false);
        onPointerLeave?.(e);
      },
      [fullScreen, trigger, onPointerLeave],
    );

    const handlePointerMove = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (fullScreen || controlled) {
          onPointerMove?.(e);
          return;
        }
        const rect = surfaceRef.current?.getBoundingClientRect();
        if (rect) {
          rawX.set(e.clientX - rect.left + offsetX);
          rawY.set(e.clientY - rect.top + offsetY);
        }
        onPointerMove?.(e);
      },
      [fullScreen, controlled, offsetX, offsetY, onPointerMove, rawX, rawY],
    );

    const handlePointerDown = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        setPressed(true);
        if (trigger === "press") setVisible(true);
        onPointerDown?.(e);
      },
      [trigger, onPointerDown],
    );

    const handlePointerUp = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        setPressed(false);
        if (trigger === "press" && !fullScreen) setVisible(false);
        onPointerUp?.(e);
      },
      [trigger, fullScreen, onPointerUp],
    );

    const setRefs = useCallback(
      (node: HTMLDivElement | null) => {
        surfaceRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref)
          (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      },
      [ref],
    );

    const renderedArrow =
      typeof arrow === "function"
        ? arrow(color)
        : (arrow ?? <ArrowGlyph color={color} size={size} />);

    const surfaceStyle: CSSProperties = {
      ...(hideNativeCursor && !coarsePointer && !controlled
        ? { cursor: "none" }
        : null),
      ...style,
    };

    const layerStyle: CSSProperties = fullScreen
      ? { position: "fixed", inset: 0, pointerEvents: "none", zIndex }
      : { position: "absolute", inset: 0, pointerEvents: "none", zIndex };

    const showCursor = !coarsePointer && visible;

    return (
      <div
        ref={setRefs}
        className={cn(
          "relative",
          fullScreen ? "contents" : null,
          classNames?.root,
          className,
        )}
        style={surfaceStyle}
        {...(controlled
          ? null
          : {
              onPointerEnter: handlePointerEnter,
              onPointerLeave: handlePointerLeave,
              onPointerMove: handlePointerMove,
              onPointerDown: handlePointerDown,
              onPointerUp: handlePointerUp,
            })}
        {...rest}
      >
        {children}

        <div style={layerStyle} aria-hidden>
          <AnimatePresence>
            {showCursor && (
              <>
                <motion.div
                  key="user-cursor-arrow"
                  className={cn(
                    "absolute left-0 top-0 select-none will-change-transform",
                    classNames?.cursor,
                  )}
                  style={{
                    x: cursorX,
                    y: cursorY,
                    rotate: smoothArrowRotate,
                  }}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{
                    opacity: 1,
                    scale: pressed ? pressScale : 1,
                  }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className={cn("block", classNames?.arrow)}>
                    {renderedArrow}
                  </div>
                </motion.div>

                {showLabel && (
                  <motion.div
                    key="user-cursor-label"
                    className={cn(
                      "absolute left-0 top-0 select-none will-change-transform",
                      classNames?.label,
                    )}
                    style={{
                      x: labelX,
                      y: labelY,
                      rotate: smoothLabelRotate,
                    }}
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{
                      opacity: 1,
                      scale: pressed ? pressScale : 1,
                    }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {label ?? (
                      <div
                        className={cn(
                          "inline-flex items-center rounded-full font-medium leading-none shadow-[0_2px_10px_rgba(0,0,0,0.15)]",
                          classNames?.labelText,
                        )}
                        style={
                          {
                            background: color,
                            color: textColor,
                            fontSize: `${size * 0.5}px`,
                            paddingInline: `${size * 0.43}px`,
                            paddingBlock: `${size * 0.18}px`,
                            transform: `translate(${labelOffsetX}px, ${labelOffsetY}px)`,
                          } as CSSProperties
                        }
                      >
                        {name}
                      </div>
                    )}
                  </motion.div>
                )}
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  },
);

export default UserCursor;
