"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import {
	Building2,
	Bug,
	CheckSquare,
	FileText,
	FolderKanban,
	Lightbulb,
	MessagesSquare,
	MapPin,
	MessageCircle,
	Plus,
	Receipt,
	Search,
	UserRound,
} from "lucide-react";
import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@/components/ui/sidebar";
import { TaskSheet } from "@/components/shared/task-sheet";
import { useCreateRecord } from "@/components/domain/create-record-provider";
import { useOptionalSupportDialog } from "@/components/support/support-dialog-provider";
import {
	NAV_GROUPS,
	canViewNavItem,
	type NavVisibilityContext,
} from "@/components/layout/nav-config";
import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@clerk/nextjs";
import { useRoleAccess } from "@/hooks/use-role-access";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

type GlobalSearchResult = FunctionReturnType<typeof api.search.globalSearch>;
type TaskHit = GlobalSearchResult["tasks"][number];

// Backend requires 2+ chars; mirrored here so short queries never fire.
const MIN_QUERY_LENGTH = 2;

interface CommandPaletteContextValue {
	openPalette: () => void;
}

const CommandPaletteContext =
	React.createContext<CommandPaletteContextValue | null>(null);

export function useCommandPalette(): CommandPaletteContextValue {
	const ctx = React.useContext(CommandPaletteContext);
	if (!ctx) {
		throw new Error(
			"useCommandPalette must be used within CommandPaletteProvider",
		);
	}
	return ctx;
}

/**
 * Owns the workspace ⌘K palette: global shortcut, dialog, and the three
 * sections (Navigate from nav-config, Create via the quick-action gates,
 * Results from `api.search.globalSearch`). The help center has its own
 * palette in the `(help)` layout, so the listeners never coexist.
 */
