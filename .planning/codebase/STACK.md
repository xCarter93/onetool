# Technology Stack

**Analysis Date:** 2026-03-14

## Languages

**Primary:**
- TypeScript 5.x - Core application language across all packages
- JavaScript (ES2020+) - Build and configuration scripts

**Secondary:**
- TSX/JSX - React component definitions
- TOML - Turborepo and configuration files

## Runtime

**Environment:**
- Node.js - Backend and development runtime (version unspecified in .nvmrc, defaults to LTS)
- Expo 54.0.0 - Mobile development runtime (iOS)
- Web browsers (modern ES2020+ support)

**Package Manager:**
- pnpm 10.12.0 - Monorepo package manager
- Lockfile: `pnpm-lock.yaml` (present)

## Frameworks

**Frontend Web:**
- Next.js 16.0.10 - React framework with App Router
- React 19.2.3 - UI library
- Tailwind CSS 4 - Utility-first CSS framework with @tailwindcss/postcss
- shadcn/ui 3.2.1 - Radix UI-based component library
- Radix UI - Headless UI primitives (multiple packages: dialog, dropdown, select, tabs, etc.)

**Mobile:**
- React Native 0.81.5 - Cross-platform mobile framework
- Expo 54.0.0 - React Native development platform
- Expo Router 6.0.21 - Navigation for Expo apps

**Backend:**
- Convex 1.30.0 - Real-time serverless database and functions
  - @convex-dev/aggregate 0.1.25 - Real-time aggregation for dashboard metrics
  - @convex-dev/resend 0.2.0 - Email sending integration
  - @convex-dev/rate-limiter 0.3.2 - Rate limiting for API protection
  - @convex-dev/migrations 0.2.9 - Schema migration management

**Styling & Theming:**
- next-themes 0.4.6 - Theme provider with dark mode support
- class-variance-authority 0.7.1 - Type-safe component variant definitions
- tailwind-merge 3.4.0 - Intelligent Tailwind class merging
- tailwind-variants 3.1.1 - CSS-in-JS variants with Tailwind
- framer-motion 12.23.24 - Animation library for React
- motion 12.23.12 - Additional animation utilities
- GSAP 3.13.0 - Animation library for advanced effects
- Lenis 1.3.18 - Smooth scrolling library
- OGL 1.0.11 - WebGL library for 3D rendering

**Testing:**
- Vitest 4.0.16 - Fast unit test runner (npm, Web, Backend)
- @vitest/coverage-v8 4.0.16 - Code coverage reporting
- convex-test 0.0.41 - Convex function testing utilities
- @edge-runtime/vm 5.0.0 - Edge runtime testing environment

**Build & Dev:**
- Turbo 2.5.0 - Monorepo build orchestration
- Next.js Turbopack - Bundler integration for fast builds
- ESLint 9 - Code linting
- eslint-config-next 15.5.3 - Next.js ESLint configuration
- TypeScript 5 - Type checking

**Data & Forms:**
- Convex React 1.30.0 - React hooks for Convex (useQuery, useMutation)
- @tanstack/react-form 1.23.7 - Headless form state management
- @tanstack/react-table 8.21.3 - Headless table library
- Zod 4.1.8 - TypeScript-first schema validation
- @t3-oss/env-nextjs 0.13.8 - Type-safe environment variables

**PDF & Document Generation:**
- @react-pdf/renderer 4.3.0 - PDF generation from React components
- pdf-lib 1.17.1 - PDF manipulation library

**Rich Text Editing:**
- @tiptap/react 3.15.3 - Headless rich text editor
- @tiptap/starter-kit 3.15.3 - Common Tiptap extensions
- dompurify 3.3.0 - HTML sanitization

**Data Visualization:**
- recharts 2.15.4 - Composable charting library
- @lottiefiles/dotlottie-react 0.17.8 - Lottie animation player

