import Image from "next/image";
import { ShieldCheck } from "lucide-react";

export function PoweredByOneTool({ className = "" }: { className?: string }) {
	return (
		<div
			className={`flex items-center gap-2.5 text-[13px] text-muted-foreground ${className}`}
			aria-label="Powered by OneTool"
		>
			<Image
				src="/OneTool.png"
				alt=""
				width={80}
				height={80}
				aria-hidden="true"
			/>
			<span className="font-medium">Powered by OneTool</span>
		</div>
	);
}

// Signed-out page uses this variant per UI-SPEC §Copywriting Contract.
// Authenticated chrome and the verify screen continue to use PoweredByOneTool.
export function SecuredByOneTool({ className = "" }: { className?: string }) {
	return (
		<div
			className={`flex items-center gap-2 text-xs text-muted-foreground ${className}`}
			aria-label="Secured by OneTool"
		>
			<ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
			<span>Secured by OneTool</span>
		</div>
	);
}
