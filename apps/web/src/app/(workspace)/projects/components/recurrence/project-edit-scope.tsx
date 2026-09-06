"use client";

import * as React from "react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { useMutation } from "convex/react";

import { SegmentedControl } from "@/components/domain/segmented-control";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

export type ProjectEditScope = "current" | "future";
export type ReusableProjectField =
	| "title"
	| "description"
	| "clientId"
	| "propertyId"
	| "assignedUserIds";

export type ProjectUpdate = {
	title?: string;
	description?: string;
	clientId?: Id<"clients">;
	propertyId?: Id<"clientProperties">;
	assignedUserIds?: Id<"users">[];
	status?: "planned" | "in-progress" | "completed" | "cancelled";
	projectType?: "one-off" | "recurring";
	projectNumber?: string;
	startDate?: number;
	endDate?: number;
};

type SaveResult =
	| { saved: true; scope: ProjectEditScope }
	| { saved: false; scope: null };

interface ProjectEditScopeContextValue {
	scope: ProjectEditScope | null;
	isSaving: boolean;
	canEditFuture: boolean;
	setScope: (scope: ProjectEditScope) => void;
	save: (
		field: keyof ProjectUpdate,
		updates: ProjectUpdate
	) => Promise<SaveResult>;
}

const ProjectEditScopeContext =
	React.createContext<ProjectEditScopeContextValue | null>(null);

const FUTURE_FIELDS = new Set<keyof ProjectUpdate>([
	"title",
	"description",
	"clientId",
	"propertyId",
	"assignedUserIds",
]);

interface ProjectEditScopeProviderProps {
	children: React.ReactNode;
	projectId: Id<"projects">;
	recurringSeriesId?: Id<"projectSeries">;
	canEditFuture: boolean;
}

export function ProjectEditScopeProvider({
	children,
	projectId,
	recurringSeriesId,
	canEditFuture,
}: ProjectEditScopeProviderProps) {
	const updateProject = useMutation(api.projects.update);
	const updateFuture = useMutation(api.projectSeries.updateFuture);
	const [scope, setScope] = React.useState<ProjectEditScope | null>(null);
	const [isSaving, setIsSaving] = React.useState(false);
	const [dialogOpen, setDialogOpen] = React.useState(false);
	const choiceRef = React.useRef<
		((scope: ProjectEditScope | null) => void) | null
	>(null);
	const choicePromiseRef =
		React.useRef<Promise<ProjectEditScope | null> | null>(null);
	const mountedRef = React.useRef(true);
	const savingRef = React.useRef(false);
	const effectiveScope = canEditFuture
		? scope
		: scope === "future"
			? "current"
			: scope;

	React.useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			choiceRef.current?.(null);
			choiceRef.current = null;
			choicePromiseRef.current = null;
		};
	}, []);

	const chooseScope = React.useCallback(
		(nextScope: ProjectEditScope | null) => {
			const permittedScope =
				nextScope === "future" && !canEditFuture ? "current" : nextScope;
			if (permittedScope && mountedRef.current) setScope(permittedScope);
			choiceRef.current?.(permittedScope);
			choiceRef.current = null;
			choicePromiseRef.current = null;
			if (mountedRef.current) setDialogOpen(false);
		},
		[canEditFuture]
	);

	const requestScope = React.useCallback(() => {
		if (effectiveScope) return Promise.resolve(effectiveScope);
		if (choicePromiseRef.current) return choicePromiseRef.current;

		setDialogOpen(true);
		choicePromiseRef.current = new Promise<ProjectEditScope | null>(
			(resolve) => {
				choiceRef.current = resolve;
			}
		);
		return choicePromiseRef.current;
	}, [effectiveScope]);

	const save = React.useCallback(
		async (
			field: keyof ProjectUpdate,
			updates: ProjectUpdate
		): Promise<SaveResult> => {
			if (savingRef.current) return { saved: false, scope: null };

			const eligibleForFuture =
				canEditFuture &&
				recurringSeriesId !== undefined &&
				FUTURE_FIELDS.has(field);
			const selectedScope = eligibleForFuture
				? await requestScope()
				: "current";
			if (!selectedScope || !mountedRef.current || savingRef.current) {
				return { saved: false, scope: null };
			}

			savingRef.current = true;
			setIsSaving(true);
			try {
				const fieldUpdate = { [field]: updates[field] } as ProjectUpdate;
				if (selectedScope === "future" && recurringSeriesId) {
					await updateFuture({ projectId, updates: fieldUpdate });
				} else {
					await updateProject({ id: projectId, ...fieldUpdate });
				}
				return { saved: true, scope: selectedScope };
			} finally {
				savingRef.current = false;
				if (mountedRef.current) setIsSaving(false);
			}
		},
		[
			canEditFuture,
			projectId,
			recurringSeriesId,
			requestScope,
			updateFuture,
			updateProject,
		]
	);

	const value = React.useMemo(
		() => ({
			scope: effectiveScope,
			isSaving,
			canEditFuture,
			setScope: (nextScope: ProjectEditScope) => {
				setScope(
					nextScope === "future" && !canEditFuture ? "current" : nextScope
				);
			},
			save,
		}),
		[canEditFuture, effectiveScope, isSaving, save]
	);

	return (
		<ProjectEditScopeContext.Provider value={value}>
			{children}
			<Dialog
				open={dialogOpen}
				onOpenChange={(open) => {
					if (!open) chooseScope(null);
				}}
			>
				<DialogContent className="max-w-md" showCloseButton={!isSaving}>
					<DialogHeader>
						<DialogTitle>Apply this change to</DialogTitle>
						<DialogDescription>
							Choose whether this edit applies only to this visit or to eligible
							planned visits in the series.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => chooseScope("current")}>
							This project
						</Button>
						<Button
							disabled={!canEditFuture}
							onClick={() => chooseScope("future")}
						>
							This and future projects
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</ProjectEditScopeContext.Provider>
	);
}

export function ProjectEditScopeControl() {
	const context = React.useContext(ProjectEditScopeContext);
	if (!context?.canEditFuture || !context.scope) return null;

	return (
		<div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 py-3">
			<div>
				<p className="text-sm font-medium text-foreground">Edit scope</p>
				<p className="text-xs text-muted-foreground">
					Used for reusable project details during this visit.
				</p>
			</div>
			<SegmentedControl
				value={context.scope}
				onValueChange={context.setScope}
				disabled={context.isSaving}
				options={[
					{ value: "current", label: "This project" },
					{ value: "future", label: "This and future" },
				]}
			/>
		</div>
	);
}

export function useProjectEditScope(
	projectId: Id<"projects">
): ProjectEditScopeContextValue {
	const context = React.useContext(ProjectEditScopeContext);
	const updateProject = useMutation(api.projects.update);
	const fallback = React.useMemo<ProjectEditScopeContextValue>(
		() => ({
			scope: null,
			isSaving: false,
			canEditFuture: false,
			setScope: () => undefined,
			save: async (_field, updates) => {
				await updateProject({ id: projectId, ...updates });
				return { saved: true, scope: "current" };
			},
		}),
		[projectId, updateProject]
	);
	return context ?? fallback;
}
