import type { ComponentType } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { ArrowDownLeft, ArrowUpRight, CalendarDays, FolderKanban } from "lucide-react-native";
import { Badge } from "@/components/ui";
import {
	buildScheduleRows,
	clientRow,
	hiddenCount,
	humanize,
	invoiceRow,
	projectRow,
	quoteRow,
	ROW_CAP,
	skuRow,
	teamMemberRow,
	type RecordRow,
	type ScheduleRow,
} from "@/lib/assistant-renderers";
import { mapWebPathToMobileRoute } from "@/lib/assistant-nav";
import { formatCurrency } from "@/lib/format";
import { STATUS, fontFamily, type, useTokens } from "@/lib/theme";
import { Divided, EmptyPanel, MoreNote, Panel, SectionLabel, text } from "./panel";

interface RendererProps {
	output: unknown;
}

function RecordLine({ row }: { row: RecordRow }) {
	const t = useTokens();
	const route = row.href ? mapWebPathToMobileRoute(row.href) : null;
	const known = row.status ? STATUS[row.status as keyof typeof STATUS] : undefined;
	return (
		<Pressable
			disabled={!route}
			onPress={() => route && router.push(route as Href)}
			accessibilityRole={route ? "button" : undefined}
			style={({ pressed }) => [styles.row, pressed && styles.pressed]}
		>
			<View style={styles.body}>
				<Text style={[text.primary, { color: t.ink }]} numberOfLines={1}>
					{row.primary}
				</Text>
				{row.secondary ? (
					<Text style={[text.secondary, { color: t.sub }]} numberOfLines={1}>
						{row.secondary}
					</Text>
				) : null}
			</View>
			<View style={styles.trailing}>
				{row.amount !== undefined ? (
					<Text style={[text.number, { color: t.ink }]}>
						{formatCurrency(row.amount, { exact: true })}
					</Text>
				) : null}
				{row.status ? (
					<Badge status={row.status} label={known ? undefined : humanize(row.status)} />
				) : null}
			</View>
		</Pressable>
	);
}

function createRecordListRenderer<T>(
	emptyLabel: string,
	toRow: (item: T) => RecordRow,
): ComponentType<RendererProps> {
	return function RecordListRenderer({ output }: RendererProps) {
		const result = output as { items?: unknown[]; totalCount?: number } | undefined;
		const items = Array.isArray(result?.items) ? (result.items as T[]) : [];
		if (items.length === 0) return <EmptyPanel>{emptyLabel}</EmptyPanel>;
		return (
			<Panel>
				{items.slice(0, ROW_CAP).map((item, i) => {
					const row = toRow(item);
					return (
						<Divided key={row.id} first={i === 0}>
							<RecordLine row={row} />
						</Divided>
					);
				})}
				<MoreNote hidden={hiddenCount(items.length, result?.totalCount)} />
			</Panel>
		);
	};
}

export const ClientsRenderer = createRecordListRenderer("No clients found.", clientRow);
export const ProjectsRenderer = createRecordListRenderer("No projects found.", projectRow);
export const QuotesRenderer = createRecordListRenderer("No quotes found.", quoteRow);
export const InvoicesRenderer = createRecordListRenderer("No invoices found.", invoiceRow);
export const SkusRenderer = createRecordListRenderer("No services found.", skuRow);
export const TeamMembersRenderer = createRecordListRenderer(
	"No team members found.",
	teamMemberRow,
);

function ScheduleSection({
	label,
	icon,
	rows,
}: {
	label: string;
	icon: ComponentType<{ size: number; color: string }>;
	rows: ScheduleRow[];
}) {
	const t = useTokens();
	const Icon = icon;
	return (
		<View>
			<SectionLabel icon={<Icon size={12} color={t.faint} />}>{label}</SectionLabel>
			{rows.slice(0, ROW_CAP).map((row, i) => (
				<Divided key={row.id} first={i === 0}>
					<View style={styles.row}>
						<View style={styles.body}>
							<Text style={[text.primary, { color: t.ink }]} numberOfLines={1}>
								{row.primary}
							</Text>
							{row.secondary ? (
								<Text style={[text.secondary, { color: t.sub }]} numberOfLines={1}>
									{row.secondary}
								</Text>
							) : null}
						</View>
						<Text style={[styles.when, { color: t.sub }]}>{row.when}</Text>
					</View>
				</Divided>
			))}
			<MoreNote hidden={hiddenCount(rows.length)} />
		</View>
	);
}

export function ScheduleRenderer({ output }: RendererProps) {
	const { tasks, projects } = buildScheduleRows(output);
	if (tasks.length === 0 && projects.length === 0) {
		return <EmptyPanel>Nothing scheduled in that range.</EmptyPanel>;
	}
	return (
		<Panel>
			<View style={styles.sections}>
				{tasks.length > 0 ? (
					<ScheduleSection label="Tasks" icon={CalendarDays} rows={tasks} />
				) : null}
				{projects.length > 0 ? (
					<ScheduleSection label="Projects" icon={FolderKanban} rows={projects} />
				) : null}
			</View>
		</Panel>
	);
}

interface EmailsOutput {
	items?: {
		direction: string;
		subject: string;
		preview?: string;
		from: string;
		to: string;
		sentAt?: string | number;
	}[];
	totalCount?: number;
}

// sentAt is a real timestamp, so local time is correct here.
function formatSentAt(sentAt: string | number | undefined) {
	if (sentAt === undefined) return "";
	return new Date(sentAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function EmailsRenderer({ output }: RendererProps) {
	const t = useTokens();
	const result = output as EmailsOutput | undefined;
	const emails = Array.isArray(result?.items) ? result.items : [];
	if (emails.length === 0) return <EmptyPanel>No emails found.</EmptyPanel>;
	return (
		<Panel>
			{emails.slice(0, ROW_CAP).map((email, i) => {
				const outbound = email.direction === "outbound";
				const Arrow = outbound ? ArrowUpRight : ArrowDownLeft;
				return (
					<Divided key={i} first={i === 0}>
						<View style={styles.email}>
							<View style={styles.row}>
								<View style={[styles.body, styles.subjectLine]}>
									<Arrow size={12} color={outbound ? t.faint : t.primary} />
									<Text
										style={[text.primary, styles.shrink, { color: t.ink }]}
										numberOfLines={1}
									>
										{email.subject || "(no subject)"}
									</Text>
								</View>
								<Text style={[styles.when, { color: t.sub }]}>
									{formatSentAt(email.sentAt)}
								</Text>
							</View>
							<Text
								style={[text.secondary, styles.emailMeta, { color: t.sub }]}
								numberOfLines={1}
							>
								{outbound ? `To ${email.to}` : `From ${email.from}`}
								{email.preview ? ` — ${email.preview}` : ""}
							</Text>
						</View>
					</Divided>
				);
			})}
			<MoreNote hidden={hiddenCount(emails.length, result?.totalCount)} />
		</Panel>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingVertical: 8,
	},
	pressed: { opacity: 0.6 },
	body: { flex: 1, minWidth: 0 },
	shrink: { flexShrink: 1 },
	trailing: {
		alignItems: "flex-end",
		gap: 4,
	},
	when: {
		fontFamily: fontFamily.regular,
		fontSize: type.meta,
		fontVariant: ["tabular-nums"],
	},
	sections: { gap: 12 },
	email: { paddingBottom: 8 },
	subjectLine: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	emailMeta: {
		paddingLeft: 18,
		marginTop: -4,
	},
});
