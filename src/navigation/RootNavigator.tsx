import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StyleSheet, View } from "react-native";
import { AccountMenu } from "../components/AccountMenu";
import { DashboardScreen } from "../screens/DashboardScreen";
import { InboxScreen } from "../screens/InboxScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { TransactionsScreen } from "../screens/TransactionsScreen";
import { useAuthStore } from "../store/authStore";
import { useInboxStore } from "../store/inboxStore";
import { useProfileStore } from "../store/profileStore";
import type { RootStackParamList, RootTabParamList } from "./types";

const Tab = createBottomTabNavigator<RootTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

function HeaderActions() {
  const userId = useAuthStore((state) => state.session?.user.id);
  const fetchProfile = useProfileStore((state) => state.fetchProfile);

  useEffect(() => {
    if (userId) fetchProfile(userId);
  }, [userId, fetchProfile]);

  return <AccountMenu />;
}

function InboxTabIcon({ color, size }: { color: string; size: number }) {
  const hasPending = useInboxStore((state) => state.items.length > 0);
  return (
    <View>
      <Ionicons name="mail-outline" color={color} size={size} />
      {hasPending && <View style={styles.badgeDot} />}
    </View>
  );
}

function MainTabs() {
  const { t } = useTranslation();
  return (
    <Tab.Navigator
      screenOptions={{
        headerRight: () => <HeaderActions />,
        tabBarActiveTintColor: "#4f46e5",
      }}
    >
      <Tab.Screen
        name="Inbox"
        component={InboxScreen}
        options={{
          title: t("nav.inbox"),
          tabBarLabel: t("nav.inbox"),
          tabBarIcon: ({ color, size }) => <InboxTabIcon color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Transactions"
        component={TransactionsScreen}
        options={{
          title: t("nav.transactions"),
          tabBarLabel: t("nav.transactions"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list-outline" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          title: t("nav.dashboard"),
          tabBarLabel: t("nav.dashboard"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bar-chart-outline" color={color} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerBackButtonDisplayMode: "minimal" }}>
        <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  badgeDot: {
    position: "absolute",
    top: -1,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ef4444",
    borderWidth: 1.5,
    borderColor: "#fff",
  },
});
