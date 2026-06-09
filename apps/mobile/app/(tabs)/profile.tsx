import { View, Text, ScrollView, Alert, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useUser, useAuth, useOrganization } from "@clerk/expo";
import { useTokens, radii, fontFamily } from "@/lib/theme";
import { Avatar, Card } from "@/components/ui";
import { Mail, Building, LogOut, Shield } from "lucide-react-native";
import { AppHeader } from "@/components/app-header";

export default function ProfileScreen() {
	const { user } = useUser();
	const { signOut } = useAuth();
	const { organization, membership } = useOrganization();
	const t = useTokens();

	const handleSignOut = () => {
		Alert.alert("Sign Out", "Are you sure you want to sign out?", [
			{ text: "Cancel", style: "cancel" },
			{
				text: "Sign Out",
				style: "destructive",
				onPress: () => signOut(),
			},
		]);
	};

	const initials =
		user?.firstName?.[0] ||
		user?.emailAddresses[0]?.emailAddress[0]?.toUpperCase() ||
		"?";

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: t.surface }} edges={[]}>
			<AppHeader mode="root" title="Profile" />
			<ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
				{/* User Avatar & Name */}
				<View style={{ alignItems: "center", marginBottom: 24, paddingVertical: 24 }}>
					<Avatar text={initials} imageUrl={user?.imageUrl} size={80} />

					<Text
						style={{
							fontSize: 20,
							fontFamily: fontFamily.bold,
							color: t.ink,
							marginTop: 16,
							marginBottom: 4,
						}}
					>
						{user?.firstName} {user?.lastName}
					</Text>
					<Text
						style={{
							fontSize: 13,
							fontFamily: fontFamily.regular,
							color: t.sub,
						}}
					>
						{user?.primaryEmailAddress?.emailAddress}
					</Text>
				</View>

				{/* Account Details */}
				<Card>
					{/* Email */}
					<View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8 }}>
						<Mail size={20} color={t.sub} />
						<View style={{ marginLeft: 16, flex: 1 }}>
							<Text style={{ fontSize: 11, fontFamily: fontFamily.regular, color: t.sub }}>
								Email
							</Text>
							<Text style={{ fontSize: 13, fontFamily: fontFamily.regular, color: t.ink }}>
								{user?.primaryEmailAddress?.emailAddress}
							</Text>
						</View>
					</View>

					{/* Organization */}
					{organization && (
						<View
							style={{
								flexDirection: "row",
								alignItems: "center",
								paddingVertical: 8,
								marginTop: 8,
								borderTopWidth: 1,
								borderTopColor: t.line,
							}}
						>
							<Building size={20} color={t.sub} />
							<View style={{ marginLeft: 16, flex: 1 }}>
								<Text style={{ fontSize: 11, fontFamily: fontFamily.regular, color: t.sub }}>
									Organization
								</Text>
								<Text style={{ fontSize: 13, fontFamily: fontFamily.regular, color: t.ink }}>
									{organization.name}
								</Text>
							</View>
						</View>
					)}

					{/* Role */}
					{membership && (
						<View
							style={{
								flexDirection: "row",
								alignItems: "center",
								paddingVertical: 8,
								marginTop: 8,
								borderTopWidth: 1,
								borderTopColor: t.line,
							}}
						>
							<Shield size={20} color={t.sub} />
							<View style={{ marginLeft: 16, flex: 1 }}>
								<Text style={{ fontSize: 11, fontFamily: fontFamily.regular, color: t.sub }}>
									Role
								</Text>
								<Text style={{ fontSize: 13, fontFamily: fontFamily.regular, color: t.ink }}>
									{membership.role.charAt(0).toUpperCase() +
										membership.role.slice(1)}
								</Text>
							</View>
						</View>
					)}
				</Card>

				{/* Sign Out Button */}
				<Pressable
					style={{
						flexDirection: "row",
						alignItems: "center",
						justifyContent: "center",
						paddingVertical: 16,
						borderRadius: radii.lg,
						marginTop: 24,
						backgroundColor: t.card,
						borderWidth: 1,
						borderColor: t.line,
					}}
					onPress={handleSignOut}
				>
					<LogOut size={20} color={t.danger} />
					<Text
						style={{
							marginLeft: 8,
							color: t.danger,
							fontFamily: fontFamily.semibold,
							fontSize: 13,
						}}
					>
						Sign Out
					</Text>
				</Pressable>

				{/* App Info */}
				<View style={{ alignItems: "center", marginTop: 24 }}>
					<Text style={{ fontSize: 11, fontFamily: fontFamily.regular, color: t.sub }}>
						OneTool Mobile
					</Text>
					<Text
						style={{
							fontSize: 11,
							fontFamily: fontFamily.regular,
							color: t.sub,
							marginTop: 4,
						}}
					>
						Version 1.0.0
					</Text>
				</View>
			</ScrollView>
		</SafeAreaView>
	);
}
