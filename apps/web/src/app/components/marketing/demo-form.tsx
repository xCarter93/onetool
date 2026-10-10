"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ComponentProps } from "react";

const ScheduleDemoForm = dynamic(() => import("./schedule-demo-form").then((m) => m.ScheduleDemoForm));

/** Mounts the demo form (and its phone-number bundle) only once it scrolls near the viewport. */
export function DemoForm(props: ComponentProps<typeof ScheduleDemoForm>) {
	const ref = useRef<HTMLDivElement>(null);
	const [near, setNear] = useState(false);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (!entry.isIntersecting) return;
				setNear(true);
				observer.disconnect();
			},
			{ rootMargin: "800px 0px" }
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	return (
		<div ref={ref} className="min-h-[300px]">
			{near ? <ScheduleDemoForm {...props} /> : null}
		</div>
	);
}