export function CommandPaletteProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const router = useRouter();
	const openCreate = useCreateRecord();
	const [open, setOpen] = React.useState(false);
	const [query, setQuery] = React.useState("");
	const [editingTask, setEditingTask] = React.useState<TaskHit | null>(null);
	const [createTaskOpen, setCreateTaskOpen] = React.useState(false);

	const {
		can,
		hasFullAccess,
		isLoading: permissionsLoading,
	} = usePermissions();
	const { orgId } = useAuth();
	const hasOrganization = !!orgId;
	const { isAdmin, isMember } = useRoleAccess();
	const isCommunityEnabled = useFeatureFlagEnabled("community-pages-access");
	const isAutomationsEnabled = useFeatureFlagEnabled(
		"workflow-automation-access",
	);

	React.useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				setOpen((current) => !current);
			}
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, []);

	const handleOpenChange = React.useCallback((next: boolean) => {
		setOpen(next);
		if (!next) setQuery("");
	}, []);

	const openPalette = React.useCallback(() => setOpen(true), []);
	const value = React.useMemo(() => ({ openPalette }), [openPalette]);

	// Close first so the palette never sits on top of the destination.
	const runSelect = (action: () => void) => {
		handleOpenChange(false);
		action();
	};

	const trimmed = query.trim().toLowerCase();
	const debounced = useDebouncedValue(trimmed);
	const searchActive = debounced.length >= MIN_QUERY_LENGTH;
	const results = useQuery(
		api.search.globalSearch,
		open && searchActive ? { query: debounced } : "skip",
	);
	const searching =
		trimmed.length >= MIN_QUERY_LENGTH &&
		(results === undefined || debounced !== trimmed);

	const navVisibility: NavVisibilityContext = {
		hasOrganization,
		permissionsLoading,
		isMember,
		hasFullAccess,
		can,
	};
	const navItems = NAV_GROUPS.flatMap((group) => group.items).filter((item) => {
		if (item.title === "Community" && !isCommunityEnabled) return false;
		if (item.title === "Automations" && !isAutomationsEnabled) return false;
		// Without an org only Home and Settings are usable (the sidebar
		// renders the rest disabled).
		if (!hasOrganization) {
			return item.title === "Home" || item.title === "Settings";
		}
		return canViewNavItem(item, navVisibility);
	});
	// Results come pre-filtered from the server, so cmdk's own filtering is off
	// (shouldFilter={false}) and the static sections filter here instead.
	const filteredNav = trimmed
		? navItems.filter((item) => item.title.toLowerCase().includes(trimmed))
		: navItems;

	// Same gates as the sidebar quick-actions ("modify" = can create, with the
	// old isAdmin fallback while permissions load).
	const createActions = [
		{
			key: "client",
			label: "New client",
			visible: permissionsLoading ? isAdmin : can("clients", "modify"),
			run: () => openCreate({ type: "client" }),
		},
		{
			key: "project",
			label: "New project",
			visible: permissionsLoading ? isAdmin : can("projects", "modify"),
			run: () => openCreate({ type: "project" }),
		},
		{
			key: "quote",
			label: "New quote",
			visible: permissionsLoading ? isAdmin : can("quotes", "modify"),
			run: () => openCreate({ type: "quote" }),
		},
		{
			key: "task",
			label: "New task",
			visible: permissionsLoading ? isAdmin : can("tasks", "modify"),
			run: () => setCreateTaskOpen(true),
		},
	].filter((action) => action.visible && hasOrganization);
	const filteredCreate = trimmed
		? createActions.filter((action) =>
				action.label.toLowerCase().includes(trimmed),
			)
		: createActions;

	const openSupport = useOptionalSupportDialog();
	const supportActions = openSupport
		? ([
				{ key: "contact", label: "Contact support", icon: MessageCircle },
				{ key: "bug", label: "Report a bug", icon: Bug },
				{ key: "feature", label: "Request a feature", icon: Lightbulb },
			] as const)
		: [];
	const filteredSupport = trimmed
		? supportActions.filter((action) =>
				action.label.toLowerCase().includes(trimmed),
			)
		: supportActions;

	return (
		<CommandPaletteContext.Provider value={value}>
			{children}
			<CommandDialog
				open={open}
				onOpenChange={handleOpenChange}
				title="Search workspace"
				description="Search records, navigate, and create"
				className="top-1/4 sm:max-w-2xl"
			>
				<Command shouldFilter={false}>
					<CommandInput
						value={query}
						onValueChange={setQuery}
						placeholder="Search clients, projects, quotes..."
					/>
					{/* ! beats .cn-command-list's max-h-72 (plain-class @apply). */}
					<CommandList className="max-h-[28rem]!">
						<CommandEmpty>
							{searching ? "Searching…" : "No results found."}
						</CommandEmpty>
						{filteredNav.length > 0 && (
							<CommandGroup heading="Navigate">
								{filteredNav.map((item) => (
									<CommandItem
										key={item.url}
										value={`nav:${item.url}`}
										onSelect={() => runSelect(() => router.push(item.url))}
									>
										<item.icon />
										<span>{item.title}</span>
									</CommandItem>
								))}
							</CommandGroup>
						)}
						{filteredCreate.length > 0 && (
							<CommandGroup heading="Create">
								{filteredCreate.map((action) => (
									<CommandItem
										key={action.key}
										value={`create:${action.key}`}
										onSelect={() => runSelect(action.run)}
									>
										<Plus />
										<span>{action.label}</span>
									</CommandItem>
								))}
							</CommandGroup>
						)}
						{(filteredSupport.length > 0 ||
							!trimmed ||
							"your support requests".includes(trimmed)) && (
							<CommandGroup heading="Support">
								{filteredSupport.map((action) => (
									<CommandItem
										key={action.key}
										value={`support:${action.key}`}
										onSelect={() =>
											runSelect(() => openSupport?.(action.key))
										}
									>
										<action.icon />
										<span>{action.label}</span>
									</CommandItem>
								))}
								{(!trimmed || "your support requests".includes(trimmed)) && (
									<CommandItem
										value="support:requests"
										onSelect={() => runSelect(() => router.push("/support"))}
									>
										<MessagesSquare />
										<span>Your support requests</span>
									</CommandItem>
								)}
							</CommandGroup>
						)}
						{results && results.clients.length > 0 && (
							<CommandGroup heading="Clients">
								{results.clients.map((hit, index) => (
									<CommandItem
										key={`${hit.kind}:${hit.clientId}:${index}`}
										value={`client:${hit.kind}:${hit.clientId}:${index}`}
										onSelect={() =>
											runSelect(() => router.push(`/clients/${hit.clientId}`))
										}
									>
										{hit.kind === "contact" ? (
											<UserRound />
										) : hit.kind === "property" ? (
											<MapPin />
										) : (
											<Building2 />
										)}
										<span className="truncate">{hit.label}</span>
										{hit.detail && (
											<span className="truncate text-muted-foreground">
												{hit.detail}
											</span>
										)}
									</CommandItem>
								))}
							</CommandGroup>
						)}
						{results && results.projects.length > 0 && (
							<CommandGroup heading="Projects">
								{results.projects.map((hit) => (
									<CommandItem
										key={hit.projectId}
										value={`project:${hit.projectId}`}
										onSelect={() =>
											runSelect(() => router.push(`/projects/${hit.projectId}`))
										}
									>
										<FolderKanban />
										<span className="truncate">{hit.label}</span>
										{hit.detail && (
											<span className="truncate text-muted-foreground">
												{hit.detail}
											</span>
										)}
									</CommandItem>
								))}
							</CommandGroup>
						)}
						{results && results.quotes.length > 0 && (
							<CommandGroup heading="Quotes">
								{results.quotes.map((hit) => (
									<CommandItem
										key={hit.quoteId}
										value={`quote:${hit.quoteId}`}
										onSelect={() =>
											runSelect(() => router.push(`/quotes/${hit.quoteId}`))
										}
									>
										<FileText />
										<span className="truncate">{hit.label}</span>
										{hit.detail && (
											<span className="truncate text-muted-foreground">
												{hit.detail}
											</span>
										)}
									</CommandItem>
								))}
							</CommandGroup>
						)}
						{results && results.invoices.length > 0 && (
							<CommandGroup heading="Invoices">
								{results.invoices.map((hit) => (
									<CommandItem
										key={hit.invoiceId}
										value={`invoice:${hit.invoiceId}`}
										onSelect={() =>
											runSelect(() => router.push(`/invoices/${hit.invoiceId}`))
										}
									>
										<Receipt />
										<span className="truncate">{hit.label}</span>
										{hit.detail && (
											<span className="truncate text-muted-foreground">
												{hit.detail}
											</span>
										)}
									</CommandItem>
								))}
							</CommandGroup>
						)}
						{results && results.tasks.length > 0 && (
							<CommandGroup heading="Tasks">
								{results.tasks.map((task) => (
									<CommandItem
										key={task._id}
										value={`task:${task._id}`}
										onSelect={() => runSelect(() => setEditingTask(task))}
									>
										<CheckSquare />
										<span className="truncate">{task.title}</span>
									</CommandItem>
								))}
							</CommandGroup>
						)}
					</CommandList>
				</Command>
			</CommandDialog>
			{/* Tasks have no detail route — a hit opens the shared TaskSheet. */}
			{editingTask && (
				<TaskSheet
					task={editingTask}
					mode="edit"
					isOpen={true}
					onOpenChange={(nowOpen) => {
						if (!nowOpen) setEditingTask(null);
					}}
				/>
			)}
			<TaskSheet
				mode="create"
				isOpen={createTaskOpen}
				onOpenChange={setCreateTaskOpen}
			/>
		</CommandPaletteContext.Provider>
	);
}

/** Sidebar search affordance; a plain icon button when the rail is collapsed. */
export function CommandPaletteTrigger() {
	const { openPalette } = useCommandPalette();
	const { state } = useSidebar();

	if (state === "collapsed") {
		return (
			<SidebarMenu>
				<SidebarMenuItem>
					<SidebarMenuButton
						tooltip="Search"
						onClick={openPalette}
						className="justify-center text-muted-foreground hover:text-foreground"
					>
						<Search />
						<span className="sr-only">Search</span>
					</SidebarMenuButton>
				</SidebarMenuItem>
			</SidebarMenu>
		);
	}

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<SidebarMenuButton
					tooltip="Search"
					onClick={openPalette}
					className="border border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
				>
					<Search />
					<span>Search...</span>
					<Kbd className="ml-auto">&#8984;K</Kbd>
				</SidebarMenuButton>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
