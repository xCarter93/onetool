// Type augmentation for next/navigation
// This helps TypeScript resolve the react-server conditional exports in Next.js 16
import type { Params } from "next/dist/server/request/params";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

declare module "next/navigation" {
	// Client hooks
	export function useSearchParams(): ReadonlyURLSearchParams;
	export function usePathname(): string;
	export function useRouter(): AppRouterInstance;
	export function useParams<T extends Params = Params>(): T;
	export function useSelectedLayoutSegments(parallelRouteKey?: string): string[];
	export function useSelectedLayoutSegment(parallelRouteKey?: string): string | null;

	// Server functions (react-server exports)
	export { redirect, permanentRedirect } from "next/dist/client/components/redirect";
	export { RedirectType } from "next/dist/client/components/redirect-error";
	export { notFound } from "next/dist/client/components/not-found";
	export { forbidden } from "next/dist/client/components/forbidden";
	export { unauthorized } from "next/dist/client/components/unauthorized";
	export { unstable_rethrow } from "next/dist/client/components/unstable-rethrow";

	// Types
	export class ReadonlyURLSearchParams extends URLSearchParams {
		constructor(urlSearchParams?: URLSearchParams);
		append: never;
		delete: never;
		set: never;
		sort: never;
	}
}
