import { ArrowRight } from "lucide-react";
import { CHAPTERS } from "../features";
import { Halftone } from "../halftone";
import { Container } from "../primitives";

// One row per story chapter, in chapter order.
const PLACES = [
	["Clipboard", "The quote, written in the driveway and typed up after dinner."],
	["Group text", "Tomorrow’s schedule, buried under yesterday’s photos."],
	["Truck dash", "The checks, waiting for a trip to the bank."],
	["Spreadsheet", "Who still owes you, as of the last time anyone updated it."],
] as const;

export function OldWay() {
	return (
		<section id="old-way" className="lp-old-way" aria-labelledby="old-way-title">
			<div className="lp-old-way-art">
				<Halftone scene="old-way" reveal className="lp-old-way-backdrop" />
			</div>
			<Container className="lp-old-way-inner">
				<h2 id="old-way-title" className="lp-h2-sm text-(--ink)">
					One job, four places to look.
				</h2>
				<dl className="lp-old-way-list mt-8 text-base leading-relaxed">
					{PLACES.map(([place, what], index) => (
						<div key={place}>
							<dt className="font-semibold text-(--ink)">{place}</dt>
							<dd className="text-(--ink-2)">
								{what}{" "}
								<a href={`#${CHAPTERS[index].id}`} className="lp-old-way-link">
									{CHAPTERS[index].label}
									<ArrowRight aria-hidden="true" className="size-3.5" />
								</a>
							</dd>
						</div>
					))}
				</dl>
				<p className="lp-lede mt-8">
					OneTool keeps the quote, the visits and the payment together on the client’s record.
				</p>
			</Container>
		</section>
	);
}
