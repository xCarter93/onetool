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
 * run on every workspace page just because the sidebar can launch it.
 */
export function CreateRecordProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [target, setTarget] = React.useState<CreateTarget | null>(null);

	const close = React.useCallback((open: boolean) => {
		if (!open) setTarget(null);
	}, []);

	return (
		<CreateRecordContext.Provider value={setTarget}>
			{children}

			{target?.type === "client" && (
				<NewClientDialog open onOpenChange={close} />
			)}
			{target?.type === "project" && (
				<NewProjectDialog
					open
					onOpenChange={close}
					defaultClientId={target.clientId}
				/>
			)}
			{target?.type === "quote" && (
				<NewQuoteDialog
					open
					onOpenChange={close}
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
