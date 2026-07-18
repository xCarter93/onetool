import type { ReactNode } from "react";
import type { Metadata } from "next";

// PUB-04: the pay-by-link publicToken is a bearer credential that sits in the
// URL. Prevent search engines from indexing it, mirroring the client portal.
export const metadata: Metadata = {
	robots: { index: false, follow: false },
};

export default function PayLayout({ children }: { children: ReactNode }) {
	return children;
}
