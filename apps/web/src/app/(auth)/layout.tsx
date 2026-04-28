import { ReactNode } from "react";
import { ClerkProviderWithTheme } from "@/providers/ClerkProviderWithTheme";

export default function AuthLayout({ children }: { children: ReactNode }) {
	return (
		<ClerkProviderWithTheme>
			<div className="min-h-screen flex flex-col lg:flex-row">{children}</div>
		</ClerkProviderWithTheme>
	);
}
