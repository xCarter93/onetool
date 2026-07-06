"use client";

import React from "react";
import { Check } from "lucide-react";

type Option = {
	icon: React.ElementType; // pass component directly
	text: string;
	value: string;
};

type SelectServiceProps = {
	options: Option[];
	selected: string;
	onChange: (value: string) => void;
	disabled?: boolean;
};

const SelectService: React.FC<SelectServiceProps> = ({
	options,
	selected,
	onChange,
	disabled = false,
}) => {
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
							name="vehicle"
							value={option.value}
							checked={isChecked}
							disabled={disabled}
							onChange={() => onChange(option.value)}
						/>

						<div
							className={`group relative flex flex-col items-center justify-center p-6 rounded-2xl border transition-all duration-300 ease-in-out transform hover:scale-105 hover:z-10 shadow-lg hover:shadow-xl backdrop-blur-sm
                ${
									isChecked
										? "bg-linear-to-br from-primary/20 to-primary/30 border-primary/60 ring-2 ring-primary/40 shadow-primary/20"
										: "bg-card/80 border-border/60 hover:border-primary/30 hover:bg-card/90"
								}`}
						>
							{/* Selection checkmark */}
							{isChecked && (
								<div className="absolute -top-2 -right-2 w-7 h-7 bg-linear-to-br from-primary to-primary/80 rounded-full flex items-center justify-center shadow-lg ring-2 ring-background animate-fade-in">
									<Check className="w-4 h-4 text-primary-foreground" />
								</div>
							)}

							{/* Icon */}
							<IconComponent
								className={`w-10 h-10 mb-3 transition-all duration-300 ${
									isChecked
										? "text-primary animate-bounce-in"
										: "text-muted-foreground group-hover:text-primary"
								}`}
							/>

							{/* Text */}
							<span
								className={`text-sm font-semibold text-center transition-colors duration-200 tracking-wide ${
									isChecked
										? "text-primary"
										: "text-foreground group-hover:text-primary"
								}`}
							>
								{option.text}
							</span>

							{/* Ripple effect */}
							<div className="absolute inset-0 rounded-2xl overflow-hidden">
								<div className="absolute inset-0 bg-primary/10 rounded-2xl transform scale-0 peer-checked:animate-ripple" />
							</div>
						</div>
					</label>
				);
			})}

			{/*
      tips: move to global/index css for better performance
      
  */}
			<style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes bounceIn {
          0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
          60% { transform: translateY(-3px); }
        }
        @keyframes ripple {
          0% { transform: scale(0); opacity: 0.5; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        .animate-fade-in { animation: fadeIn 0.4s ease-out; }
        .animate-bounce-in { animation: bounceIn 0.6s ease-in-out; }
        .animate-ripple { animation: ripple 0.5s ease-out; }
      `}</style>
		</div>
	);
};

export default SelectService;
