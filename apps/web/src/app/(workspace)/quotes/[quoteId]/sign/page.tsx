"use client";

import { PermissionGate } from "@/components/domain/permission-gate";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAction } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
	AlertTriangle,
	ArrowLeft,
	Loader2,
	RefreshCw,
	Sparkles,
	UserPlus,
} from "lucide-react";

// BoldSign only posts messages from this origin; hard-guard every event.
const BOLDSIGN_ORIGIN = "https://app.boldsign.com";

type ViewState =
	| { kind: "creating" }
	| { kind: "ready"; sendUrl: string }
	| { kind: "limit"; used: number; limit: number }
	| { kind: "no_signer" }
	| { kind: "error"; message: string };

/**
 * In-app BoldSign embedded sending. Creates an embedded request for the quote's
 * latest PDF, then renders BoldSign's editor in an iframe so the user places
 * fields, edits recipients, and sends themselves. The Sent webhook remains the
 * source of truth for the quote's status regardless of what this page observes.
 */
function QuoteSignPageContent() {
	const params = useParams<{ quoteId: string }>();
	const quoteId = params.quoteId as Id<"quotes">;
	const router = useRouter();
	const toast = useToast();
	const createRequest = useAction(
		api.boldsignActions.createEmbeddedSignatureRequest
	);
	const discardRequest = useAction(
		api.boldsignActions.discardEmbeddedSignatureRequest
	);

	const [view, setView] = useState<ViewState>({ kind: "creating" });
	// True until BoldSign's iframe finishes its own async load (onLoadComplete).
	const [iframeLoading, setIframeLoading] = useState(true);
	// True while the abandoned draft is being discarded before navigating back.
	const [discarding, setDiscarding] = useState(false);

	// Set when the user resolved the editor themselves (sent, or Save & Close),
	// in which case back-navigation must NOT discard the BoldSign document.
	const keepDocumentRef = useRef(false);
	// In-flight create, awaited before discarding so a draft persisted after an
	// early back-click doesn't survive as an orphan.
	const createPromiseRef = useRef<Promise<unknown> | null>(null);

	const backToQuote = useCallback(async () => {
		// Abandoning before send: delete the BoldSign draft (best-effort) and
		// clear the local "Preparing" state so the Signatures tab stays truthful.
		if (!keepDocumentRef.current) {
			setDiscarding(true);
			// A failed create still means no draft to keep; discard regardless.
			await createPromiseRef.current?.catch(() => undefined);
			try {
				await discardRequest({ quoteId });
			} catch (err) {
				console.error("Failed to discard signature draft:", err);
			}
		}
		router.push(`/quotes/${quoteId}`);
	}, [discardRequest, router, quoteId]);

	const runCreate = useCallback(async () => {
		setView({ kind: "creating" });
		setIframeLoading(true);
		try {
			const promise = createRequest({
				quoteId,
				origin: window.location.origin,
			});
			createPromiseRef.current = promise;
			const result = await promise;
			if (result.ok) {
				// A resumed draft (earlier Save & Close) is the user's saved work —
				// keep it on back-navigation; only fresh drafts are discardable.
				keepDocumentRef.current = result.reused;
				setView({ kind: "ready", sendUrl: result.sendUrl });
			} else if (result.reason === "limit") {
				setView({ kind: "limit", used: result.used, limit: result.limit });
			} else {
				setView({ kind: "no_signer" });
			}
		} catch (err) {
			setView({
				kind: "error",
				message:
					err instanceof Error
						? err.message
						: "We couldn't prepare this document. Please try again.",
			});
		}
	}, [createRequest, quoteId]);

	// Create the embedded request exactly once on mount (ref-guarded so React's
	// dev double-invoke and re-renders don't mint duplicate drafts).
	const startedRef = useRef(false);
	useEffect(() => {
		if (startedRef.current) return;
		startedRef.current = true;
		void runCreate();
	}, [runCreate]);

	// Listen for BoldSign iframe events while the editor is mounted. Re-subscribes
	// only if the (stable) callbacks change; the origin guard rejects everything else.
	const isReady = view.kind === "ready";
	useEffect(() => {
		if (!isReady) return;
		function onMessage(event: MessageEvent) {
			if (event.origin !== BOLDSIGN_ORIGIN) return;
			const type =
				typeof event.data === "string" ? event.data : event.data?.action;
			switch (type) {
				case "onLoadComplete":
					setIframeLoading(false);
					break;
				case "onCreateSuccess":
					keepDocumentRef.current = true;
					toast.success(
						"Sent for signature",
						"Your client will receive an email to sign."
					);
					void backToQuote();
					break;
				case "onDraftSuccess":
					// User clicked Save & Close inside the editor: keep the draft so
					// they can resume from the same place later.
					keepDocumentRef.current = true;
					toast.success(
						"Draft saved",
						"Resume anytime from Send for e-signature."
					);
					void backToQuote();
					break;
				case "onCreateFailed":
					setIframeLoading(false);
					toast.error(
						"Couldn't send",
						"Something went wrong in the editor. Please try again."
					);
					break;
				default:
					break;
			}
		}
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, [isReady, toast, backToQuote]);

	// ---- Ready: the embedded editor ----------------------------------------
	if (view.kind === "ready") {
		return (
			<div className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-2 md:px-6">
				<div className="flex items-center justify-between py-3">
					<button
						type="button"
						onClick={() => void backToQuote()}
						disabled={discarding}
						className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-60"
					>
						{discarding ? (
							<Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
						) : (
							<ArrowLeft className="h-4 w-4" aria-hidden="true" />
						)}
						{discarding ? "Discarding draft…" : "Back to quote"}
					</button>
					<p className="text-sm text-muted-foreground">
						Place fields and recipients, then send from the editor.
					</p>
				</div>

				<div className="relative min-h-[600px] flex-1 overflow-hidden rounded-xl border border-border bg-muted/30">
					{iframeLoading && (
						<div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/70 backdrop-blur-sm">
							<Loader2
								className="h-6 w-6 animate-spin text-primary"
								aria-hidden="true"
							/>
							<p className="text-sm text-muted-foreground">
								Loading the document editor…
							</p>
						</div>
					)}
					<iframe
						src={view.sendUrl}
						title="Prepare document for signature"
						allow="clipboard-write"
						className="h-full w-full border-0"
					/>
				</div>
			</div>
		);
	}

	// ---- All non-ready states share a centered layout ----------------------
	return (
		<div className="flex min-h-[70vh] flex-1 flex-col px-4 md:px-6">
			<div className="py-3">
				<button
					type="button"
					onClick={() => void backToQuote()}
					disabled={discarding}
					className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-60"
				>
					{discarding ? (
						<Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
					) : (
						<ArrowLeft className="h-4 w-4" aria-hidden="true" />
					)}
					{discarding ? "Discarding draft…" : "Back to quote"}
				</button>
			</div>

			<div className="flex flex-1 items-center justify-center">
				{view.kind === "creating" && (
					<div className="flex flex-col items-center gap-4 text-center">
						<Loader2
							className="h-7 w-7 animate-spin text-primary"
							aria-hidden="true"
						/>
						<div>
							<h1 className="text-base font-semibold text-foreground">
								Preparing your document
							</h1>
							<p className="mt-1 text-sm text-muted-foreground">
								Setting up the signature editor…
							</p>
						</div>
					</div>
				)}

				{view.kind === "limit" && (
					<div className="flex max-w-md flex-col items-center gap-4 text-center">
						<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
							<Sparkles className="h-7 w-7 text-primary" aria-hidden="true" />
						</div>
						<div>
							<h1 className="text-lg font-semibold text-foreground">
								You&apos;ve hit your monthly e-signature limit
							</h1>
							<p className="mt-2 text-sm text-muted-foreground">
								You&apos;ve sent {view.used} of {view.limit} e-signatures this
								month on the free plan. Upgrade for unlimited signature sends.
							</p>
						</div>
						<div className="mt-1 flex items-center gap-3">
							<Button onClick={() => router.push("/organization/profile?tab=billing")}>
								View plans
							</Button>
							<Button variant="ghost" onClick={() => void backToQuote()} disabled={discarding}>
								Back to quote
							</Button>
						</div>
					</div>
				)}

				{view.kind === "no_signer" && (
					<div className="flex max-w-md flex-col items-center gap-4 text-center">
						<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-900/30">
							<UserPlus
								className="h-7 w-7 text-amber-600 dark:text-amber-400"
								aria-hidden="true"
							/>
						</div>
						<div>
							<h1 className="text-lg font-semibold text-foreground">
								Add a client contact first
							</h1>
							<p className="mt-2 text-sm text-muted-foreground">
								This quote&apos;s client needs a primary contact with an email
								address before you can send it for signature.
							</p>
						</div>
						<Button variant="outline" onClick={() => void backToQuote()} disabled={discarding}>
							Back to quote
						</Button>
					</div>
				)}

				{view.kind === "error" && (
					<div className="flex max-w-md flex-col items-center gap-4 text-center">
						<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-900/30">
							<AlertTriangle
								className="h-7 w-7 text-red-600 dark:text-red-400"
								aria-hidden="true"
							/>
						</div>
						<div>
							<h1 className="text-lg font-semibold text-foreground">
								Couldn&apos;t prepare the document
							</h1>
							<p className="mt-2 text-sm text-muted-foreground">
								{view.message}
							</p>
						</div>
						<div className="mt-1 flex items-center gap-3">
							<Button onClick={() => void runCreate()}>
								<RefreshCw className="h-4 w-4" />
								Try again
							</Button>
							<Button variant="ghost" onClick={() => void backToQuote()} disabled={discarding}>
								Back to quote
							</Button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

export default function QuoteSignPage() {
	return (
		<PermissionGate object="quotes">
			<QuoteSignPageContent />
		</PermissionGate>
	);
}
