"use client";

import { useEffect, useRef, useState } from "react";

export function useStickyHeader() {
	const sentinelRef = useRef<HTMLDivElement>(null);
	const [isSticky, setIsSticky] = useState(false);

	useEffect(() => {
		const sentinel = sentinelRef.current;
		if (!sentinel) return;

		const observer = new IntersectionObserver(
			([entry]) => {
				setIsSticky(!entry.isIntersecting);
			},
			{ threshold: 0, rootMargin: "-80px 0px 0px 0px" }
		);

		observer.observe(sentinel);
		return () => observer.disconnect();
	}, []);

	return { sentinelRef, isSticky };
}
