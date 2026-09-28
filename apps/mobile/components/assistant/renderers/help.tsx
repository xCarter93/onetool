import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { BookOpen, ChevronDown } from "lucide-react-native";
import { helpArticleUrl } from "@/lib/assistant-renderers";
import { fontFamily, type, useTokens } from "@/lib/theme";
import { Panel } from "./panel";

// Mirrors searchHelp's output in convex/assistantTools.ts. The category listing
// and no-match `note` are model guidance, so they render nothing.
interface SearchHelpOutput {
	results?: { ref: string; title: string }[];
	ref?: string;
	title?: string;
	error?: string;
}

export function SearchHelpRenderer({ output }: { output: unknown }) {
	const t = useTokens();
	const [open, setOpen] = useState(false);
	const result = output as SearchHelpOutput | undefined;
	const hits = Array.isArray(result?.results)
		? result.results
		: result?.ref && result?.title
			? [{ ref: result.ref, title: result.title }]
			: [];

	if (hits.length === 0) {
		return result?.error ? (
			<Text style={[styles.meta, { color: t.sub }]}>{result.error}</Text>
		) : null;
	}

	return (
		<Panel>
			<Pressable
				onPress={() => setOpen((v) => !v)}
				accessibilityRole="button"
				accessibilityState={{ expanded: open }}
				style={styles.trigger}
			>
				<BookOpen size={12} color={t.sub} />
				<Text style={[styles.meta, { color: t.sub }]}>
					Read {hits.length} help {hits.length === 1 ? "article" : "articles"}
				</Text>
				<ChevronDown
					size={12}
					color={t.sub}
					style={open ? styles.flipped : undefined}
				/>
			</Pressable>
			{open ? (
				<View style={[styles.list, { borderTopColor: t.lineSoft }]}>
					{hits.map((hit) => (
						<Pressable
							key={hit.ref}
							accessibilityRole="link"
							onPress={() => void WebBrowser.openBrowserAsync(helpArticleUrl(hit.ref))}
							style={({ pressed }) => pressed && styles.pressed}
						>
							<Text style={[styles.link, { color: t.primary }]} numberOfLines={1}>
								{hit.title}
							</Text>
						</Pressable>
					))}
				</View>
			) : null}
		</Panel>
	);
}

const styles = StyleSheet.create({
	meta: {
		fontFamily: fontFamily.regular,
		fontSize: type.meta,
	},
	trigger: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		minHeight: 24,
	},
	flipped: { transform: [{ rotate: "180deg" }] },
	list: {
		borderTopWidth: 1,
		marginTop: 6,
		paddingTop: 4,
	},
	link: {
		fontFamily: fontFamily.regular,
		fontSize: type.sm,
		paddingVertical: 6,
	},
	pressed: { opacity: 0.6 },
});
