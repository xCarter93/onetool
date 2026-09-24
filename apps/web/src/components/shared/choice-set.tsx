"use client";

import React from "react";
import { Check } from "lucide-react";

type Option = {
	icon: React.ComponentType<{ className?: string }>; // pass component directly
	text: string;
	value: string;
};

type SelectServiceProps = {
	options: Option[];
	selected: string;
	onChange: (value: string) => void;
	disabled?: boolean;
	/** Radio-group name; defaults to a unique id so multiple instances don't collide. */
	name?: string;
};

const SelectService: React.FC<SelectServiceProps> = ({
	options,
	selected,
	onChange,
	disabled = false,
	name,
}) => {
	const generatedName = React.useId();
	const groupName = name ?? generatedName;
	return (
		<div
			className={`flex flex-wrap justify-center gap-6 max-w-lg mx-auto select-none p-2 ${
				disabled ? "opacity-60" : ""
			}`}
		>
			{options.map((option) => {
				const IconComponent = option.icon;
				const isChecked = selected === option.value;

				return (
					<label
						key={option.value}
						className={`relative w-28 sm:w-32 ${
							disabled ? "cursor-not-allowed" : "cursor-pointer"
						}`}
					>
						<input
							type="radio"
							className="sr-only peer"
							name={groupName}
							value={option.value}
							checked={isChecked}
							disabled={disabled}
							onChange={() => onChange(option.value)}
						/>

						<div
						className={`group relative flex flex-col items-center justify-center rounded-lg border bg-card p-6 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring
                ${
									isChecked
										? "border-primary bg-primary/5"
										: "border-border hover:border-primary/40"
								}`}
						>
							{isChecked && (
								<div className="absolute right-2 top-2 flex size-5 items-center justify-center rounded bg-primary text-primary-foreground">
									<Check className="size-3" />
								</div>
							)}

							<IconComponent
								className={`w-10 h-10 mb-3 transition-colors ${
									isChecked
										? "text-primary"
										: "text-muted-foreground group-hover:text-primary"
								}`}
							/>

							<span
								className={`text-[13px] font-semibold text-center transition-colors ${
									isChecked
										? "text-primary"
										: "text-foreground group-hover:text-primary"
								}`}
							>
								{option.text}
							</span>
						</div>
					</label>
				);
			})}

		</div>
	);
};

export default SelectService;
