/* eslint-disable react/no-children-prop */
"use client";

import React from "react";
import { Button } from "./button";

interface CalendarWidgetProps {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	form: any;
	calendarDate: Date;
	handleCalendarNavigation: (direction: "prev" | "next") => void;
	handleDateClick: (day: number | null) => void;
	formatDisplayDate?: (date?: Date | number) => string;
	// Optional props for additional dates (like dueDate in detail page)
	showDueDate?: boolean;
	variant?: "default" | "detailed"; // "detailed" for project detail page with enhanced styling
}

const getCalendarDays = (date: Date) => {
	const year = date.getFullYear();
	const month = date.getMonth();

	const firstDay = new Date(year, month, 1);
	const lastDay = new Date(year, month + 1, 0);
	const startingDayOfWeek = firstDay.getDay();
	const daysInMonth = lastDay.getDate();

	const calendarDays: Array<number | null> = [];

	for (let i = 0; i < startingDayOfWeek; i++) {
		calendarDays.push(null);
	}

	for (let day = 1; day <= daysInMonth; day++) {
		calendarDays.push(day);
	}

	while (calendarDays.length < 42) {
		calendarDays.push(null);
	}

	return calendarDays;
};

const defaultFormatDisplayDate = (date?: Date | number) => {
	if (!date) return "Not set";
	const dateObj = typeof date === "number" ? new Date(date) : date;
	return dateObj.toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
};

