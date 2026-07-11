"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ShowcaseItem {
	slug: string;
	pageTitle: string;
	avatarUrl: string | null;
	organizationName: string;
}

export default function ShowcaseSection() {
	const [items, setItems] = useState<ShowcaseItem[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState(false);

	useEffect(() => {
		async function fetchShowcase() {
			try {
				const response = await fetch("/api/communities/showcase");
				if (!response.ok) throw new Error("Failed to fetch");
				const data = await response.json();
				setItems(data);
			} catch {
				setError(true);
			} finally {
				setIsLoading(false);
			}
		}

		fetchShowcase();
	}, []);

	// Don't render anything if loading, error, or less than 5 items
	if (isLoading) {
		return null; // Don't show loading state on landing page
	}

	if (error || items.length < 5) {
		return null; // Hide section if less than 5 public community pages
	}

	return (
		<section className="relative py-16 sm:py-24 lg:py-32 bg-gradient-to-b from-white to-gray-50/50 dark:from-gray-900 dark:to-gray-900/50">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
				{/* Header */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					transition={{ duration: 0.5 }}
					className="text-center mb-12"
				>
					<div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-4">
						<Users className="size-4 text-primary" />
						<span className="text-sm font-medium text-primary">
							Community Showcase
						</span>
					</div>
					<h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
						Businesses Using OneTool
					</h2>
					<p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
						Discover local businesses and service providers in your community
					</p>
				</motion.div>

				{/* Grid */}
				<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
					{items.slice(0, 8).map((item, index) => (
						<motion.div
							key={item.slug}
							initial={{ opacity: 0, y: 20 }}
							whileInView={{ opacity: 1, y: 0 }}
							viewport={{ once: true }}
							transition={{ duration: 0.5, delay: index * 0.1 }}
						>
							<Link href={`/communities/${item.slug}`} className="group block">
								<div className="relative bg-white dark:bg-gray-800/50 rounded-2xl border border-gray-200 dark:border-gray-700/50 p-4 sm:p-6 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:border-primary/30 hover:-translate-y-1">
									{/* Avatar */}
									<div className="relative size-16 sm:size-20 mx-auto mb-4 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700">
										{item.avatarUrl ? (
											<Image
												src={item.avatarUrl}
												alt={item.pageTitle}
												fill
												className="object-cover"
											/>
										) : (
											<div className="absolute inset-0 flex items-center justify-center">
												<span className="text-2xl font-bold text-gray-400 dark:text-gray-500">
													{item.pageTitle.charAt(0).toUpperCase()}
												</span>
											</div>
										)}
									</div>

									{/* Title */}
									<h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white text-center line-clamp-2 mb-1 group-hover:text-primary transition-colors">
										{item.pageTitle}
									</h3>

									{/* Organization Name */}
									{item.organizationName &&
										item.organizationName !== item.pageTitle && (
											<p className="text-xs text-gray-500 dark:text-gray-400 text-center line-clamp-1">
												{item.organizationName}
											</p>
										)}

									{/* Hover indicator */}
									<div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
										<ArrowRight className="size-4 text-primary" />
									</div>
								</div>
							</Link>
						</motion.div>
					))}
				</div>

				{/* View All Link */}
				{items.length > 8 && (
					<motion.div
						initial={{ opacity: 0, y: 20 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true }}
						transition={{ duration: 0.5, delay: 0.4 }}
						className="text-center mt-8"
					>
						<Button variant="outline" size="lg">
							View All Communities
							<ArrowRight className="size-4 ml-2" />
						</Button>
					</motion.div>
				)}
			</div>
		</section>
	);
}
