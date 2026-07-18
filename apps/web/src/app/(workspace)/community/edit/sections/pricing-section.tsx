"use client";

import React from "react";
import { Trash2, Plus, Tags } from "lucide-react";
import type { JSONContent } from "@tiptap/react";

import { Field, FieldLabel } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	PillTabs,
	PillTabsList,
	PillTabsTrigger,
} from "@/components/shared/pill-tabs";
import { CommunityEditor } from "@/components/tiptap/community-editor";
import { SectionShell } from "./section-shell";
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

export const PricingSection = React.memo(function PricingSection({
	pricingMode,
	setPricingMode,
	pricingContent,
	setPricingContent,
	pricingTiers,
	setPricingTiers,
	sectionRef,
}: PricingSectionProps) {
	return (
		<SectionShell
			id="pricing"
			sectionRef={sectionRef}
			icon={Tags}
			title="Pricing"
			description="Choose structured tiers or a rich-text pricing section."
			contentClassName="space-y-6 pb-12"
		>
			<PillTabs
				value={pricingMode}
				onValueChange={(v) =>
					setPricingMode(v as PricingMode)
				}
				className="mb-5 w-auto"
			>
				<PillTabsList>
					<PillTabsTrigger value="structured">
						Structured tiers
					</PillTabsTrigger>
					<PillTabsTrigger value="richText">
						Rich text
					</PillTabsTrigger>
				</PillTabsList>
			</PillTabs>

			{pricingMode === "structured" ? (
				<div className="space-y-4">
					{pricingTiers.map((tier, index) => (
						<div
							key={index}
							className="rounded-xl border border-border/60 overflow-hidden bg-background transition-colors hover:border-border"
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
								<button
									type="button"
									aria-label="Remove tier"
									onClick={() =>
										setPricingTiers((prev) =>
											prev.filter((_, i) => i !== index),
										)
									}
									className="size-8 rounded-lg flex items-center justify-center text-muted-fg cursor-pointer transition-colors hover:bg-danger/10 hover:text-danger"
								>
									<Trash2 className="size-4" />
								</button>
							</div>
							<div className="p-4 space-y-3">
								<div className="grid gap-3 sm:grid-cols-2">
									<Field>
										<FieldLabel htmlFor={`pricing-tier-${index}-name`} className="text-xs uppercase tracking-wider text-muted-fg">Tier Name</FieldLabel>
										<Input
											id={`pricing-tier-${index}-name`}
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
									</Field>
									<Field>
										<FieldLabel htmlFor={`pricing-tier-${index}-price`} className="text-xs uppercase tracking-wider text-muted-fg">Price</FieldLabel>
										<Input
											id={`pricing-tier-${index}-price`}
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
									</Field>
								</div>
								<Field>
									<FieldLabel htmlFor={`pricing-tier-${index}-description`} className="text-xs uppercase tracking-wider text-muted-fg">Description</FieldLabel>
									<Input
										id={`pricing-tier-${index}-description`}
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
								</Field>
							</div>
						</div>
					))}
					<Button
						variant="secondary"
						onClick={() =>
							setPricingTiers((prev) => [
								...prev,
								{ name: "", price: "", description: "" },
							])
						}
					>
						<Plus className="size-4 mr-2" />
						Add Tier
					</Button>
				</div>
			) : (
				<CommunityEditor
					content={pricingContent}
					onChange={setPricingContent}
					placeholder="Describe your pricing options, packages, and custom quotes..."
				/>
			)}
		</SectionShell>
	);
});
