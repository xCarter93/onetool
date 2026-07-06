"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { DotField } from "@/components/ui/dot-field";
import {
	Frame,
	FramePanel,
	FrameHeader,
	FrameTitle,
	FrameDescription,
	FrameFooter,
} from "@/components/reui/frame";

interface SettingsSectionProps {
	title?: React.ReactNode;
	description?: React.ReactNode;
	/** Rendered on the right side of the header (e.g. a status badge). */
	headerAside?: React.ReactNode;
	/** Footer content, typically a Save button + a hint. Omit for no footer. */
	footer?: React.ReactNode;
	/** Paint a subtle dot-field texture behind the header (top-level sections). */
	texture?: boolean;
	className?: string;
	panelClassName?: string;
	footerClassName?: string;
	children: React.ReactNode;
}

// A whisper of texture: dense near the top-right corner, masked away before it
// reaches the title so headings stay clean in both themes.
const HEADER_TEXTURE_CLASS =
	"text-muted-foreground opacity-[0.55] [mask-image:radial-gradient(70%_140%_at_100%_-10%,black,transparent_70%)] [-webkit-mask-image:radial-gradient(70%_140%_at_100%_-10%,black,transparent_70%)]";

/**
 * The shared framed shell for a settings section: a ReUI Frame with an optional
 * header (title + description + aside), a card panel, and an optional footer for
 * actions. Mirrors the Frame chrome used on the list pages so the profile tabs
 * read as one system.
 */
export function SettingsSection({
	title,
	description,
	headerAside,
	footer,
	texture = false,
	className,
	panelClassName,
	footerClassName,
	children,
}: SettingsSectionProps) {
	const hasHeader = Boolean(title || description || headerAside);

	return (
		<Frame spacing="lg" className={className}>
			{hasHeader && (
				<FrameHeader
					className={cn(
						"relative",
						texture && "overflow-hidden",
						headerAside && "flex-row items-start justify-between gap-4",
					)}
				>
					{texture && <DotField className={HEADER_TEXTURE_CLASS} />}
					<div className="relative flex flex-col gap-1">
						{title && <FrameTitle className="text-base">{title}</FrameTitle>}
						{description && <FrameDescription>{description}</FrameDescription>}
					</div>
					{headerAside && <div className="relative">{headerAside}</div>}
				</FrameHeader>
			)}
			<FramePanel className={panelClassName}>{children}</FramePanel>
			{footer && (
				<FrameFooter
					className={cn(
						"flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
						footerClassName,
					)}
				>
					{footer}
				</FrameFooter>
			)}
		</Frame>
	);
}
