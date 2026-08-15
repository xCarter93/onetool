import { Eyebrow, Lede, Section, SectionHeading } from "../primitives";

/* Switching over — a dashed CSV block under a scanning accent bar, an arrow,
 * and the matched result. Three columns so the read is left-to-right: raw
 * export → AI import → clean records. */

const CSV_ROWS = [
	"customer,addr1,ph,notes",
	"Whitfield Prop,412 Ash..",
	"R. Alvarez,88 Kerr Rd,..",
	"Northgate HOA,1 Nort..",
];

const IMPORTED: { name: string; state: string }[] = [
	{ name: "Whitfield Property Group", state: "Matched" },
	{ name: "R. Alvarez", state: "New" },
	{ name: "Northgate HOA", state: "New" },
];

export function Switching() {
	return (
		<Section
			id="switching"
			pad="tight"
			containerClassName="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] items-center gap-[clamp(28px,4vw,56px)]"
		>
			<div>
				<Eyebrow>Switching over</Eyebrow>
				<SectionHeading size="sm">Bring the list you already have.</SectionHeading>
				<Lede className="mt-[14px] max-w-[30rem]">
					Export a CSV from whatever you&rsquo;re using — or the spreadsheet on the
					office laptop — and OneTool reads it, works out which column is which, and
					matches names to clients you already have.
				</Lede>
			</div>

			<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
				<div className="relative overflow-hidden rounded-[12px] border border-dashed border-(--rule-2) bg-(--paper) p-4 font-mono text-[12px] leading-[1.7] text-(--ink-3)">
					<span
						aria-hidden="true"
						className="absolute inset-x-0 h-[2px] rounded-[2px]"
						style={{
							background:
								"linear-gradient(90deg,transparent,var(--accent),transparent)",
							animation: "lp-scanline 2.6s var(--lp-ease) infinite",
						}}
					/>
					{CSV_ROWS.map((row) => (
						<div key={row} className="truncate">
							{row}
						</div>
					))}
				</div>

				<div
					aria-hidden="true"
					className="flex flex-col items-center gap-[6px] text-(--accent-ink)"
				>
					<span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.1em]">
						AI import
					</span>
					<span
						className="inline-block text-[20px]"
						style={{ animation: "lp-nudge 1.6s var(--lp-ease) infinite" }}
					>
						→
					</span>
				</div>

				<div className="overflow-hidden rounded-[12px] border border-(--rule-2) bg-(--sheet) shadow-(--lp-shadow)">
					{IMPORTED.map((row) => (
						<div
							key={row.name}
							className="flex items-center justify-between gap-[10px] border-b border-(--rule) px-[14px] py-[11px]"
						>
							<span className="min-w-0 truncate text-[13.5px] font-medium tracking-[-0.01em]">
								{row.name}
							</span>
							<span className="whitespace-nowrap text-[11px] font-semibold text-(--paid)">
								{row.state}
							</span>
						</div>
					))}
					<div className="px-[14px] py-[10px] text-[12px] text-(--ink-3)">
						3 of 214 shown
					</div>
				</div>
			</div>
		</Section>
	);
}
