import { Tabs, Redirect } from "expo-router";
import { useAuth, useUser } from "@clerk/expo";
import { useQuery } from "convex/react";
import { api } from "@onetool/backend/convex/_generated/api";
import { View, Text, Image } from "react-native";
import {
  Home,
  Users,
  FolderKanban,
  CheckSquare,
} from "lucide-react-native";
import { AppHeader } from "@/components/AppHeader";
import { fontFamily } from "@/lib/theme";

const PRIMARY_COLOR = "rgb(0, 166, 244)";
const INACTIVE_COLOR = "#6b7280";
const DANGER_COLOR = "#ef4444";

function ProfileTabIcon({ color, size }: { color: string; size: number }) {
  const { user } = useUser();
  const notificationData = useQuery(api.notifications.listForCurrentUser, {
    limit: 1,
  });
  const unreadCount = notificationData?.unreadCount || 0;

  return (
    <View style={{ position: "relative" }}>
      {user?.imageUrl ? (
        <Image
          source={{ uri: user.imageUrl }}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 2,
            borderColor: color,
          }}
        />
      ) : (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#fff", fontFamily: fontFamily.semibold, fontSize: size * 0.5 }}>
            {user?.firstName?.[0] ||
              user?.emailAddresses[0]?.emailAddress[0]?.toUpperCase() || "?"}
          </Text>
        </View>
      )}
      {unreadCount > 0 && (
        <View
          style={{
            position: "absolute",
            top: -2,
            right: -2,
            backgroundColor: DANGER_COLOR,
            borderRadius: 8,
            minWidth: 16,
            height: 16,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 3,
            borderWidth: 1.5,
            borderColor: "#ffffff",
          }}
        >
          <Text
            style={{
              color: "#fff",
              fontSize: 9,
              fontFamily: fontFamily.bold,
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </Text>
        </View>
      )}
    </View>
  );
}

export default function TabLayout() {
  const { isSignedIn } = useAuth();

  // If the user is not signed in, redirect them to the sign-in page
  if (!isSignedIn) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: PRIMARY_COLOR,
        tabBarInactiveTintColor: INACTIVE_COLOR,
        tabBarStyle: {
          backgroundColor: "#ffffff",
          borderTopColor: "#e5e7eb",
        },
        headerShown: false, // Hide default header, we'll show custom header in each stack
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
          header: () => <AppHeader />,
          headerShown: true,
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: "Clients",
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
          headerShown: false, // Stack will handle header
        }}
      />
      <Tabs.Screen
        name="projects"
        options={{
          title: "Projects",
          tabBarIcon: ({ color, size }) => (
            <FolderKanban color={color} size={size} />
          ),
          headerShown: false, // Stack will handle header
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: "Tasks",
          tabBarIcon: ({ color, size }) => (
            <CheckSquare color={color} size={size} />
          ),
          header: () => <AppHeader />,
          headerShown: true,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <ProfileTabIcon color={color} size={size} />
          ),
          header: () => <AppHeader />,
          headerShown: true,
        }}
      />
    </Tabs>
  );
}

