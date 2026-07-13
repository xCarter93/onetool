"use client";

import * as React from "react";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { NewClientDialog } from "@/app/(workspace)/clients/components/new-client-dialog";
import { NewProjectDialog } from "@/app/(workspace)/projects/components/new-project-dialog";
import { NewQuoteDialog } from "@/app/(workspace)/quotes/components/new-quote-dialog";

/**
 * What to create, plus whatever context the launch site can supply. Prefilled
 * fields stay editable — this only seeds a default.
 */
export type CreateTarget =
	| { type: "client" }
	| { type: "project"; clientId?: Id<"clients"> | null }
	| {
			type: "quote";
			clientId?: Id<"clients"> | null;
			projectId?: Id<"projects"> | null;
	  };

const CreateRecordContext = React.createContext<
	((target: CreateTarget) => void) | null
>(null);

/**
 * Hosts the record-creation dialogs so any surface — a list page, a record
 * header, the sidebar's quick actions — can open one without routing.
 *
 * The active dialog is mounted on demand: its Convex subscriptions should not
 * run on every workspace page just because the sidebar can launch it. Closing
 * therefore has two steps — flip `open` to false so the dialog can play its
 * exit animation, then drop `target` on `onOpenChangeComplete` to unmount it
 * and release those subscriptions. Unmounting straight from the close handler
 * would cut the animation off mid-flight.
 */
export function CreateRecordProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [target, setTarget] = React.useState<CreateTarget | null>(null);
	const [open, setOpen] = React.useState(false);

	const openCreate = React.useCallback((next: CreateTarget) => {
		setTarget(next);
		setOpen(true);
	}, []);

	const close = React.useCallback((next: boolean) => {
		if (!next) setOpen(false);
	}, []);

	const unmountWhenClosed = React.useCallback((nowOpen: boolean) => {
		if (!nowOpen) setTarget(null);
	}, []);

	const dialogProps = {
		open,
		onOpenChange: close,
		onOpenChangeComplete: unmountWhenClosed,
	};

	return (
		<CreateRecordContext.Provider value={openCreate}>
			{children}

			{target?.type === "client" && <NewClientDialog {...dialogProps} />}
			{target?.type === "project" && (
				<NewProjectDialog {...dialogProps} defaultClientId={target.clientId} />
			)}
			{target?.type === "quote" && (
				<NewQuoteDialog
					{...dialogProps}
					defaultClientId={target.clientId}
					defaultProjectId={target.projectId}
				/>
			)}
		</CreateRecordContext.Provider>
	);
}

export function useCreateRecord() {
	const openCreate = React.useContext(CreateRecordContext);
	if (!openCreate) {
		throw new Error("useCreateRecord must be used within a CreateRecordProvider");
	}
	return openCreate;
}
