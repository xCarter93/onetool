import type { ComponentProps, ComponentType, CSSProperties, ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { AssistantCell } from "../bento/assistant-cell";
import { CheckPaidCell } from "../bento/check-paid-cell";
import { ClientCell } from "../bento/client-cell";
import { Feature } from "../bento/feature";
import { InboxCell } from "../bento/inbox-cell";
import { PaymentScheduleCell } from "../bento/payment-schedule-cell";
import { ReportsCell } from "../bento/reports-cell";
import { RequestsCell } from "../bento/requests-cell";
import { ScheduleCell } from "../bento/schedule-cell";
import { CHAPTERS, FEATURES, MORE_GUIDES, type Chapter } from "../features";
import { Halftone } from "../halftone";
import { Scaled } from "../hero/scaled";
import { Container, Lede, SectionHeading } from "../primitives";
import { Scene05Content } from "../workspace/scenes/scene-05";
import { Scene08Content } from "../workspace/scenes/scene-08";
import { WorkspaceFrame } from "../workspace/workspace-frame";
import { ChapterIndex } from "./chapter-index";
import { ClientDemo } from "./try-it";
import { ProjectCell } from "../bento/project-cell";
import { HowStage } from "./how-stage";
import { RunMap } from "./run-map";

const GUIDES = [...FEATURES, ...MORE_GUIDES];
const GAP = "gap-x-[clamp(32px,4vw,64px)] gap-y-[clamp(32px,4vw,48px)]";

type Scene = ComponentProps<typeof Halftone>["scene"];
const ART: Record<Chapter, Scene> = { win: "house", run: "van", paid: "paid", ahead: "ahead" };

function finalState(scene: number): CSSProperties {
	return {
		[`--v${scene}`]: 1,
		[`--a${scene}`]: 1,
		...(scene === 8 && { "--f": 292 }),
	} as CSSProperties;
}

function Frame({ scene, Content, className }: { scene: number; Content: ComponentType; className?: string }) {
	return (
		<div className={cn("lp-chapter-visual lp-how-frame", className)} data-how-scene={scene} style={finalState(scene)} aria-hidden="true" inert>
			<Scaled>
				<WorkspaceFrame scene={scene}>
					<div className="lp-workspace-scene">
						<Content />
					</div>
				</WorkspaceFrame>
			</Scaled>
		</div>
	);
}

function ChapterArticle({ id, title, body, children }: { id: Chapter; title: string; body: string; children: ReactNode }) {
	const guides = GUIDES.filter((guide) => guide.chapter === id);
	return (
		<article id={id} className="lp-chapter" aria-labelledby={`${id}-title`}>
			<div className="lp-story-head">
				<h3 id={`${id}-title`} className="lp-h2-sm max-w-[18ch] text-(--ink)">{title}</h3>
				<p className="lp-lede max-w-[34rem]">{body}</p>
			</div>
			{children}
			<nav className="lp-chapter-links" aria-label="Guides for this step">
				<span>Guides</span>
				{guides.map((guide) => (
					<a key={guide.key} href={guide.href}>
						{guide.label}
						<ArrowUpRight aria-hidden="true" className="size-3.5" />
					</a>
				))}
			</nav>
		</article>
	);
}

function WinTheWork() {
	return (
		<ChapterArticle
			id="win"
			title="Signed before the crew pulls up."
			body="No more typing up clipboard quotes after dinner. A request lands from your free community page, becomes a client and a quote in minutes, and comes back signed from her phone."
		>
			<div className={`lp-chapter-support grid ${GAP} lg:grid-cols-[minmax(0,6fr)_minmax(0,6fr)]`}>
				<Feature
					as="h4"
					title="It starts with a request"
					body="Anyone can ask for a quote from your free community page. Each request lands as a task, and Send quote adds the person as a client."
					label="Requests from your page: a new request from Grace Harlow for aeration and overseeding, and earlier requests from Rachel Whitfield and Priya Patel, both now clients."
					stageClassName="min-h-60 bg-(--paper)"
				>
					<RequestsCell />
				</Feature>
				<Feature
					as="h4"
					title="One record per client"
					body="Properties, past jobs, quotes and what they still owe, on one page for everyone you give access to."
					label="Whitfield Property Group’s client record: two properties, a zero balance, and recent work including the approved fall cleanup quote and two paid invoices."
					stageClassName="min-h-60 bg-(--sheet)"
				>
					<ClientCell />
				</Feature>
			</div>
			<Frame scene={5} Content={Scene05Content} />
		</ChapterArticle>
	);
}

function RunTheDay() {
	return (
		<ChapterArticle
			id="run"
			title="Every crew, every stop, in order."
			body="The schedule leaves the group text. Put each day’s stops in order on real streets, and every crew opens its route in the app."
		>
			<RunMap />
			<div className={`lp-chapter-support grid ${GAP} md:grid-cols-2`}>
				<Feature
					as="h4"
					title="Every task has an owner"
					body="Each project keeps its own task list. Give a task to a crew member and a day, and the overdue ones surface on their phone."
					label="The task list for the Whitfield fall cleanup project: gate code confirmed by Dana Ruiz, brush haul-away overdue for Trevor Reed, before and after photos due today for Jess Okafor, and the invoice queued for Dana."
					stageClassName="min-h-60 bg-(--sheet)"
				>
					<ProjectCell />
				</Feature>
				<Feature
					as="h4"
					title="Move a job and the crew sees it"
					body="Drag a visit to another day on the week calendar and your crew’s schedules change with it."
					label="The week calendar for October 5 to 9, 2026, with the Dunmore gutter clearing moved from Wednesday to Thursday."
					stageClassName="h-80 bg-(--sheet)"
				>
					<ScheduleCell />
				</Feature>
			</div>
		</ChapterArticle>
	);
}

function GetPaid() {
	return (
		<ChapterArticle
			id="paid"
			title="Paid before you pull away."
			body="Fewer checks ride around on the dash. The quote she signed becomes the invoice she pays by card from her phone, and Stripe sends the payout to your bank."
		>
			<ClientDemo />
			<div className={`lp-chapter-support grid ${GAP} md:grid-cols-2`}>
				<Feature
					as="h4"
					title="A deposit now, the balance later"
					body="Split a big job into dated installments. Your client pays them in order from the portal, and you see what’s left."
					label="The payment schedule on Maple Court Condos’ Invoice INV-002091: the $460.00 deposit is paid and the $1,380.25 balance is pending, due November 13."
					stageClassName="min-h-72 bg-(--sheet)"
				>
					<PaymentScheduleCell />
				</Feature>
				<Feature
					as="h4"
					title="Checks count too"
					body="Got a check? Click Mark as Paid and the portal never asks for that money again. On Business, invoices sync to QuickBooks Online."
					label="Kerr Road HOA’s Invoice INV-002085 for $825.00, marked paid on October 5, with its QuickBooks status reading Synced 1 day ago."
					stageClassName="min-h-72 bg-(--sheet)"
				>
					<CheckPaidCell />
				</Feature>
			</div>
		</ChapterArticle>
	);
}

function FollowUp() {
	return (
		<ChapterArticle
			id="ahead"
			title="Reminders go out on their own."
			body="The who-owes-what spreadsheet can go. Set a rule once and OneTool chases overdue invoices, then adds a call task when a reminder isn’t enough."
		>
			<Frame scene={8} Content={Scene08Content} />
			<div className={`lp-chapter-support grid ${GAP} md:grid-cols-2`}>
				{/* Fixed height so the arriving reply pushes the oldest thread out instead of growing the row. */}
				<Feature
					as="h4"
					title="Replies land on the right client"
					body="A client’s reply to your quote or invoice comes back to its thread, in one inbox your whole team shares."
					label="The shared inbox, where a reply from Dunmore Residence to Quote Q-001047 asks to move the job to Thursday."
					stageClassName="h-96 bg-(--sheet)"
				>
					<InboxCell />
				</Feature>
				<Feature
					as="h4"
					title="See which months paid best"
					body="Start from Revenue by month or 15 other ready-made reports. October counts what’s paid so far, and clicking a month shows its invoices."
					label="The Revenue by month report for 2026: paid invoices rise from $14,862 in January to a peak of $52,378 in September, with $18,593 so far in October. Total $339K."
					stageClassName="h-96 bg-(--sheet)"
				>
					<ReportsCell />
				</Feature>
				<Feature
					as="h4"
					className="md:col-span-2 lg:grid-cols-2 lg:gap-x-[clamp(32px,4vw,64px)]"
					title="Ask what’s on for Thursday"
					body="The assistant answers from your live schedule, clients and invoices. It can also add a task or update a project when you ask."
					label="The assistant answering what’s on for Thursday with three visits and their times, then adding a brush haul-away task for Trevor Reed on Thursday when asked."
					stageClassName="min-h-72 bg-(--sheet) lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:mt-0"
				>
					<AssistantCell />
				</Feature>
			</div>
		</ChapterArticle>
	);
}

export function HowItWorks() {
	return (
		<section id="how" className="lp-story" aria-labelledby="how-title">
			<Container className="py-[clamp(72px,9vw,136px)]">
				<div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
					<SectionHeading className="mt-0 max-w-[16ch]">
						<span id="how-title">From the first call to paid.</span>
					</SectionHeading>
					<div className="max-w-[30rem]">
						<Lede className="mt-0">
							One client record connects the quote, the crew, the payment and what comes next.
						</Lede>
						<p className="mt-4 text-sm text-(--ink-3)">
							{CHAPTERS.length} steps. Sample jobs from Ridgeline Home Services, a made-up crew.
						</p>
					</div>
				</div>

				<div className="lp-chapters">
					<ChapterIndex>
						{CHAPTERS.map(({ id }) => (
							<Halftone key={id} scene={ART[id]} />
						))}
					</ChapterIndex>
					<HowStage className="lp-chapters-body">
						<WinTheWork />
						<RunTheDay />
						<GetPaid />
						<FollowUp />
					</HowStage>
				</div>
			</Container>
		</section>
	);
}
