"use client";

import { cn } from "@/lib/utils";
import React, { useState, useRef, useEffect } from "react";

type TagsInputSize = "default" | "sm";

interface StyledTagsInputProps {
	tags: string[];
	setTags: React.Dispatch<React.SetStateAction<string[]>>;
	onTagAdded?: (tag: string) => void;
	onTagRemoved?: (tag: string) => void;
	editTag?: boolean;
	className?: string;
	placeholder?: string;
	disabled?: boolean;
	size?: TagsInputSize;
}

export const StyledTagsInput: React.FC<StyledTagsInputProps> = ({
	tags,
	setTags,
	onTagAdded,
	onTagRemoved,
	editTag = true,
	className,
	placeholder = "Add a tag...",
	disabled = false,
	size = "default",
}) => {
	const isCompact = size === "sm";
	const [input, setInput] = useState("");
	const [editingIndex, setEditingIndex] = useState<number | null>(null);
	const editInputRef = useRef<HTMLInputElement>(null);

	const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
		const trimmedInput = input.trim();

		if ((e.key === "Enter" || e.key === ",") && trimmedInput) {
			e.preventDefault();
			if (editingIndex !== null) {
				const updatedTags = [...tags];
				const oldTag = tags[editingIndex];
				updatedTags[editingIndex] = trimmedInput;
				setTags(updatedTags);
				setEditingIndex(null);
				if (oldTag !== trimmedInput) {
					onTagAdded?.(trimmedInput);
				}
			} else if (!tags.includes(trimmedInput)) {
				setTags([...tags, trimmedInput]);
				onTagAdded?.(trimmedInput);
			}
			setInput("");
		}
	};

	const handleRemoveTag = (tag: string) => {
		setTags(tags.filter((t) => t !== tag));
		if (editingIndex !== null) {
			setEditingIndex(null);
		}
		onTagRemoved?.(tag);
	};

	const handleEditTag = (index: number) => {
		if (editTag && !disabled) {
			setInput(tags[index]);
			setEditingIndex(index);
			setTimeout(() => editInputRef.current?.focus(), 0);
		}
	};

	const handleBlur = () => {
		if (editingIndex !== null) {
			const updatedTags = [...tags];
			const trimmedInput = input.trim();
			if (trimmedInput) {
				updatedTags[editingIndex] = trimmedInput;
			} else {
				updatedTags.splice(editingIndex, 1);
			}
			setTags(updatedTags);
			setEditingIndex(null);
		}
		setInput("");
	};

	useEffect(() => {
		if (editInputRef.current) {
			editInputRef.current.style.width = `${input.length + 1}ch`;
		}
	}, [input]);

	return (
		<div
			className={cn(
				"flex flex-wrap w-full items-center border transition-colors",
				"bg-white dark:bg-gray-900/50",
				"border-gray-200 dark:border-white/10",
				!disabled && "focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20",
				isCompact ? "gap-1.5 p-2 rounded-md" : "gap-2 p-3 rounded-lg",
				className
			)}
		>
			{tags.map((tag, index) => (
				<div key={`${tag}-${index}`} className="relative">
					{editTag && editingIndex === index ? (
						<input
							ref={editInputRef}
							type="text"
							value={input}
							onChange={(e) => setInput(e.target.value)}
							onKeyDown={handleAddTag}
							onBlur={handleBlur}
							className={cn(
								"rounded-md border outline-none transition-colors",
								"bg-gray-50 dark:bg-gray-800",
								"border-gray-300 dark:border-gray-600",
								"focus:border-primary focus:ring-1 focus:ring-primary/20",
								isCompact ? "px-2 py-0.5 text-xs" : "px-3 py-1.5 text-sm"
							)}
							placeholder="Edit tag..."
							style={{ width: `${Math.max(input.length + 1, 8)}ch` }}
							autoFocus
							disabled={disabled}
						/>
					) : (
						<div
							onClick={() => !disabled && handleEditTag(index)}
							className={cn(
								"flex items-center font-medium rounded-md transition-all",
								"bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-foreground",
								"border border-primary/20 dark:border-primary/30",
								isCompact ? "gap-1 px-2 py-0.5 text-xs" : "gap-1.5 px-3 py-1.5 text-sm",
								!disabled
									? "cursor-pointer hover:bg-primary/20 dark:hover:bg-primary/30 hover:border-primary/30"
									: "cursor-default"
							)}
						>
							{tag}
							{!disabled && (
								<button
									onClick={(e) => {
										e.stopPropagation();
										handleRemoveTag(tag);
									}}
									className={cn(
										"text-primary/70 hover:text-primary dark:text-primary-foreground/70 dark:hover:text-primary-foreground",
										"focus:outline-none transition-colors leading-none hover:scale-110",
										isCompact ? "ml-0 -mr-0.5 text-sm" : "ml-0.5 -mr-1 text-lg"
									)}
									aria-label="Remove tag"
								>
									×
								</button>
							)}
						</div>
					)}
				</div>
			))}
			{!disabled && (
				<input
					type="text"
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={handleAddTag}
					className={cn(
						"flex-grow border-none outline-none",
						"bg-transparent",
						"placeholder:text-gray-500 dark:placeholder:text-gray-400",
						isCompact ? "min-w-[80px] px-1 py-0.5 text-xs" : "min-w-[120px] px-2 py-1 text-sm",
						editingIndex !== null ? "opacity-0" : "opacity-100"
					)}
					placeholder={placeholder}
				/>
			)}
		</div>
	);
};

