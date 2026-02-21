"use client";

import { Separator } from "@/components/ui/separator";

interface NotesTabProps {
	isEditing: boolean;
	notes: string;
	onNotesChange: (value: string) => void;
}

export function NotesTab({ isEditing, notes, onNotesChange }: NotesTabProps) {
	return (
		<div>
			<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-0.5">
				Internal Notes
			</h3>
			<p className="text-xs text-muted-foreground mb-1">
				Visible only to your team
			</p>
			<Separator className="mb-4" />

			{isEditing ? (
				<textarea
					className="w-full min-h-[160px] px-3 py-2 bg-background border border-border rounded-md text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
					value={notes}
					onChange={(e) => onNotesChange(e.target.value)}
					placeholder="Add internal notes about this client..."
				/>
			) : notes ? (
				<div className="bg-muted/30 rounded-lg p-4">
					<p className="text-sm text-foreground whitespace-pre-wrap">
						{notes}
					</p>
				</div>
			) : (
				<div className="py-8 text-center">
					<p className="text-sm text-muted-foreground">
						No notes yet. Click Edit Details to add notes.
					</p>
				</div>
			)}
		</div>
	);
}
