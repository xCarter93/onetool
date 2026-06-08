import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, fontFamily, spacing } from "@/lib/theme";
import { OrganizationSwitcher } from "./OrganizationSwitcher";

export function AppHeader() {
  const formatDate = () => {
    const now = new Date();
    return now.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <SafeAreaView 
      edges={["top"]}
      style={{
        backgroundColor: "#ffffff",
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
      >
        {/* Date on the left */}
        <View
          style={{
            backgroundColor: "rgba(0, 166, 244, 0.1)",
            paddingHorizontal: spacing.sm,
            paddingVertical: spacing.xs,
            borderRadius: 20,
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontFamily: fontFamily.semibold,
              color: colors.primary,
            }}
          >
            {formatDate()}
          </Text>
        </View>

        {/* Organization Switcher on the right */}
        <OrganizationSwitcher />
      </View>
    </SafeAreaView>
  );
}
