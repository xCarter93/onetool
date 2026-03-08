"use client";

import { useState } from "react";
import Image from "next/image";
import { StyledButton } from "@/components/ui/styled/styled-button";
import { Calendar } from "lucide-react";
import ScheduleDemoModal from "@/app/components/landing/schedule-demo-modal";

const navigation = {
	solutions: [
		"Client Management",
		"Project Tracking",
		"Quoting & Invoicing",
		"Task Scheduling",
		"Mobile Access",
	],
	legal: [
		{ name: "Terms of Service", href: "/terms-of-service" },
		{ name: "Privacy Policy", href: "/privacy-policy" },
		{ name: "Data Security", href: "/data-security" },
	],
	social: [
		{
			name: "Facebook",
			href: "https://www.facebook.com/people/OneToolbiz/61586066428412/?mibextid=wwXIfr&rdid=Nsakx5TWeKAAhZev&share_url=https%3A%2F%2Fwww.facebook.com%2Fshare%2F1FWQx8iUPt%2F%3Fmibextid%3DwwXIfr",
			icon: (props: React.SVGProps<SVGSVGElement>) => (
				<svg fill="currentColor" viewBox="0 0 24 24" {...props}>
					<path
						fillRule="evenodd"
						d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z"
						clipRule="evenodd"
					/>
				</svg>
			),
		},
		{
			name: "Instagram",
			href: "https://www.instagram.com/onetool.biz?igsh=MWJiNzVyOTFjcTdtZw==",
			icon: (props: React.SVGProps<SVGSVGElement>) => (
				<svg fill="currentColor" viewBox="0 0 24 24" {...props}>
					<path
						fillRule="evenodd"
						d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z"
						clipRule="evenodd"
					/>
				</svg>
			),
		},
	],
};

export default function Footer() {
	const [isScheduleDemoOpen, setIsScheduleDemoOpen] = useState(false);

	return (
		<footer className="relative">
			{/* CTA Card - overlapping the footer */}
			<div className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 mb-[-80px]">
				<div className="relative overflow-hidden rounded-3xl p-8 sm:p-12 text-center">
					{/* BG image blurred */}
					<div className="absolute inset-0">
						<Image
							src="/BG.png"
							alt=""
							fill
							className="object-cover blur-sm brightness-110"
						/>
						<div className="absolute inset-0 bg-white/60 dark:bg-black/60" />
					</div>

					<div className="relative z-10">
						<h2 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight text-foreground mb-6">
							Ready to simplify your business?
						</h2>
						<StyledButton
							intent="outline"
							size="lg"
							onClick={() => setIsScheduleDemoOpen(true)}
							icon={<Calendar className="h-4 w-4" />}
						>
							Schedule a Demo
						</StyledButton>
					</div>
				</div>
			</div>

			<ScheduleDemoModal
				isOpen={isScheduleDemoOpen}
				onClose={() => setIsScheduleDemoOpen(false)}
			/>

			{/* Accent Footer */}
			<div className="bg-primary rounded-tr-[3rem] rounded-tl-[3rem] pt-32 pb-8 px-4 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-7xl">
					<div className="flex flex-col gap-10 lg:grid lg:grid-cols-3 lg:gap-8">
						{/* Logo and Description */}
						<div className="space-y-5 text-center lg:text-left">
							<div className="flex items-center justify-center lg:justify-start gap-3">
								<Image
									src="/OneTool.png"
									alt="OneTool Logo"
									width={150}
									height={150}
									className="rounded-md brightness-0 invert sm:w-[180px]"
								/>
							</div>
							<p className="text-sm leading-6 text-white/70 max-w-xs mx-auto lg:mx-0">
								Streamlining business operations for companies that serve
								their communities. Built by entrepreneurs, for entrepreneurs.
							</p>
							{/* Social icons */}
							<div className="flex justify-center lg:justify-start gap-x-5">
								{navigation.social.map((item) => (
									<a
										key={item.name}
										href={item.href}
										className="text-white/60 hover:text-white transition-colors"
									>
										<span className="sr-only">{item.name}</span>
										<item.icon aria-hidden="true" className="size-5 sm:size-6" />
									</a>
								))}
							</div>
						</div>

						{/* Navigation Links */}
						<div className="grid grid-cols-2 gap-4 sm:gap-8 lg:col-span-2">
							{/* Solutions */}
							<div>
								<h3 className="text-sm font-semibold text-white">
									Solutions
								</h3>
								<ul role="list" className="mt-4 sm:mt-6 space-y-3">
									{navigation.solutions.map((item) => (
										<li key={item}>
											<span className="text-sm text-white/60">
												{item}
											</span>
										</li>
									))}
								</ul>
							</div>

							{/* Legal */}
							<div>
								<h3 className="text-sm font-semibold text-white">
									Legal
								</h3>
								<ul role="list" className="mt-4 sm:mt-6 space-y-3">
									{navigation.legal.map((item) => (
										<li key={item.name}>
											<a
												href={item.href}
												className="text-sm text-white/60 hover:text-white transition-colors"
											>
												{item.name}
											</a>
										</li>
									))}
								</ul>
							</div>
						</div>
					</div>

					{/* Copyright */}
					<div className="mt-12 sm:mt-16 border-t border-white/20 pt-6 sm:pt-8">
						<p className="text-sm text-center lg:text-left text-white/50">
							&copy; 2025 OneTool. All rights reserved.
						</p>
					</div>
				</div>
			</div>
		</footer>
	);
}
