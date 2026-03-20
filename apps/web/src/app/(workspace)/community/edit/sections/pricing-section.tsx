"use client";

import { Trash2, Plus } from "lucide-react";
import type { JSONContent } from "@tiptap/react";

import { Label } from "@/components/ui/label";
import { StyledButton } from "@/components/ui/styled/styled-button";
import { StyledInput } from "@/components/ui/styled/styled-input";
import {
	StyledTabs,
	StyledTabsList,
	StyledTabsTrigger,
} from "@/components/ui/styled/styled-tabs";
import { CommunityEditor } from "@/components/tiptap/community-editor";
import type { PricingMode, PricingTier } from "../use-community-page-form";

interface PricingSectionProps {
	pricingMode: PricingMode;
	setPricingMode: (mode: PricingMode) => void;
	pricingContent: JSONContent | undefined;
	setPricingContent: (content: JSONContent | undefined) => void;
	pricingTiers: PricingTier[];
	setPricingTiers: React.Dispatch<React.SetStateAction<PricingTier[]>>;
	sectionRef: (el: HTMLElement | null) => void;
}

export function PricingSection({
	pricingMode,
	setPricingMode,
	pricingContent,
	setPricingContent,
	pricingTiers,
	setPricingTiers,
	sectionRef,
}: PricingSectionProps) {
	return (
		<section
			id="pricing"
			ref={sectionRef}
			className="scroll-mt-44 pb-12"
		>
			<div className="mb-4">
				<h2 className="text-lg font-semibold text-fg">Pricing</h2>
				<p className="text-sm text-muted-fg">
					Choose structured tiers or a rich-text pricing section.
				</p>
			</div>
			<StyledTabs
				value={pricingMode}
				onValueChange={(v) =>
					setPricingMode(v as PricingMode)
				}
				className="mb-5 w-auto"
			>
				<StyledTabsList>
					<StyledTabsTrigger value="structured">
						Structured tiers
					</StyledTabsTrigger>
					<StyledTabsTrigger value="richText">
						Rich text
					</StyledTabsTrigger>
				</StyledTabsList>
			</StyledTabs>

			{pricingMode === "structured" ? (
				<div className="space-y-4">
					{pricingTiers.map((tier, index) => (
						<div
							key={index}
							className="rounded-xl border border-border/60 overflow-hidden bg-bg"
						>
							<div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b border-border/40">
								<div className="flex items-center gap-3">
									<span className="size-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
										{index + 1}
									</span>
									<span className="text-sm font-medium text-fg truncate max-w-[200px]">
										{tier.name || "Untitled Tier"}
									</span>
								</div>
								<StyledButton
									intent="destructive"
									size="sm"
									onClick={() =>
										setPricingTiers((prev) =>
											prev.filter((_, i) => i !== index),
										)
									}
								>
									<Trash2 className="size-3.5 mr-1.5" />
									Remove
								</StyledButton>
							</div>
							<div className="p-4 space-y-3">
								<div className="grid gap-3 sm:grid-cols-2">
									<div className="space-y-2">
										<Label className="text-xs uppercase tracking-wider text-muted-fg">Tier Name</Label>
										<StyledInput
											value={tier.name}
											onChange={(e) =>
												setPricingTiers((prev) =>
													prev.map((item, i) =>
														i === index
															? { ...item, name: e.target.value }
															: item,
													),
												)
											}
											placeholder="e.g. Starter Package"
										/>
									</div>
									<div className="space-y-2">
										<Label className="text-xs uppercase tracking-wider text-muted-fg">Price</Label>
										<StyledInput
											value={tier.price}
											onChange={(e) =>
												setPricingTiers((prev) =>
													prev.map((item, i) =>
														i === index
															? { ...item, price: e.target.value }
															: item,
													),
												)
											}
											placeholder="$199 / month"
										/>
									</div>
								</div>
								<div className="space-y-2">
									<Label className="text-xs uppercase tracking-wider text-muted-fg">Description</Label>
									<StyledInput
										value={tier.description}
										onChange={(e) =>
											setPricingTiers((prev) =>
												prev.map((item, i) =>
													i === index
														? { ...item, description: e.target.value }
														: item,
												),
											)
										}
										placeholder="Brief description of what's included"
									/>
								</div>
							</div>
						</div>
					))}
					<StyledButton
						intent="secondary"
						onClick={() =>
							setPricingTiers((prev) => [
								...prev,
								{ name: "", price: "", description: "" },
							])
						}
					>
						<Plus className="size-4 mr-2" />
						Add Tier
					</StyledButton>
				</div>
			) : (
				<CommunityEditor
					content={pricingContent}
					onChange={setPricingContent}
					placeholder="Describe your pricing options, packages, and custom quotes..."
				/>
			)}
		</section>
	);
}
