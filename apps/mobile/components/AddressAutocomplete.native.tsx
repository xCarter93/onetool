import { useCallback, useEffect, useRef, useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { MapPin, Search } from "lucide-react-native";
import { fontFamily, radii, useTokens } from "@/lib/theme";

// Output shape mirrors clientProperties.create args (web-parity field mapping).
export interface AddressValue {
	streetAddress: string;
	city: string;
	state: string;
	zipCode: string;
	country?: string;
	latitude?: number;
	longitude?: number;
	formattedAddress?: string;
}

interface AddressAutocompleteProps {
	value: AddressValue;
	onChange: (next: AddressValue) => void;
}

// Mapbox Geocoding v6 forward response (paths pinned in MAPBOX-SPIKE.md).
interface MapboxContextEntry {
	name?: string;
	region_code?: string;
}
interface MapboxFeature {
	properties?: {
		full_address?: string;
		name?: string;
		place_formatted?: string;
		coordinates?: { longitude?: number; latitude?: number };
		context?: {
			address?: MapboxContextEntry;
			place?: MapboxContextEntry;
			region?: MapboxContextEntry;
			postcode?: MapboxContextEntry;
			country?: MapboxContextEntry;
		};
	};
}

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_API_KEY;

// PINNED endpoint (MAPBOX-SPIKE.md): Geocoding v6 forward, single call, no session token.
function buildUrl(query: string): string {
	const params = new URLSearchParams({
		q: query,
		country: "US",
		autocomplete: "true",
		limit: "5",
		types: "address",
		access_token: MAPBOX_TOKEN ?? "",
	});
	return `https://api.mapbox.com/search/geocode/v6/forward?${params.toString()}`;
}

// Map one Mapbox feature to the schema fields using the EXACT pinned paths.
function featureToAddress(feature: MapboxFeature): AddressValue {
	const props = feature.properties ?? {};
	const ctx = props.context ?? {};
	return {
		streetAddress: ctx.address?.name ?? "",
		city: ctx.place?.name ?? "",
		state: ctx.region?.region_code ?? ctx.region?.name ?? "",
		zipCode: ctx.postcode?.name ?? "",
		country: ctx.country?.name ?? undefined,
		longitude: props.coordinates?.longitude,
		latitude: props.coordinates?.latitude,
		formattedAddress: props.full_address ?? undefined,
	};
}

function suggestionLabel(feature: MapboxFeature): string {
	const props = feature.properties ?? {};
	if (props.full_address) return props.full_address;
	const parts = [props.name, props.place_formatted].filter(Boolean);
	return parts.join(", ");
}

export function AddressAutocomplete({
	value,
	onChange,
}: AddressAutocompleteProps) {
	const t = useTokens();
	const hasToken = Boolean(MAPBOX_TOKEN);

	// --- Manual fallback branch (no token) — buildable + lint-passing without a key.
	if (!hasToken) {
		return (
			<ManualAddressFields value={value} onChange={onChange} tokens={t} />
		);
	}

	return <MapboxAddressSearch value={value} onChange={onChange} />;
}

// ---------------------------------------------------------------------------
// Live Mapbox suggestion branch
// ---------------------------------------------------------------------------
function MapboxAddressSearch({ value, onChange }: AddressAutocompleteProps) {
	const t = useTokens();
	const [query, setQuery] = useState(value.formattedAddress ?? value.streetAddress ?? "");
	const [suggestions, setSuggestions] = useState<MapboxFeature[]>([]);
	const [loading, setLoading] = useState(false);
	const [selected, setSelected] = useState(Boolean(value.streetAddress));
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const runSearch = useCallback(async (text: string) => {
		const trimmed = text.trim();
		if (trimmed.length < 3) {
			setSuggestions([]);
			return;
		}
		setLoading(true);
		try {
			const res = await fetch(buildUrl(trimmed));
			const data: { features?: MapboxFeature[] } = await res.json();
			setSuggestions(data.features ?? []);
		} catch (err) {
			console.error("Mapbox address lookup failed:", err);
			setSuggestions([]);
		} finally {
			setLoading(false);
		}
	}, []);

	const handleChangeText = (text: string) => {
		setQuery(text);
		setSelected(false);
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => void runSearch(text), 300);
	};

	useEffect(() => {
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, []);

	const handleSelect = (feature: MapboxFeature) => {
		const next = featureToAddress(feature);
		onChange(next);
		setQuery(next.formattedAddress ?? next.streetAddress);
		setSuggestions([]);
		setSelected(true);
	};

	return (
		<View style={styles.group}>
			<View
				style={[
					styles.searchRow,
					{ borderColor: t.border, backgroundColor: t.card },
				]}
			>
				<Search size={18} color={t.faint} />
				<TextInput
					value={query}
					onChangeText={handleChangeText}
					placeholder="Start typing an address..."
					placeholderTextColor={t.faint}
					style={[styles.searchInput, { color: t.ink }]}
					autoCorrect={false}
					autoCapitalize="words"
				/>
				{loading ? <ActivityIndicator size="small" color={t.accent} /> : null}
			</View>

			{suggestions.length > 0 ? (
				<View
					style={[
						styles.suggestions,
						{ borderColor: t.line, backgroundColor: t.card },
					]}
				>
					{suggestions.map((feature, idx) => (
						<Pressable
							key={feature.properties?.full_address ?? String(idx)}
							onPress={() => handleSelect(feature)}
							style={({ pressed }) => [
								styles.suggestionRow,
								{
									borderBottomColor: t.line,
									borderBottomWidth: idx === suggestions.length - 1 ? 0 : 1,
									backgroundColor: pressed ? t.surface : "transparent",
								},
							]}
						>
							<MapPin size={16} color={t.accent} />
							<Text
								style={[styles.suggestionText, { color: t.ink }]}
								numberOfLines={2}
							>
								{suggestionLabel(feature)}
							</Text>
						</Pressable>
					))}
				</View>
			) : null}

			{selected && value.streetAddress ? (
				<View style={[styles.selectedCard, { backgroundColor: t.surface }]}>
					<Text style={[styles.selectedLine, { color: t.ink }]}>
						{value.streetAddress}
					</Text>
					<Text style={[styles.selectedSub, { color: t.sub }]}>
						{[value.city, value.state, value.zipCode]
							.filter(Boolean)
							.join(", ")}
					</Text>
				</View>
			) : null}
		</View>
	);
}

// ---------------------------------------------------------------------------
// Manual entry branch (no Mapbox token) — supported fallback
// ---------------------------------------------------------------------------
function ManualAddressFields({
	value,
	onChange,
	tokens,
}: AddressAutocompleteProps & { tokens: ReturnType<typeof useTokens> }) {
	const t = tokens;
	const field = (key: keyof AddressValue, placeholder: string) => (
		<TextInput
			value={(value[key] as string | undefined) ?? ""}
			onChangeText={(text) => onChange({ ...value, [key]: text })}
			placeholder={placeholder}
			placeholderTextColor={t.faint}
			style={[
				styles.manualInput,
				{ borderColor: t.border, backgroundColor: t.card, color: t.ink },
			]}
			autoCapitalize="words"
		/>
	);

	return (
		<View style={styles.group}>
			{field("streetAddress", "Street address")}
			{field("city", "City")}
			<View style={styles.manualRow}>
				<View style={styles.manualHalf}>{field("state", "State")}</View>
				<View style={styles.manualHalf}>{field("zipCode", "ZIP code")}</View>
			</View>
			{field("country", "Country (optional)")}
		</View>
	);
}

const styles = StyleSheet.create({
	group: {
		gap: 8,
	},
	searchRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		borderWidth: 1,
		borderRadius: radii.lg,
		paddingHorizontal: 12,
		minHeight: 48,
	},
	searchInput: {
		flex: 1,
		fontFamily: fontFamily.regular,
		fontSize: 15,
		paddingVertical: 10,
	},
	suggestions: {
		borderWidth: 1,
		borderRadius: radii.lg,
		overflow: "hidden",
	},
	suggestionRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingHorizontal: 12,
		paddingVertical: 12,
		minHeight: 44,
	},
	suggestionText: {
		flex: 1,
		fontFamily: fontFamily.regular,
		fontSize: 14,
	},
	selectedCard: {
		borderRadius: radii.lg,
		padding: 12,
	},
	selectedLine: {
		fontFamily: fontFamily.semibold,
		fontSize: 15,
	},
	selectedSub: {
		fontFamily: fontFamily.regular,
		fontSize: 13,
		marginTop: 2,
	},
	manualInput: {
		borderWidth: 1,
		borderRadius: radii.lg,
		paddingHorizontal: 12,
		paddingVertical: 12,
		fontFamily: fontFamily.regular,
		fontSize: 15,
		minHeight: 48,
	},
	manualRow: {
		flexDirection: "row",
		gap: 8,
	},
	manualHalf: {
		flex: 1,
	},
});
