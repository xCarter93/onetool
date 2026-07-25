import { Fragment } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { fontFamily, type, useTokens } from "@/lib/theme";
import { parseMarkdownLite, type InlineNode } from "@/lib/markdown-lite";

/** Renders markdown-lite's block AST as RN Text/View using theme tokens. */
export function MarkdownLiteView({ text }: { text: string }) {
	const t = useTokens();
	const blocks = parseMarkdownLite(text);
	return (
		<View style={styles.blocks}>
			{blocks.map((block, i) => {
				if (block.type === "heading") {
					const size = block.level === 1 ? type.h4 : type.body;
					return (
						<Text
							key={i}
							style={[styles.heading, { color: t.ink, fontSize: size }]}
						>
							<Inline nodes={block.inline} t={t} />
						</Text>
					);
				}
				if (block.type === "paragraph") {
					return (
						<Text key={i} style={[styles.paragraph, { color: t.ink }]}>
							<Inline nodes={block.inline} t={t} />
						</Text>
					);
				}
				if (block.type === "list") {
					return (
						<View key={i} style={styles.list}>
							{block.items.map((item, j) => (
								<View key={j} style={styles.listItem}>
									<Text style={[styles.listBullet, { color: t.sub }]}>
										{block.ordered ? `${j + 1}.` : "•"}
									</Text>
									<Text style={[styles.paragraph, styles.listItemText, { color: t.ink }]}>
										<Inline nodes={item} t={t} />
									</Text>
								</View>
							))}
						</View>
					);
				}
				// code
				return (
					<View
						key={i}
						style={[styles.code, { backgroundColor: t.secondary, borderColor: t.line }]}
					>
						<Text style={[styles.codeText, { color: t.ink }]}>{block.code}</Text>
					</View>
				);
			})}
		</View>
	);
}

function Inline({ nodes, t }: { nodes: InlineNode[]; t: ReturnType<typeof useTokens> }) {
	return (
		<>
			{nodes.map((node, i) => {
				if (node.type === "bold") {
					return (
						<Text key={i} style={{ fontFamily: fontFamily.semibold }}>
							{node.text}
						</Text>
					);
				}
				if (node.type === "italic") {
					return (
						<Text key={i} style={{ fontStyle: "italic" }}>
							{node.text}
						</Text>
					);
				}
				if (node.type === "code") {
					return (
						<Text
							key={i}
							style={[
								styles.inlineCode,
								{ backgroundColor: t.secondary, color: t.ink },
							]}
						>
							{node.text}
						</Text>
					);
				}
				if (node.type === "link") {
					return (
						<Text
							key={i}
							style={[styles.link, { color: t.frostedInk }]}
							onPress={() => {
								Linking.openURL(node.href).catch(() => {
									// Silently ignore — an unopenable link isn't worth an alert here.
								});
							}}
						>
							{node.text}
						</Text>
					);
				}
				return <Fragment key={i}>{node.text}</Fragment>;
			})}
		</>
	);
}

// react-native has no cross-platform "monospace" family name; the system
// generic keyword works on both iOS and Android.
const MONO_FONT = "monospace";

const styles = StyleSheet.create({
	blocks: {
		gap: 8,
	},
	heading: {
		fontFamily: fontFamily.semibold,
		lineHeight: 22,
	},
	paragraph: {
		fontFamily: fontFamily.regular,
		fontSize: type.body,
		lineHeight: 20,
	},
	list: {
		gap: 4,
	},
	listItem: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: 6,
	},
	listBullet: {
		fontFamily: fontFamily.regular,
		fontSize: type.body,
		lineHeight: 20,
	},
	listItemText: {
		flex: 1,
	},
	code: {
		borderWidth: 1,
		borderRadius: 8,
		padding: 10,
	},
	codeText: {
		fontFamily: MONO_FONT,
		fontSize: type.sm,
		lineHeight: 18,
	},
	inlineCode: {
		fontFamily: MONO_FONT,
		fontSize: type.sm,
	},
	link: {
		textDecorationLine: "underline",
	},
});
