"use client";

import { useId, useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
	Combobox,
	ComboboxChip,
	ComboboxChips,
	ComboboxChipsInput,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxItem,
	ComboboxList,
	useComboboxAnchor,
} from "@/components/ui/combobox";

export interface RecipientsValue {
	to: string[];
	cc: string[];
	bcc: string[];
}

export interface RecipientSuggestion {
	email: string;
	name?: string;
}

export interface EmailRecipientsFieldProps {
	value: RecipientsValue;
	onChange: (next: RecipientsValue) => void;
	/** Client contacts offered in every row's dropdown. */
	suggestions?: RecipientSuggestion[];
	/** Template mode: `to` may only hold addresses from `suggestions`. */
	toLocked?: boolean;
	disabled?: boolean;
	className?: string;
}

function isEmailish(value: string): boolean {
	return /^[^\s@]+@[^\s@]+$/.test(value);
}

/**
 * To/Cc/Bcc rows for the shared composer. Cc and Bcc stay collapsed until the
 * user asks for them, or until the parent supplies addresses for either.
 */
export function EmailRecipientsField({
	value,
	onChange,
	suggestions = [],
	toLocked = false,
	disabled = false,
	className,
}: EmailRecipientsFieldProps) {
	const [expanded, setExpanded] = useState(false);
	const showExtraRows =
		expanded || value.cc.length > 0 || value.bcc.length > 0;

	return (
		<div
			className={cn(
				"divide-y divide-border rounded-lg border border-border bg-background",
				disabled && "opacity-70",
				className
			)}
		>
			<RecipientRow
				label="To"
				placeholder={toLocked ? "Choose a contact" : "Add a recipient"}
				values={value.to}
				onValuesChange={(to) => onChange({ ...value, to })}
				suggestions={suggestions}
				allowFreeform={!toLocked}
				disabled={disabled}
				trailing={
					showExtraRows ? null : (
						<Button
							type="button"
							variant="link"
							size="sm"
							className="h-auto shrink-0 p-0 text-xs"
							onClick={() => setExpanded(true)}
							disabled={disabled}
						>
							Add CC/BCC
						</Button>
					)
				}
			/>

			{showExtraRows && (
				<>
					<RecipientRow
						label="Cc"
						placeholder="Add a copied recipient"
						values={value.cc}
						onValuesChange={(cc) => onChange({ ...value, cc })}
						suggestions={suggestions}
						allowFreeform
						disabled={disabled}
					/>
					<RecipientRow
						label="Bcc"
						placeholder="Add a blind copied recipient"
						values={value.bcc}
						onValuesChange={(bcc) => onChange({ ...value, bcc })}
						suggestions={suggestions}
						allowFreeform
						disabled={disabled}
					/>
				</>
			)}
		</div>
	);
}

interface RecipientRowProps {
	label: string;
	placeholder: string;
	values: string[];
	onValuesChange: (next: string[]) => void;
	suggestions: RecipientSuggestion[];
	allowFreeform: boolean;
	disabled: boolean;
	trailing?: React.ReactNode;
}

function RecipientRow({
	label,
	placeholder,
	values,
	onValuesChange,
	suggestions,
	allowFreeform,
	disabled,
	trailing,
}: RecipientRowProps) {
	const inputId = useId();
	const anchorRef = useComboboxAnchor();
	const [query, setQuery] = useState("");

	const taken = useMemo(
		() => new Set(values.map((email) => email.toLowerCase())),
		[values]
	);

	const matches = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return suggestions.filter((suggestion) => {
			if (taken.has(suggestion.email.toLowerCase())) return false;
			if (!needle) return true;
			return (
				suggestion.email.toLowerCase().includes(needle) ||
				(suggestion.name?.toLowerCase().includes(needle) ?? false)
			);
		});
	}, [suggestions, query, taken]);

	const typed = query.trim();
	const canCreate =
		allowFreeform &&
		isEmailish(typed) &&
		!taken.has(typed.toLowerCase()) &&
		!matches.some((m) => m.email.toLowerCase() === typed.toLowerCase());

	// The freeform address rides in the option list so Enter and click take the
	// same path through Base UI's selection handling.
	const options = useMemo(
		() => [...matches.map((m) => m.email), ...(canCreate ? [typed] : [])],
		[matches, canCreate, typed]
	);

	const labelFor = (email: string) =>
		suggestions.find((s) => s.email.toLowerCase() === email.toLowerCase())
			?.name ?? email;

	return (
		<Combobox
			multiple
			items={options}
			filter={null}
			value={values}
			onValueChange={(next: string[]) => onValuesChange(next)}
			inputValue={query}
			onInputValueChange={setQuery}
			disabled={disabled}
			openOnInputClick
			// Enter takes the highlighted option, so a typed address only lands
			// if the first option is highlighted while filtering.
			autoHighlight
		>
			<div className="flex items-start gap-3 px-3 py-2">
				<label
					htmlFor={inputId}
					className="w-9 shrink-0 pt-1.5 text-xs font-medium text-muted-foreground"
				>
					{label}
				</label>
				<ComboboxChips
					ref={anchorRef}
					className="min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 py-0 focus-within:border-transparent focus-within:ring-0 dark:bg-transparent"
				>
					{values.map((email) => (
						<ComboboxChip key={email} title={email}>
							<span className="max-w-40 truncate">{labelFor(email)}</span>
						</ComboboxChip>
					))}
					<ComboboxChipsInput
						id={inputId}
						placeholder={values.length === 0 ? placeholder : undefined}
						className="h-6 bg-transparent text-sm placeholder:text-muted-foreground"
					/>
				</ComboboxChips>
				{trailing}
			</div>

			<ComboboxContent anchor={anchorRef} className="p-0">
				<ComboboxEmpty>
					{allowFreeform && typed
						? "Enter a full email address."
						: "No matching contacts."}
				</ComboboxEmpty>
				<ComboboxList>
					{options.map((email) => {
						const suggestion = suggestions.find(
							(s) => s.email.toLowerCase() === email.toLowerCase()
						);
						return (
							<ComboboxItem key={email} value={email}>
								{suggestion ? (
									<span className="flex min-w-0 flex-col">
										<span className="truncate font-medium">
											{suggestion.name ?? suggestion.email}
										</span>
										{suggestion.name && (
											<span className="truncate text-xs text-muted-foreground">
												{suggestion.email}
											</span>
										)}
									</span>
								) : (
									<span className="truncate">Add {email}</span>
								)}
							</ComboboxItem>
						);
					})}
				</ComboboxList>
			</ComboboxContent>
		</Combobox>
	);
}
