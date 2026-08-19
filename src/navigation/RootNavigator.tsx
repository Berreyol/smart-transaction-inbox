import { Ionicons } from "@expo/vector-icons";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Pressable, Text } from "react-native";
import { DashboardScreen } from "../screens/DashboardScreen";
import { InboxScreen } from "../screens/InboxScreen";
import { TransactionsScreen } from "../screens/TransactionsScreen";
import { useAuthStore } from "../store/authStore";

const Tab = createBottomTabNavigator();

function SignOutButton() {
  const signOut = useAuthStore((state) => state.signOut);
  return (
    <Pressable onPress={signOut} hitSlop={12} style={{ marginRight: 16 }}>
      <Text style={{ color: "#4f46e5", fontWeight: "600" }}>Sign Out</Text>
    </Pressable>
  );
}

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerRight: () => <SignOutButton />,
          tabBarActiveTintColor: "#4f46e5",
        }}
      >
        <Tab.Screen
          name="Inbox"
          component={InboxScreen}
          options={{
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="mail-outline" color={color} size={size} />
            ),
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
