import type { TransactionType } from "../types/database";

export type RootTabParamList = {
  Inbox: undefined;
  Transactions: { type?: TransactionType; category?: string } | undefined;
  Dashboard: undefined;
};
