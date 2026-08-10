import { Fragment } from "react";
import type { CommunitySectionId } from "@/lib/community-sections";
import { CommunityPageContent } from "@/components/tiptap/community-editor";
import { EmptySectionHint } from "../components/empty-section-hint";
import type { CommunityPageViewData } from "../community-page-view";

/**
 * Everything the three layouts share. The renderer resolves it once — section
 * order, which sections actually have content, the rendered nodes themselves —
 * and each layout decides only where those pieces sit on the page.
 */
export interface LayoutBodyProps {
	data: CommunityPageViewData;
	onEditSection?: (sectionId: CommunitySectionId) => void;
	/** Section id → rendered node. Built once by the renderer. */
	sectionNodes: Record<CommunitySectionId, React.ReactNode>;
	/** Visible sections in the owner's order, including the empty ones. */
	orderedSections: CommunitySectionId[];
	/** The subset of `orderedSections` that has something in it. */
	renderedSections: CommunitySectionId[];
	sectionHasContent: Record<CommunitySectionId, boolean>;
	/** False when the page predates the sectioned editor and carries one blob. */
	hasSectionedContent: boolean;
	heroPhotos: Array<{ storageId: string; url: string }>;
	serviceArea?: string;
	/** The quote form, or the preview placeholder that stands in for it. */
	contactForm: React.ReactNode;
}

/**
 * The stack of content sections, in the owner's order.
 *
 * `exclude` is how a layout takes a section out of the flow to render it
 * somewhere structural instead — Storefront hoists pricing above the fold,
 * Directory pulls services into its listing grid. The section is still governed
 * by the owner's visibility switch; the layout only moves it.
 */
export function SectionStack({
	data,
	onEditSection,
	sectionNodes,
	orderedSections,
	renderedSections,
	sectionHasContent,
	hasSectionedContent,
	exclude = [],
	className = "space-y-14",
}: Pick<
	LayoutBodyProps,
	| "data"
	| "onEditSection"
	| "sectionNodes"
	| "orderedSections"
	| "renderedSections"
	| "sectionHasContent"
	| "hasSectionedContent"
> & { exclude?: CommunitySectionId[]; className?: string }) {
	const keep = (id: CommunitySectionId) => !exclude.includes(id);

	if (onEditSection) {
		return (
			<div className={className}>
				{orderedSections.filter(keep).map((id) => (
					<Fragment key={id}>
						{sectionHasContent[id] ? (
							sectionNodes[id]
						) : (
							<EmptySectionHint sectionId={id} onEdit={onEditSection} />
						)}
					</Fragment>
				))}
			</div>
		);
	}

	if (hasSectionedContent) {
		return (
			<div className={className}>
				{renderedSections.filter(keep).map((id) => (
					<Fragment key={id}>{sectionNodes[id]}</Fragment>
				))}
			</div>
		);
	}

	if (data.content) {
		return (
			<div className={className}>
				<div className="max-w-[68ch] text-foreground">
					<CommunityPageContent content={data.content} />
				</div>
			</div>
		);
	}

	return null;
}
