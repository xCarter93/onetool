"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { AnimatePresence, motion } from "motion/react";
import { api } from "@onetool/backend/convex/_generated/api";
import type { Id } from "@onetool/backend/convex/_generated/dataModel";
import { ArrowLeft, ChevronRight, Mail, Pencil, PenLine } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Item, ItemMedia } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Frame, FramePanel } from "@/components/reui/frame";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import { useEntitlements } from "@/hooks/use-entitlements";
import { usePermissions } from "@/hooks/use-permissions";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { useToast } from "@/hooks/use-toast";

import {
	MAX_TOTAL_ATTACHMENT_BYTES,
	toOutboundAttachments,
	totalAttachmentBytes,
	type ComposerAttachment,
} from "./attachment-types";
import { formatBytes } from "./email-attachment-list";
import { EmailComposer } from "./email-composer";
import { EmailRecipientsField } from "./email-recipients-field";
import { emailSendErrorMessage } from "./send-error";
import {
	EntityEmailAttachments,
	pdfFileName,
	resolvePdfSelection,
	type PdfSelection,
} from "./entity-email-attachments";
import { EntityEmailPreview } from "./entity-email-preview";

type ComposeMode = "template" | "custom";

export interface EntityEmailTarget {
	type: "quote" | "invoice";
	id: Id<"quotes"> | Id<"invoices">;
	/** Number as the client sees it, e.g. "Q-000042". */
	number?: string;
	/** Quote title, shown in the template preview. */
	title?: string;
	clientId: Id<"clients">;
	total: number;
	/** Quote valid-until or invoice due date, UTC-midnight ms. */
	dateStamp?: number;
	/** Last client-visible edit; compared against the PDF to detect staleness. */
	contentUpdatedAt?: number;
	firstSentAt?: number;
	/** Quotes only: legacy send stamp that predates firstSentAt. */
	sentAt?: number;
}

export interface EntityEmailModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	entity: EntityEmailTarget;
	/** Quotes only: routes to the embedded e-signature page. */
	onNavigateToSignature?: () => void;
	/** Quotes only: why e-signature is unavailable (plan meter, permissions). */
	signatureDisabledReason?: string;
	/** Why an email cannot be sent at all, e.g. an already-approved quote. */
	emailDisabledReason?: string;
	/** Re-renders and stores a new PDF version. Omit where no render pipeline exists. */
	onRegeneratePdf?: () => Promise<void> | void;
}

const ENTER = [0.23, 1, 0.32, 1] as const;
const MOVE = [0.77, 0, 0.175, 1] as const;

/** Matches the To/Cc/Bcc label column in EmailRecipientsField. */
const SUBJECT_LABEL_CLASS =
	"w-9 shrink-0 pt-1.5 text-xs font-medium text-muted-foreground";

function errorCode(err: unknown): string | undefined {
	if (err instanceof ConvexError) {
		return (err.data as { code?: string } | undefined)?.code;
	}
	return undefined;
}

function formatDateStamp(ms: number): string {
	return new Date(ms).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	});
}

interface ChooserRowProps {
	icon: React.ReactNode;
	title: string;
	description: string;
	onSelect: () => void;
}

function ChooserRow({ icon, title, description, onSelect }: ChooserRowProps) {
	return (
		<li>
			<button
				type="button"
				onClick={onSelect}
				className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-150 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
			>
				<Item className="flex size-10 shrink-0 items-center justify-center border bg-muted p-0 [&_svg]:size-4.5 [&_svg]:text-foreground">
					<ItemMedia variant="icon" className="size-auto">
						{icon}
					</ItemMedia>
				</Item>
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<p className="text-sm font-semibold text-foreground">{title}</p>
					<p className="text-xs leading-4 text-muted-foreground">
						{description}
					</p>
				</div>
				<ChevronRight
					className="size-4 shrink-0 text-muted-foreground"
					aria-hidden="true"
				/>
			</button>
		</li>
	);
}

/**
 * The one send surface for quotes and invoices: portal template, custom email,
 * or (quotes) a hand-off to the embedded e-signature page. The chooser and the
 * compose view are sub-screens of the same modal.
 */
