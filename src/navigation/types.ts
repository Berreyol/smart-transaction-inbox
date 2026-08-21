import type { TransactionType } from "../types/database";

export type RootTabParamList = {
  Inbox: undefined;
  /** `date` is an ISO YYYY-MM-DD; when set it pins the date filter to that single day. */
  Transactions: { type?: TransactionType; category?: string; date?: string } | undefined;
  Dashboard: undefined;
};
