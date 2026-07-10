"use client";

import React, { useCallback, useState } from "react";
import { Upload, FileText, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle } from "@/components/reui/alert";

interface CsvUploadZoneProps {
	onFileSelect: (file: File, content: string) => void;
	maxSizeMB?: number;
	disabled?: boolean;
}

export function CsvUploadZone({
	onFileSelect,
	maxSizeMB = 5,
	disabled = false,
}: CsvUploadZoneProps) {
	const [isDragging, setIsDragging] = useState(false);
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [error, setError] = useState<string | null>(null);

	const handleFileRead = useCallback(
		(file: File) => {
			// Validate file type
			if (!file.name.endsWith(".csv")) {
				setError("Please upload a CSV file");
				return;
			}

			// Validate file size
			const maxSize = maxSizeMB * 1024 * 1024;
			if (file.size > maxSize) {
				setError(`File size exceeds ${maxSizeMB}MB limit`);
				return;
			}

			// Read file content
			const reader = new FileReader();
			reader.onload = (e) => {
				const content = e.target?.result as string;
				setSelectedFile(file);
				setError(null);
				onFileSelect(file, content);
			};
			reader.onerror = () => {
				setError("Failed to read file");
			};
			reader.readAsText(file);
		},
		[maxSizeMB, onFileSelect]
	);

	const handleDrop = useCallback(
		(e: React.DragEvent<HTMLDivElement>) => {
			e.preventDefault();
			e.stopPropagation();
			setIsDragging(false);

			if (disabled) return;

			const files = Array.from(e.dataTransfer.files);
			if (files.length > 0) {
				handleFileRead(files[0]);
			}
		},
		[disabled, handleFileRead]
	);

	const handleDragOver = useCallback(
		(e: React.DragEvent<HTMLDivElement>) => {
			e.preventDefault();
			e.stopPropagation();
			if (!disabled) {
				setIsDragging(true);
			}
		},
		[disabled]
	);

	const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(false);
	}, []);

	const handleFileInput = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			if (disabled) return;

			const files = e.target.files;
			if (files && files.length > 0) {
				handleFileRead(files[0]);
			}
		},
		[disabled, handleFileRead]
	);

	const handleClear = useCallback(() => {
		setSelectedFile(null);
		setError(null);
	}, []);

	return (
		<div className="space-y-4">
			<div
				onDrop={handleDrop}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				className={`
					relative rounded-lg border-2 border-dashed p-8 text-center transition-all
					${isDragging ? "border-primary bg-primary/5 scale-[1.02]" : "border-border"}
					${selectedFile ? "bg-muted/30" : "hover:border-primary/50 hover:bg-muted/20"}
				`}
				aria-disabled={disabled}
			>
				<input
					type="file"
					accept=".csv"
					onChange={handleFileInput}
					className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
					id="csv-upload"
					disabled={disabled}
					tabIndex={disabled ? -1 : 0}
					aria-disabled={disabled}
				/>

				{!selectedFile ? (
					<div className="flex flex-col items-center gap-3">
						<div className="rounded-full bg-primary/10 p-4">
							<Upload className="w-8 h-8 text-primary" />
						</div>
						<div>
							<p className="text-sm font-medium text-foreground">
								Drop your CSV file here, or{" "}
								<span className="text-primary">browse</span>
							</p>
							<p className="text-xs text-muted-foreground mt-1">
								Maximum file size: {maxSizeMB}MB
							</p>
						</div>
					</div>
				) : (
					<div className="flex items-center justify-center gap-3">
						<FileText className="w-6 h-6 text-primary" />
						<div className="flex-1 text-left">
							<p className="text-sm font-medium text-foreground">
								{selectedFile.name}
							</p>
							<p className="text-xs text-muted-foreground">
								{(selectedFile.size / 1024).toFixed(2)} KB
							</p>
						</div>
						<Button
							variant="outline"
							size="sm"
							onClick={(e) => {
								e.preventDefault();
								handleClear();
							}}
							className="hover:bg-destructive/10 hover:text-destructive"
							disabled={disabled}
						>
							<X className="w-4 h-4" />
						</Button>
					</div>
				)}
			</div>

			{error && (
				<Alert variant="destructive">
					<AlertCircle />
					<AlertTitle>{error}</AlertTitle>
				</Alert>
			)}
		</div>
	);
}