export function EntityEmailModal({
	open,
	onOpenChange,
	entity,
	onNavigateToSignature,
	signatureDisabledReason,
	emailDisabledReason,
	onRegeneratePdf,
}: EntityEmailModalProps) {
	const toast = useToast();
	const { confirm } = useConfirmDialog();
	const { can } = usePermissions();
	const { meter } = useEntitlements();
	const reducedMotion = usePrefersReducedMotion();
	const isQuote = entity.type === "quote";
	const canViewDocuments = can("documents");

	const [mode, setMode] = useState<ComposeMode | null>(null);
	const [toOverride, setToOverride] = useState<string[] | null>(null);
	const [cc, setCc] = useState<string[]>([]);
	const [bcc, setBcc] = useState<string[]>([]);
	const [subjectOverride, setSubjectOverride] = useState<string | null>(null);
	const [bodyHtml, setBodyHtml] = useState("");
	const [uploads, setUploads] = useState<ComposerAttachment[]>([]);
	const [pdfSelection, setPdfSelection] = useState<PdfSelection>({
		kind: "latest",
	});
	const [notice, setNotice] = useState<string | null>(null);
	const [isSending, setIsSending] = useState(false);
	const [navDirection, setNavDirection] = useState(1);
	const [requestId, setRequestId] = useState(() => crypto.randomUUID());
	const backButtonRef = useRef<HTMLButtonElement>(null);

	// The chooser's focused row unmounts on the swap; land focus at the top of compose.
	useEffect(() => {
		if (mode !== null) backButtonRef.current?.focus();
	}, [mode]);

	const organization = useQuery(api.organizations.get, open ? {} : "skip");
	const client = useQuery(
		api.clients.get,
		open ? { id: entity.clientId } : "skip"
	);
	const contacts = useQuery(
		api.clientContacts.listByClient,
		open ? { clientId: entity.clientId } : "skip"
	);
	const latestDocument = useQuery(
		api.documents.getLatest,
		open && canViewDocuments
			? { documentType: entity.type, documentId: entity.id }
			: "skip"
	);
	const versions = useQuery(
		api.documents.getAllVersions,
		open && canViewDocuments
			? { documentType: entity.type, documentId: entity.id }
			: "skip"
	);

	const sendQuote = useMutation(api.quotes.sendToClient);
	const sendInvoice = useMutation(api.invoices.sendToClient);

	const orgName = organization?.name ?? "";
	const primaryContact = contacts?.find((contact) => contact.isPrimary);
	const suggestions = (contacts ?? [])
		.filter((contact) => Boolean(contact.email))
		.map((contact) => ({
			email: contact.email as string,
			name: `${contact.firstName} ${contact.lastName}`.trim(),
		}));

	const defaultTo = primaryContact?.email ? [primaryContact.email] : [];
	const defaultSubject = isQuote
		? entity.number
			? `Quote ${entity.number} from ${orgName}`
			: `New quote from ${orgName}`
		: entity.number
			? `Invoice ${entity.number} from ${orgName}`
			: `New invoice from ${orgName}`;

	const to = toOverride ?? defaultTo;
	const subject = subjectOverride ?? defaultSubject;

	// React's documented "adjust state when a prop changes" pattern. An effect
	// here would trip react-hooks/set-state-in-effect.
	const [wasOpen, setWasOpen] = useState(open);
	if (open !== wasOpen) {
		setWasOpen(open);
		if (open) {
			setMode(null);
			setNavDirection(1);
			setToOverride(null);
			setCc([]);
			setBcc([]);
			setSubjectOverride(null);
			setBodyHtml("");
			setUploads([]);
			setPdfSelection({ kind: "latest" });
			setNotice(null);
			setRequestId(crypto.randomUUID());
		}
	}

	const isPdfStale = Boolean(
		latestDocument &&
			entity.contentUpdatedAt !== undefined &&
			entity.contentUpdatedAt > latestDocument.generatedAt
	);
	const resolvedPdf = resolvePdfSelection(pdfSelection, latestDocument, versions);
	const overSizeLimit = totalAttachmentBytes(uploads) > MAX_TOTAL_ATTACHMENT_BYTES;

	const isFirstSend = !entity.firstSentAt && !entity.sentAt;
	const sendsRemaining = meter("clientSends")?.remaining ?? null;
	// Only metered plans get a caption; unlimited plans have nothing to say.
	const meterCaption =
		sendsRemaining === null
			? null
			: isFirstSend
				? `Uses 1 of your ${sendsRemaining} remaining client sends this month.`
				: "Resends don't count against your monthly allowance.";

	const isDirty =
		toOverride !== null ||
		subjectOverride !== null ||
		cc.length > 0 ||
		bcc.length > 0 ||
		bodyHtml.trim().length > 0 ||
		uploads.length > 0 ||
		pdfSelection?.kind !== "latest";

	const hasBody = bodyHtml.trim().length > 0;
	const canSend =
		!isSending &&
		!emailDisabledReason &&
		!overSizeLimit &&
		to.length > 0 &&
		(mode === "template" || hasBody);

	const entityWord = isQuote ? "quote" : "invoice";
	const entityLabel = `${isQuote ? "Quote" : "Invoice"}-${entity.number ?? entity.id.slice(-6)}`;
	const takesPayment = Boolean(organization?.stripeChargesEnabled);
	const ctaLabel = isQuote
		? "Review quote"
		: takesPayment
			? "View & pay invoice"
			: "View invoice online";
	const portalNote = isQuote
		? "A link to view this quote online is included automatically."
		: `A link to ${takesPayment ? "view and pay" : "view"} this invoice online is included automatically.`;

	const confirmDiscard = async () => {
		if (!isDirty) return true;
		return confirm({
			title: "Discard this email?",
			message: "Your recipients, message, and attachments will be lost.",
			confirmLabel: "Discard",
			cancelLabel: "Keep editing",
			variant: "warning",
		});
	};

	const requestClose = async () => {
		if (await confirmDiscard()) onOpenChange(false);
	};

	const handleSignature = async () => {
		if (signatureDisabledReason) {
			setNotice(signatureDisabledReason);
			return;
		}
		if (canViewDocuments) {
			if (latestDocument === undefined) {
				setNotice("Checking for a generated PDF. Try again in a moment.");
				return;
			}
			if (latestDocument === null) {
				setNotice(
					"Generate a PDF for this quote before sending it for signature."
				);
				return;
			}
		}
		if (!(await confirmDiscard())) return;
		if (isPdfStale) {
			// A warning toast survives the route change, so the notice rides along
			// with the user instead of blocking the hand-off.
			toast.warning(
				"PDF may be out of date",
				"The attached PDF is older than the latest edits. Regenerate first?"
			);
		}
		onOpenChange(false);
		onNavigateToSignature?.();
	};

	const buildAttachments = () => {
		const attachments: ComposerAttachment[] = [...uploads];
		if (resolvedPdf) {
			const storageId = resolvedPdf.signed
				? resolvedPdf.document.signedStorageId
				: resolvedPdf.document.storageId;
			if (storageId) {
				attachments.unshift({
					storageId,
					filename: pdfFileName(
						entityLabel,
						resolvedPdf.document.version,
						resolvedPdf.signed
					),
					mimeType: "application/pdf",
					// The server re-reads the real size from storage.
					size: 0,
					source: "generated-pdf",
				});
			}
		}
		return toOutboundAttachments(attachments);
	};

	const send = async (): Promise<boolean> => {
		if (!canSend || !mode) return false;
		setIsSending(true);
		setNotice(null);
		try {
			const args = {
				mode,
				to,
				cc,
				bcc,
				attachments: buildAttachments(),
				requestId,
				...(mode === "custom"
					? { subject: subject.trim(), html: bodyHtml }
					: {}),
			};
			if (isQuote) {
				await sendQuote({ id: entity.id as Id<"quotes">, ...args });
			} else {
				await sendInvoice({ id: entity.id as Id<"invoices">, ...args });
			}
			toast.success(
				isQuote ? "Quote sent" : "Invoice sent",
				`Your client will get an email to view the ${entityWord} in the portal.`
			);
			onOpenChange(false);
			return true;
		} catch (err) {
			const message = emailSendErrorMessage(
				err,
				`Failed to send this ${entityWord}`
			);
			if (errorCode(err) === "RECIPIENT_SUPPRESSED") {
				setNotice(message);
			} else {
				toast.error(`Couldn't send ${entityWord}`, message);
			}
			return false;
		} finally {
			setIsSending(false);
		}
	};

	const isLoading = organization === undefined || contacts === undefined;
	const missingRecipient = !isLoading && to.length === 0;

	const blocker = overSizeLimit
		? {
				title: "Attachments are too large",
				description: `Total attachments must stay under ${formatBytes(MAX_TOTAL_ATTACHMENT_BYTES)}. Remove one and try again.`,
			}
		: emailDisabledReason
			? {
					title: `This ${entityWord} can't be emailed`,
					description: emailDisabledReason,
				}
			: notice
				? { title: "Can't send yet", description: notice }
				: missingRecipient
					? {
							title: "No recipient yet",
							description:
								"Add an email to this client's primary contact, or type an address above.",
						}
					: null;

	const screen = mode === null ? "chooser" : "compose";
	const slide = reducedMotion ? 0 : 24;
	// AnimatePresence hands `custom` to the exiting child too, so back navigation
	// sends both screens the opposite way.
	const screenVariants = {
		enter: (direction: number) => ({ opacity: 0, x: direction * slide }),
		center: { opacity: 1, x: 0 },
		// Leaves faster than it enters so the incoming screen owns the eye.
		exit: (direction: number) => ({
			opacity: 0,
			x: -direction * slide,
			transition: { duration: reducedMotion ? 0 : 0.165, ease: ENTER },
		}),
	};

	const openCompose = (next: ComposeMode) => {
		setNavDirection(1);
		setMode(next);
	};

	const backToChooser = () => {
		setNavDirection(-1);
		setMode(null);
	};

	const chooser = (
		<div className="w-[min(92vw,26rem)] space-y-4 p-6">
			<div className="space-y-1">
				<h2 className="text-lg font-semibold text-foreground">
					Send {entityWord} {entity.number ?? ""}
				</h2>
				<p className="text-sm text-muted-foreground">
					{client?.companyName
						? `Goes to ${client.companyName}.`
						: `Choose how to email this ${entityWord}.`}
				</p>
			</div>

			<Frame className="w-full">
				<FramePanel className="p-0!">
					<ul className="flex flex-col">
						<ChooserRow
							icon={<Mail aria-hidden="true" />}
							title="Portal template"
							description={
								isQuote
									? "The branded email with a link to review and approve."
									: "The branded email with a link to view and pay."
							}
							onSelect={() => openCompose("template")}
						/>
						<Separator />
						<ChooserRow
							icon={<Pencil aria-hidden="true" />}
							title="Custom email"
							description="Write your own message. The portal link still goes with it."
							onSelect={() => openCompose("custom")}
						/>
						{isQuote && onNavigateToSignature ? (
							<>
								<Separator />
								<ChooserRow
									icon={<PenLine aria-hidden="true" />}
									title="Send for e-signature"
									description="Collect a signature on the quote PDF."
									onSelect={() => void handleSignature()}
								/>
							</>
						) : null}
					</ul>
				</FramePanel>
			</Frame>

			{notice ? (
				<Alert variant="destructive">
					<AlertTitle>Can&apos;t send yet</AlertTitle>
					<AlertDescription>{notice}</AlertDescription>
				</Alert>
			) : null}
		</div>
	);

	const compose = (
		<div className="flex max-h-[80vh] w-[min(92vw,40rem)] flex-col">
			<div className="flex items-start gap-2 p-6 pb-4">
				<Button
					ref={backButtonRef}
					variant="ghost"
					size="icon-sm"
					className="mt-0.5 shrink-0"
					onClick={backToChooser}
					disabled={isSending}
					aria-label="Back to send options"
				>
					<ArrowLeft className="size-4" aria-hidden="true" />
				</Button>
				<div className="min-w-0 space-y-1">
					<h2 className="text-lg font-semibold text-foreground">
						{mode === "template" ? "Portal template" : "Custom email"}
					</h2>
					<p className="text-sm text-muted-foreground">
						{isQuote ? "Quote" : "Invoice"} {entity.number ?? ""}
						{client?.companyName ? ` for ${client.companyName}` : ""}
					</p>
				</div>
			</div>

			<div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6">
				{isLoading ? (
					<div className="space-y-3">
						<Skeleton className="h-20 w-full" />
						<Skeleton className="h-9 w-full" />
						<Skeleton className="h-48 w-full" />
					</div>
				) : (
					<>
						<div>
							<EmailRecipientsField
								value={{ to, cc, bcc }}
								onChange={(next) => {
									setToOverride(next.to);
									setCc(next.cc);
									setBcc(next.bcc);
								}}
								suggestions={suggestions}
								toLocked={mode === "template"}
								disabled={isSending}
								className="rounded-b-none border-b-0"
							/>
							<div className="flex items-start gap-3 rounded-b-lg border border-border px-3 py-2">
								{mode === "custom" ? (
									<>
										<label
											htmlFor="entity-email-subject"
											className={SUBJECT_LABEL_CLASS}
										>
											Subject
										</label>
										<Input
											id="entity-email-subject"
											value={subject}
											onChange={(event) =>
												setSubjectOverride(event.target.value)
											}
											disabled={isSending}
											className="h-auto min-w-0 flex-1 border-0 bg-transparent px-0 py-1 shadow-none dark:bg-transparent"
										/>
									</>
								) : (
									<>
										<span className={SUBJECT_LABEL_CLASS}>Subject</span>
										<p className="min-w-0 flex-1 py-1 text-sm text-foreground">
											{defaultSubject}
										</p>
									</>
								)}
							</div>
						</div>

						{mode === "template" ? (
							<EntityEmailPreview
								entityType={entity.type}
								orgName={orgName}
								orgLogoUrl={organization?.logoUrl}
								orgEmail={organization?.email}
								orgPhone={organization?.phone}
								greetingName={primaryContact?.firstName ?? "there"}
								numberLabel={entity.number}
								title={entity.title}
								amount={entity.total}
								dateLabel={
									entity.dateStamp
										? formatDateStamp(entity.dateStamp)
										: undefined
								}
								ctaLabel={ctaLabel}
							/>
						) : (
							<EmailComposer
								onSend={send}
								isSending={isSending}
								disabled={Boolean(emailDisabledReason)}
								placeholder={`Write a note to go with this ${entityWord}…`}
								initialHtml={bodyHtml}
								onChangeHtml={setBodyHtml}
								size="large"
								sendLabel={`Send ${entityWord}`}
								hideSendButton
							/>
						)}

						<p className="text-xs text-muted-foreground">{portalNote}</p>

						<EntityEmailAttachments
							entityLabel={entityLabel}
							latestDocument={latestDocument}
							versions={versions}
							selection={pdfSelection}
							onSelectionChange={setPdfSelection}
							isStale={isPdfStale}
							onRegenerate={onRegeneratePdf}
							uploads={uploads}
							onUploadsChange={setUploads}
							canUpload={can(entity.type === "quote" ? "quotes" : "invoices", "modify")}
							disabled={isSending}
						/>

						{blocker ? (
							<Alert variant="destructive">
								<AlertTitle>{blocker.title}</AlertTitle>
								<AlertDescription>
									{blocker.description}
								</AlertDescription>
							</Alert>
						) : null}
					</>
				)}
			</div>

			<div className="flex flex-wrap items-center justify-between gap-3 p-6 pt-4">
				<p className="text-xs text-muted-foreground">{meterCaption}</p>
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						onClick={() => void requestClose()}
						disabled={isSending}
					>
						Cancel
					</Button>
					<Button onClick={() => void send()} disabled={!canSend}>
						{isSending ? "Sending…" : `Send ${entityWord}`}
					</Button>
				</div>
			</div>
		</div>
	);

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (next) onOpenChange(true);
				else void requestClose();
			}}
		>
			<DialogContent className="w-auto max-w-none overflow-hidden p-0 sm:max-w-none">
				{/* One stable accessible name: both screens are mounted together
				    mid-transition, so per-screen titles would collide. */}
				<DialogTitle className="sr-only">
					Send {entityWord} {entity.number ?? ""}
				</DialogTitle>
				<motion.div
					layout={!reducedMotion}
					transition={{
						duration: reducedMotion ? 0 : 0.26,
						ease: MOVE,
					}}
					className="relative"
				>
					<AnimatePresence
						initial={false}
						mode="popLayout"
						custom={navDirection}
					>
						<motion.div
							key={screen}
							// Also layout-animated so the parent's size change
							// scale-corrects instead of stretching this screen.
							layout={!reducedMotion}
							custom={navDirection}
							variants={screenVariants}
							initial="enter"
							animate="center"
							exit="exit"
							transition={{
								duration: reducedMotion ? 0 : 0.22,
								ease: ENTER,
							}}
						>
							{screen === "chooser" ? chooser : compose}
						</motion.div>
					</AnimatePresence>
				</motion.div>
			</DialogContent>
		</Dialog>
	);
}
