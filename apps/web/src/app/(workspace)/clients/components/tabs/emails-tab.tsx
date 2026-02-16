"use client";

import { useState } from "react";
import { Doc } from "@onetool/backend/convex/_generated/dataModel";
import { EmailActivityList } from "@/app/(workspace)/clients/components/email-activity-list";
import { StyledButton } from "@/components/ui/styled/styled-button";
import { Separator } from "@/components/ui/separator";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";

const EMAILS_PER_PAGE = 5;

interface EmailsTabProps {
	emails: Doc<"emailMessages">[] | undefined;
	onComposeEmail: () => void;
	onThreadClick?: (threadId: string) => void;
}

export function EmailsTab({
	emails,
	onComposeEmail,
	onThreadClick,
}: EmailsTabProps) {
	const [currentPage, setCurrentPage] = useState(1);

	const totalEmails = emails?.length ?? 0;
	const totalPages = Math.max(1, Math.ceil(totalEmails / EMAILS_PER_PAGE));
	const startIdx = (currentPage - 1) * EMAILS_PER_PAGE;
	const paginatedEmails = emails?.slice(startIdx, startIdx + EMAILS_PER_PAGE) ?? [];

	return (
		<div>
			<div className="flex items-center justify-between mb-1 min-h-8">
				<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
					Emails ({totalEmails})
				</h3>
				<StyledButton
					intent="outline"
					size="sm"
					onClick={onComposeEmail}
					icon={<Plus className="h-4 w-4" />}
					label="Compose"
					showArrow={false}
				/>
			</div>
			<Separator className="mb-4" />

			<EmailActivityList
				emails={paginatedEmails}
				onThreadClick={onThreadClick}
			/>

			{/* Pagination */}
			{totalPages > 1 && (
				<div className="flex items-center justify-between pt-3 mt-1 border-t border-border">
					<span className="text-xs text-muted-foreground">
						{startIdx + 1}–{Math.min(startIdx + EMAILS_PER_PAGE, totalEmails)} of{" "}
						{totalEmails}
					</span>
					<div className="flex items-center gap-1">
						<button
							onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
							disabled={currentPage === 1}
							className="p-1.5 rounded-md hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
						>
							<ChevronLeft className="h-4 w-4" />
						</button>
						<span className="text-xs text-muted-foreground px-2">
							{currentPage} / {totalPages}
						</span>
						<button
							onClick={() =>
								setCurrentPage((p) => Math.min(totalPages, p + 1))
							}
							disabled={currentPage === totalPages}
							className="p-1.5 rounded-md hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
						>
							<ChevronRight className="h-4 w-4" />
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
