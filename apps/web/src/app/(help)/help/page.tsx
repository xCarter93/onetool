import Link from "next/link";
import { HelpSearchHero } from "@/components/help/help-search";
import { HELP_CATEGORIES, getHelpCategory } from "@/lib/help";

const popularLinks = [
	{ label: "Importing clients", href: "/help/clients/importing-clients" },
	{ label: "Getting paid", href: "/help/invoices-and-payments/getting-paid" },
	{ label: "E-signatures", href: "/help/quotes/e-signatures" },
	{ label: "Automations", href: "/help/automations/automations-overview" },
];

export default function HelpHomePage() {
	const gettingStarted = getHelpCategory("getting-started");
	const featureCategories = HELP_CATEGORIES.filter(
		(category) => category.group === "features"
	);

	return (
		<div className="py-12 sm:py-16">
			{/* Hero */}
			<div className="mx-auto flex max-w-2xl flex-col items-center text-center">
				<p className="text-xs font-semibold tracking-widest text-primary uppercase">
					OneTool help
				</p>
				<h1 className="mt-3 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
					How can we help?
				</h1>
				<p className="mt-4 text-lg leading-7 text-muted-foreground">
					Guides and answers for every part of OneTool.
				</p>
				<HelpSearchHero className="mt-8" />
				<div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-sm">
					<span className="text-muted-foreground">Popular:</span>
					{popularLinks.map((link) => (
						<Link
							key={link.href}
							href={link.href}
							className="rounded-full border border-border px-3 py-1 text-[13px] font-medium text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
						>
							{link.label}
						</Link>
					))}
				</div>
			</div>

			{/* Getting started */}
			{gettingStarted && gettingStarted.articles.length > 0 && (
				<section className="mt-20 grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
					<div>
						<h2 className="text-3xl font-bold tracking-tight text-foreground">
							Get started{" "}
							<span className="text-muted-foreground">with OneTool.</span>
						</h2>
						<p className="mt-4 leading-7 text-muted-foreground">
							{gettingStarted.description} Follow these short guides in order
							and you will go from a fresh account to your first paid invoice.
						</p>
					</div>
					<ol className="space-y-1">
						{gettingStarted.articles.map((article, index) => (
							<li key={article.slug}>
								<Link
									href={`/help/getting-started/${article.slug}`}
									className="group flex items-start gap-4 rounded-xl p-3 transition-colors hover:bg-muted/60"
								>
									<span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-xs font-semibold text-foreground">
										{index + 1}
									</span>
									<span className="min-w-0">
										<span className="block font-medium text-foreground group-hover:text-primary">
											{article.title}
										</span>
										<span className="mt-0.5 block text-sm text-muted-foreground">
											{article.subtitle}
										</span>
									</span>
								</Link>
							</li>
						))}
					</ol>
				</section>
			)}

			{/* Browse by feature */}
			<section className="mt-20">
				<h2 className="text-2xl font-bold tracking-tight text-foreground">
					Browse by feature
				</h2>
				<div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
					{featureCategories.map((category) => (
						<Link
							key={category.slug}
							href={`/help/${category.slug}`}
							className="group rounded-2xl border border-border p-5 transition-colors hover:border-foreground/20 hover:bg-muted/40"
						>
							<span className="flex size-9 items-center justify-center rounded-lg border border-border bg-muted/50">
								<category.icon
									className="size-4 text-foreground/70"
									aria-hidden="true"
								/>
							</span>
							<h3 className="mt-4 font-semibold text-foreground group-hover:text-primary">
								{category.name}
							</h3>
							<p className="mt-1 text-sm leading-6 text-muted-foreground">
								{category.description}
							</p>
						</Link>
					))}
				</div>
			</section>

			{/* Contact escalation */}
			<section className="mt-20 rounded-2xl border border-border bg-muted/30 p-8 text-center">
				<h2 className="text-xl font-semibold text-foreground">
					Can&apos;t find what you need?
				</h2>
				<p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
					Email our team and a real person will get back to you.
				</p>
				<a
					href="mailto:support@onetool.biz"
					className="mt-4 inline-block rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-muted"
				>
					Contact support
				</a>
			</section>
		</div>
	);
}