**UI Components & Utilities:**
- @headlessui/react 2.2.7 - Headless UI components
- @heroicons/react 2.2.0 - Icon set
- @intentui/icons 1.11.0 - Additional icon set
- lucide-react 0.544.0 - Modern icon library
- lucide-react-native 0.475.0 - React Native icons
- cmdk 1.1.1 - Command menu/command palette
- react-day-picker 9.11.1 - Date picker component
- react-aria-components 1.12.1 - Accessible React components
- clsx 2.1.1 - Utility for conditional CSS classes
- @number-flow/react 0.5.10 - Animated number component
- tunnel-rat 0.1.2 - Portal/teleport for React

**Data Parsing & Processing:**
- papaparse 5.5.3 - CSV parser
- date-fns 4.1.0 - Date manipulation library

**Drag & Drop:**
- @dnd-kit/core 6.3.1 - Lightweight drag and drop library
- @dnd-kit/sortable 10.0.0 - Sortable preset for dnd-kit
- @dnd-kit/modifiers 9.0.0 - Drag modifiers and restrictions
- @dnd-kit/utilities 3.2.2 - dnd-kit utilities

**Maps & Location:**
- @mapbox/search-js-react 1.5.1 - Mapbox search integration
- maplibre-gl 5.15.0 - Map rendering library

## Key Dependencies

**Critical:**
- Clerk 6.34.1 + Backend 2.19.1 - Authentication and organization management
- Stripe 20.0.0 + @stripe/react-connect-js 3.3.31 - Payment processing and Stripe Connect
- Convex 1.30.0 - Real-time serverless database and query language

**Infrastructure:**
- Resend 6.5.2 - Email delivery service
- boldsign 2.0.1 - E-signature API client
- @clerk/backend 2.19.1 - Server-side Clerk operations
- @ai-sdk/openai 3.0.0 - OpenAI API integration
- ai 6.0.0 - AI SDK for LLM interactions
- @mastra/core 1.0.0-beta.21 - AI agent framework for CSV import and reports
- @mastra/ai-sdk 1.0.0-beta.14 - Mastra AI SDK
- posthog-js 1.306.1 - Product analytics tracking
- svix 1.76.1 - Webhook platform (used for Clerk, BoldSign, Resend)

**Mobile:**
- @clerk/clerk-expo 2.12.0 - Clerk authentication for Expo
- @shopify/flash-list 2.0.2 - High-performance React Native list
- expo-router 6.0.21 - Native navigation
- expo-secure-store 15.0.8 - Secure storage for mobile
- react-native-calendars 1.1313.0 - Calendar component for mobile
- @expo-google-fonts/outfit 0.2.3 - Custom font integration

## Configuration

**Environment:**
- Environment variables validated via `apps/web/src/env.ts` using @t3-oss/env-nextjs
- Separate public (NEXT_PUBLIC_*) and server environment variables
- Required variables enforced at build time and runtime

**Build:**
- `turbo.json` - Build cache configuration and task definitions
- `tsconfig.json` - TypeScript configuration
- `next.config.ts` - Next.js build configuration
- `tailwind.config.ts` - Tailwind CSS customization
- `vitest.config.ts` - Test runner configuration (multiple per app)
- `packages/backend/convex/convex.config.ts` - Convex configuration with plugins

## Platform Requirements

**Development:**
- Node.js (LTS recommended, no specific version locked)
- pnpm 10.12.0
- Xcode (for iOS development)
- Expo CLI

**Production:**
- Convex deployment platform (backend)
- Next.js deployment platform (Vercel recommended)
- Stripe account (payment processing)
- Clerk project (authentication)
- Email service provider (Resend)
- PostHog deployment (analytics)
- BoldSign account (e-signatures)
- OpenAI API key (AI agents)
- MapBox API key (map features)
- Unsplash API credentials (placeholder images)
- iOS deployment via Expo (mobile)

---

*Stack analysis: 2026-03-14*
