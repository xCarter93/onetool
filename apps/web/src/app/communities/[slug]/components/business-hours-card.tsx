import { cn } from "@/lib/utils";

interface BusinessHoursCardProps {
	businessHours:
		| {
				byAppointmentOnly: boolean;
				schedule?: Array<{
					day: string;
					open: string;
					close: string;
					isClosed: boolean;
				}>;
		  }
		| undefined;
	cardClasses: string;
}

function formatTime12h(time24: string): string {
	const [hours, minutes] = time24.split(":").map(Number);
	const period = hours >= 12 ? "PM" : "AM";
	const hours12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
	return `${hours12}:${minutes.toString().padStart(2, "0")} ${period}`;
}

export function BusinessHoursCard({
	businessHours,
	cardClasses,
}: BusinessHoursCardProps) {
	if (!businessHours) return null;

	const currentDay = new Date().toLocaleDateString("en-US", {
		weekday: "long",
	});

	return (
		<div className={cn("rounded-xl p-6 mt-6", cardClasses)}>
			<h3 className="text-lg font-semibold text-fg mb-4">
				Business Hours
			</h3>

			{businessHours.byAppointmentOnly ? (
				<p className="text-sm text-muted-fg">By Appointment Only</p>
			) : (
				<div className="space-y-2">
					{businessHours.schedule?.map((entry) => {
						const isToday = entry.day === currentDay;
						return (
							<div
								key={entry.day}
								className={cn(
									"flex items-center justify-between text-sm",
									isToday
										? "font-bold text-fg"
										: "text-muted-fg"
								)}
							>
								<span>{entry.day}</span>
								{entry.isClosed ? (
									<span className="text-muted-fg italic">
										Closed
									</span>
								) : (
									<span>
										{formatTime12h(entry.open)} -{" "}
										{formatTime12h(entry.close)}
									</span>
								)}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
