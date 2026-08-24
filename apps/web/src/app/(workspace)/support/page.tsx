import type { Metadata } from "next";
import { SupportScreen } from "./components/support-screen";

export const metadata: Metadata = {
	title: "Support",
};

export default function SupportPage() {
	return <SupportScreen />;
}