export function CalendarWidget({
	form,
	calendarDate,
	handleCalendarNavigation,
	handleDateClick,
	formatDisplayDate = defaultFormatDisplayDate,
	showDueDate = false,
	variant = "default",
}: CalendarWidgetProps) {
	return (
		<form.Field
			name="startDate"
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			children={(startField: any) => (
				<form.Field
					name="endDate"
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					children={(endField: any) => {
						const startDateValue = startField.state.value;
						const endDateValue = endField.state.value;

						// Get dueDate if needed
						let dueDateValue: Date | number | undefined;
						if (showDueDate) {
							const dueDateField = form.getFieldValue("dueDate");
							dueDateValue = dueDateField as Date | number | undefined;
						}

						const isDetailed = variant === "detailed";

						return (
							<div
								className={
									isDetailed
										? "relative overflow-hidden rounded-2xl p-6 shadow-sm border border-gray-200/60 dark:border-white/10 bg-white/80 dark:bg-white/[0.03] backdrop-blur supports-[backdrop-filter]:bg-white/60 ring-1 ring-black/5 dark:ring-white/10"
										: "bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/10 rounded-xl p-6 shadow-sm"
								}
							>
								{isDetailed && (
									<>
										<div className="pointer-events-none absolute -top-24 -right-24 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
										<div className="pointer-events-none absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl" />
									</>
								)}
								<div className="flex items-center justify-between mb-6">
									<h3 className="text-lg font-semibold text-gray-900 dark:text-white">
										{calendarDate.toLocaleDateString("en-US", {
											month: "long",
											year: "numeric",
										})}
									</h3>
									<div
										className={
											isDetailed
												? "flex gap-2 rounded-lg bg-gray-50/80 dark:bg-white/5 p-1 ring-1 ring-inset ring-gray-200/70 dark:ring-white/10 shadow-sm"
												: "flex gap-2"
										}
									>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={(e) => {
												e.preventDefault();
												e.stopPropagation();
												handleCalendarNavigation("prev");
											}}
										>
											<svg
												className="w-4 h-4 mr-1"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth="2"
													d="M15 19l-7-7 7-7"
												/>
											</svg>
										</Button>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={(e) => {
												e.preventDefault();
												e.stopPropagation();
												handleCalendarNavigation("next");
											}}
										>
											<svg
												className="w-4 h-4 ml-1"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth="2"
													d="M9 5l7 7-7 7"
												/>
											</svg>
										</Button>
									</div>
								</div>

								<div
									className={
										isDetailed
											? "grid grid-cols-7 gap-1.5"
											: "grid grid-cols-7 gap-1"
									}
								>
									{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
										(day) => (
											<div
												key={day}
												className={
													isDetailed
														? "text-center text-[11px] uppercase tracking-wide font-medium text-gray-500 dark:text-gray-400 py-3 border-b border-gray-100/80 dark:border-white/5"
														: "text-center text-xs font-medium text-gray-500 dark:text-gray-400 py-3 border-b border-gray-100 dark:border-white/5"
												}
											>
												{day}
											</div>
										)
									)}

									{getCalendarDays(calendarDate).map((day, index) => {
										const isCurrentMonth = day !== null;
										const today = new Date();
										const isToday =
											isCurrentMonth &&
											day === today.getDate() &&
											calendarDate.getMonth() === today.getMonth() &&
											calendarDate.getFullYear() === today.getFullYear();

										let isStart = false;
										let isEnd = false;
										let isDue = false;
										let isInRange = false;
										let isDisabled = false;

										// Create current day date for comparison
										const currentDayDate = day
											? new Date(
													calendarDate.getFullYear(),
													calendarDate.getMonth(),
													day
												)
											: null;
										if (currentDayDate) {
											currentDayDate.setHours(0, 0, 0, 0);
										}

										if (day && startDateValue) {
											const start =
												typeof startDateValue === "number"
													? new Date(startDateValue)
													: new Date(startDateValue.getTime());
											start.setHours(0, 0, 0, 0);

											isStart = currentDayDate?.getTime() === start.getTime();

											// Disable dates before start date when selecting end date
											if (!endDateValue && currentDayDate) {
												isDisabled = currentDayDate < start;
											}

											// Check if day is in range between start and end
											if (endDateValue && !isStart && currentDayDate) {
												const end =
													typeof endDateValue === "number"
														? new Date(endDateValue)
														: new Date(endDateValue.getTime());
												end.setHours(0, 0, 0, 0);

												isInRange =
													currentDayDate > start && currentDayDate < end;
											}
										}

										if (day && endDateValue && currentDayDate) {
											const end =
												typeof endDateValue === "number"
													? new Date(endDateValue)
													: new Date(endDateValue.getTime());
											end.setHours(0, 0, 0, 0);

											isEnd = currentDayDate.getTime() === end.getTime();
										}

										if (day && showDueDate && dueDateValue && currentDayDate) {
											const due =
												typeof dueDateValue === "number"
													? new Date(dueDateValue)
													: new Date(dueDateValue.getTime());
											due.setHours(0, 0, 0, 0);

											isDue = currentDayDate.getTime() === due.getTime();
										}

										const hasEvent = isStart || isEnd || isDue;

										if (isDetailed) {
											// Detailed variant for project detail page
											return (
												<div
													key={index}
													onClick={(e) => {
														if (!isDisabled && day) {
															e.preventDefault();
															e.stopPropagation();
															handleDateClick(day);
														}
													}}
													className={`
													relative h-11 flex items-center justify-center text-sm transition-colors duration-200 rounded-lg
													${isCurrentMonth && !isDisabled ? "cursor-pointer" : "cursor-default"}
													${
														isCurrentMonth
															? "text-gray-900 dark:text-white"
															: "text-gray-300 dark:text-gray-600"
													}
													${
														isCurrentMonth &&
														!isDisabled &&
														!hasEvent &&
														!isInRange
															? "hover:bg-primary/10 ring-1 ring-inset ring-primary/20 dark:hover:bg-primary/15"
															: ""
													}
													${hasEvent ? "bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/40 font-medium" : ""}
													${isInRange ? "bg-blue-100 dark:bg-blue-900/50 text-blue-900 dark:text-blue-100 font-medium" : ""}
													${
														isToday && !hasEvent && !isInRange
															? "ring-1 ring-amber-500/60 text-amber-600 dark:text-amber-300 bg-amber-500/10"
															: ""
													}
												`}
													title={
														isDisabled
															? "Cannot select date before start date"
															: isStart
																? "Project Start"
																: isEnd
																	? "Project End"
																	: isDue
																		? "Due Date"
																		: isCurrentMonth
																			? "Click to set date"
																			: ""
													}
												>
													{day || ""}
													{hasEvent && (
														<div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-6 h-1 rounded-full bg-white/70 dark:bg-white/80" />
													)}
												</div>
											);
										} else {
											// Default variant for onboarding form
											return (
												<div
													key={index}
													onClick={(e) => {
														if (!isDisabled && day) {
															e.preventDefault();
															e.stopPropagation();
															handleDateClick(day);
														}
													}}
													className={`relative h-10 flex items-center justify-center text-sm transition-all duration-200 ${
														isCurrentMonth
															? isDisabled
																? "text-gray-300 dark:text-gray-700 cursor-not-allowed opacity-50"
																: isStart
																	? "bg-blue-600 text-white rounded-l-lg shadow-md hover:bg-blue-700 font-bold cursor-pointer"
																	: isEnd
																		? "bg-blue-600 text-white rounded-r-lg shadow-md hover:bg-blue-700 font-bold cursor-pointer"
																		: isInRange
																			? "bg-blue-100 dark:bg-blue-900/50 text-blue-900 dark:text-blue-100 font-medium cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-900/70"
																			: "text-gray-900 dark:text-white hover:bg-blue-50 dark:hover:bg-blue-900/30 cursor-pointer"
															: "text-gray-300 dark:text-gray-600"
													}${
														isToday && !hasEvent && !isInRange && !isDisabled
															? " ring-2 ring-orange-500 dark:ring-orange-400 ring-inset rounded-lg font-medium"
															: ""
													}`}
													title={
														isDisabled
															? "Cannot select date before start date"
															: isStart
																? "Project Start Date"
																: isEnd
																	? "Project End Date"
																	: isInRange
																		? "Within project range"
																		: isCurrentMonth
																			? "Click to set date"
																			: ""
													}
												>
													{day ?? ""}
													{isStart && (
														<div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-white rounded-full" />
													)}
													{isEnd && (
														<div className="absolute top-0.5 left-0.5 w-1.5 h-1.5 bg-white rounded-full" />
													)}
												</div>
											);
										}
									})}
								</div>

								<div
									className={
										isDetailed
											? "flex items-center justify-center gap-6 mt-5 pt-4 border-t border-gray-200/80 dark:border-white/10 text-xs"
											: "flex items-center justify-center gap-6 mt-4 pt-4 border-t border-gray-200 dark:border-white/10 text-xs text-gray-500 dark:text-gray-400"
									}
								>
									{startDateValue && (
										<div className="flex items-center gap-2">
											<div className="w-3 h-3 bg-blue-600 rounded"></div>
											<span className="text-xs text-gray-500 dark:text-gray-400">
												Start: {formatDisplayDate(startDateValue)}
											</span>
										</div>
									)}
									{endDateValue && (
										<div className="flex items-center gap-2">
											<div className="w-3 h-3 bg-blue-600 rounded"></div>
											<span className="text-xs text-gray-500 dark:text-gray-400">
												End: {formatDisplayDate(endDateValue)}
											</span>
										</div>
									)}
									{showDueDate && dueDateValue && (
										<div className="flex items-center gap-2">
											<div className="w-3 h-3 bg-blue-600 rounded"></div>
											<span className="text-xs text-gray-500 dark:text-gray-400">
												Due: {formatDisplayDate(dueDateValue)}
											</span>
										</div>
									)}
								</div>
							</div>
						);
					}}
				/>
			)}
		/>
	);
}
