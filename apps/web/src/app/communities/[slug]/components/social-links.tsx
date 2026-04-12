import { Facebook, Instagram, Youtube, Linkedin, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

interface SocialLinksProps {
	socialLinks:
		| {
				facebook?: string;
				instagram?: string;
				nextdoor?: string;
				youtube?: string;
				linkedin?: string;
				yelp?: string;
				google?: string;
		  }
		| undefined;
	bannerUrl: string | null;
}

function NextdoorIcon({ className }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 20 20"
			fill="currentColor"
			className={className}
		>
			<path d="M10 2L2 8.5V18h5.5v-5.5h5V18H18V8.5L10 2zm0 2.1L15.5 9v7h-1.5v-5.5h-8V16H4.5V9L10 4.1z" />
		</svg>
	);
}

function YelpIcon({ className }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 20 20"
			fill="currentColor"
			className={className}
		>
			<path d="M9.2 2C8.5 2 8 2.6 8 3.3v5.9c0 .4.3.8.7.9.4.1.8-.1 1-.4l3.5-4.8c.2-.3.2-.7 0-1C12.9 3.5 11.1 2 9.2 2zM7.5 11.5c-.3-.3-.8-.3-1.1-.1l-4 3c-.3.2-.4.6-.3 1 .2.7 1.2 2.3 2.8 3 .3.1.7 0 .9-.3l2.5-4.5c.2-.4.1-.8-.2-1l-.6-.5zm5-1c-.4.1-.6.4-.6.8l.5 5.2c0 .4.3.7.6.8 1.6.3 3.3-.2 3.8-.5.3-.2.4-.6.3-.9l-2.4-4.6c-.2-.4-.6-.5-1-.4l-1.2.6zm1.2-2.3l4.5-1.5c.4-.1.6-.5.6-.8-.1-1.6-1-3.2-1.4-3.7-.2-.3-.6-.4-.9-.2L12 5.8c-.3.2-.5.6-.3 1l.6 1.2c.2.4.6.5 1 .4l-.6.8z" />
		</svg>
	);
}

const PLATFORM_CONFIG = [
	{
		key: "facebook" as const,
		label: "Facebook",
		icon: <Facebook className="size-5" />,
	},
	{
		key: "instagram" as const,
		label: "Instagram",
		icon: <Instagram className="size-5" />,
	},
	{
		key: "youtube" as const,
		label: "YouTube",
		icon: <Youtube className="size-5" />,
	},
	{
		key: "linkedin" as const,
		label: "LinkedIn",
		icon: <Linkedin className="size-5" />,
	},
	{
		key: "nextdoor" as const,
		label: "Nextdoor",
		icon: <NextdoorIcon className="size-5" />,
	},
	{
		key: "yelp" as const,
		label: "Yelp",
		icon: <YelpIcon className="size-5" />,
	},
	{
		key: "google" as const,
		label: "Google",
		icon: <Globe className="size-5" />,
	},
];

function getHref(url: string): string {
	return url.startsWith("http") ? url : `https://${url}`;
}

export function SocialLinks({ socialLinks, bannerUrl }: SocialLinksProps) {
	if (!socialLinks) return null;

	const activePlatforms = PLATFORM_CONFIG.filter(
		(p) => socialLinks[p.key] && socialLinks[p.key]!.trim() !== ""
	);

	if (activePlatforms.length === 0) return null;

	return (
		<div className="flex items-center gap-3 mt-2">
			{activePlatforms.map((platform) => (
				<a
					key={platform.key}
					href={getHref(socialLinks[platform.key]!)}
					target="_blank"
					rel="noopener noreferrer"
					aria-label={`Follow on ${platform.label}`}
					className={cn(
						"opacity-70 hover:opacity-100 transition-opacity duration-200",
						bannerUrl ? "text-gray-200" : "text-muted-fg"
					)}
				>
					{platform.icon}
				</a>
			))}
		</div>
	);
}
