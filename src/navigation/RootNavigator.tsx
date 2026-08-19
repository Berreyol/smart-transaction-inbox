import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ForwardingAddressModal } from "../components/ForwardingAddressModal";
import { DashboardScreen } from "../screens/DashboardScreen";
import { InboxScreen } from "../screens/InboxScreen";
import { TransactionsScreen } from "../screens/TransactionsScreen";
import { useAuthStore } from "../store/authStore";
import { useInboxStore } from "../store/inboxStore";
import { useProfileStore } from "../store/profileStore";

const Tab = createBottomTabNavigator();

function HeaderActions() {
  const userId = useAuthStore((state) => state.session?.user.id);
  const signOut = useAuthStore((state) => state.signOut);
  const fetchProfile = useProfileStore((state) => state.fetchProfile);
  const [addressVisible, setAddressVisible] = useState(false);

  useEffect(() => {
    if (userId) fetchProfile(userId);
  }, [userId, fetchProfile]);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginRight: 16, gap: 16 }}>
      <Pressable onPress={() => setAddressVisible(true)} hitSlop={12}>
        <Ionicons name="at-outline" size={22} color="#4f46e5" />
      </Pressable>
      <Pressable onPress={signOut} hitSlop={12}>
        <Text style={{ color: "#4f46e5", fontWeight: "600" }}>Sign Out</Text>
      </Pressable>
      <ForwardingAddressModal visible={addressVisible} onClose={() => setAddressVisible(false)} />
    </View>
  );
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

export function RootNavigator() {
  return (
    <NavigationContainer>
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
            tabBarIcon: ({ color, size }) => <InboxTabIcon color={color} size={size} />,
          }}
        />
        <Tab.Screen
          name="Transactions"
          component={TransactionsScreen}
          options={{
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="list-outline" color={color} size={size} />
            ),
          }}
        />
        <Tab.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="bar-chart-outline" color={color} size={size} />
            ),
          }}
        />
      </Tab.Navigator>
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
