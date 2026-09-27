import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text } from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { colors, fontFamily, useTokens } from "@/lib/theme";
import { Button } from "@/components/ui";
import { ClientPicker } from "@/components/create/client-picker";
import { FieldMenu } from "@/components/FieldMenu";
import { usePermissions } from "@/lib/use-permissions";
import { hapticSuccess } from "@/lib/haptics";
import { describeMutationError } from "@/lib/mutation-error";
import { useOnlineAction } from "@/lib/offline/hooks";
import { CreateSheet, SheetField, SheetInput } from "@/components/sheets/create-sheet";

// FieldMenu action id for "no project" — an empty-string id is not a shape the
// native MenuView is known to round-trip.
const NO_PROJECT = "__none__";

// Fast-capture quote create (Slice 5 speed-dial). This screen only mints the
// empty draft — the line-item sheet on the quote detail screen (Slice 4) is
// where the money gets entered, so the sheet hands off immediately.
export default function NewQuoteSheet() {
	const t = useTokens();
	const { can, isLoading: permsLoading } = usePermissions();
	const params = useLocalSearchParams<{
		clientId?: string;
		projectId?: string;
	}>();

	const [clientId, setClientId] = useState<Id<"clients"> | "">(
		(params.clientId as Id<"clients">) || ""
	);
	// A client pushed in on the route is settled — show it read-only.
	const clientLocked = !!params.clientId;
	// A project pushed in on the route is only pre-staged, never locked — the
	// picker below still clears it (and a client change wipes it outright).
	const [projectId, setProjectId] = useState<Id<"projects"> | "">(
		(params.projectId as Id<"projects">) || ""
	);
	const [title, setTitle] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<{
		message: string;
		planLimit: boolean;
	} | null>(null);

	const createQuote = useMutation(api.quotes.create);
	const projects = useQuery(
		api.projects.list,
		clientId ? { clientId: clientId as Id<"clients"> } : "skip"
	);
	const projectOptions = [
		{ value: NO_PROJECT, label: "No project" },
		...(projects ?? []).map((p) => ({ value: p._id, label: p.title })),
	];
	const projectLabel =
		projectOptions.find((o) => o.value === projectId)?.label ?? "No project";
	const selectedProject = projectId
		? (projects ?? []).find((p) => p._id === projectId)
		: undefined;

	const canCreate = can("quotes", "modify");
	const valid = !!clientId;
	const onlineAction = useOnlineAction();

	const submit = async () => {
		if (!valid || submitting) return;
		setSubmitting(true);
		setError(null);
		try {
			const quoteId = (await createQuote({
				clientId: clientId as Id<"clients">,
				// Once the client's projects are loaded, only send one the list
				// actually holds — a stale ?projectId is dropped. Before that,
				// trust the param: submitting inside the load window must not
				// silently strip the project the detail screen handed over (a real
				// mismatch is rejected server-side).
				projectId:
					projects === undefined
						? (projectId as Id<"projects">) || undefined
						: selectedProject?._id,
				title: title.trim() || undefined,
				status: "draft",
				subtotal: 0,
				total: 0,
			})) as Id<"quotes">;
			hapticSuccess();
			router.replace(`/quote/${quoteId}`);
		} catch (err) {
			setError(
				describeMutationError(
					err,
					"Couldn't start that quote. Check your connection and try again."
				)
			);
		} finally {
			setSubmitting(false);
		}
	};

	// `can` is false while permissions resolve — wait before hiding. A role that
	// can't create quotes can still deep-link here, so leave, rather than leaving
	// a blank sheet with no way out.
	if (!permsLoading && !canCreate) return <Redirect href="/money" />;

	return (
		<CreateSheet
			kind="quote"
			title="New quote"
			subtitle="You'll add line items on the next screen"
			onClose={() => router.back()}
			footer={
				<Button
					title="Create quote"
					onPress={() => onlineAction("Creating a quote", () => void submit())}
					disabled={!valid || submitting}
					icon={
						submitting ? (
							<ActivityIndicator size="small" color={colors.primaryForeground} />
						) : undefined
					}
				/>
			}
		>
			<SheetField label="Client">
				<ClientPicker
					value={clientId}
					onChange={(next) => {
						setClientId(next);
						setProjectId(""); // a new client invalidates the staged project
					}}
					allowQuickAdd={!clientLocked && can("clients", "modify")}
					locked={clientLocked}
				/>
			</SheetField>

			{/* Optional, and only when the client actually has projects — same
			    FieldMenu idiom as the task form's client/project pair. */}
			{clientId && projects && projects.length > 0 ? (
				<SheetField label="Project">
					<FieldMenu
						title="Select project"
						value={projectId || NO_PROJECT}
						options={projectOptions}
						label={projectLabel}
						placeholder={!projectId}
						onSelect={(next) =>
							setProjectId(next === NO_PROJECT ? "" : (next as Id<"projects">))
						}
					/>
				</SheetField>
			) : null}

			<SheetField label="Title" hint="Optional">
				<SheetInput
					value={title}
					onChangeText={setTitle}
					placeholder="Optional"
					accessibilityLabel="Quote title"
				/>
			</SheetField>

			{error ? (
				<Text style={[styles.error, { color: t.danger }]}>{error.message}</Text>
			) : null}
		</CreateSheet>
	);
}

const styles = StyleSheet.create({
	error: {
		fontFamily: fontFamily.medium,
		fontSize: 12.5,
	},
});
