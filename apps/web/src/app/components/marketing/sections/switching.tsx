import { LazyBentoCell } from "../bento/lazy-bento-cell";
import { Lede, Section, SectionHeading } from "../primitives";

export function Switching() {
	return (
		<Section id="switching" pad="tight">
			<SectionHeading size="sm" className="mt-0">
				Bring what you already have.
			</SectionHeading>
			<Lede className="max-w-[52ch]">
				Import your client list from a spreadsheet, then sync clients, invoices and payments to QuickBooks.
			</Lede>
			<div className="mt-[clamp(28px,3.5vw,48px)] grid grid-cols-1 gap-4 md:grid-cols-2">
				<LazyBentoCell cell="import" />
				<LazyBentoCell cell="sync" />
			</div>
		</Section>
	);
}
