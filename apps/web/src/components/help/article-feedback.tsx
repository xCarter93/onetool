"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

function captureFeedback(article: string, helpful: boolean) {
	const posthog = (
		window as unknown as {
			posthog?: {
				capture?: (event: string, properties?: Record<string, unknown>) => void;
			};
		}
	).posthog;
	posthog?.capture?.("help_article_feedback", { article, helpful });
}

export function ArticleFeedback({ article }: { article: string }) {
	const [answer, setAnswer] = React.useState<"yes" | "no" | null>(null);

	return (
		<div className="mt-14 rounded-xl border border-border bg-muted/30 p-6">
			{answer === null ? (
				<div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
					<p className="text-sm font-medium text-foreground">
						Did this article answer your question?
					</p>
					<div className="flex gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								captureFeedback(article, true);
								setAnswer("yes");
							}}
						>
							Yes
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								captureFeedback(article, false);
								setAnswer("no");
							}}
						>
							No
						</Button>
					</div>
				</div>
			) : (
				<p className="text-sm text-muted-foreground">
					Thanks for the feedback.{" "}
					{answer === "no" && (
						<>
							If you are stuck, email{" "}
							<a
								href="mailto:support@onetool.biz"
								className="font-medium text-primary underline-offset-4 hover:underline"
							>
								support@onetool.biz
							</a>{" "}
							and we will help.
						</>
					)}
				</p>
			)}
		</div>
	);
}
