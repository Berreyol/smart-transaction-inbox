// ============================================================================
// Row types mirroring supabase/migrations/0001_init.sql.
// Kept hand-written (rather than generated) since the schema is small and
// stable; regenerate with `supabase gen types typescript` if it grows.
//
// NOTE: these must be `type` aliases, not `interface`s. @supabase/postgrest-js
// resolves table generics through deeply recursive conditional types, and
// interfaces (unlike type aliases) aren't eagerly flattened before that
// resolution runs — the mismatch silently collapses insert/update/select
// argument types to `never` with no useful error at the call site.
// ============================================================================

export type TransactionType = "income" | "expense";
export type PendingStatus = "pending" | "approved" | "rejected";

export type Profile = {
  id: string;
  email: string;
  expo_push_token: string | null;
  forwarding_token: string;
  created_at: string;
};

export type Transaction = {
  id: string;
  user_id: string;
  amount: number;
  type: TransactionType;
  category: string;
  date: string;
  merchant: string | null;
  account_id: string | null;
  created_at: string;
};

export type PendingTransaction = {
  id: string;
  user_id: string;
  amount: number | null;
  type: TransactionType | null;
  merchant: string | null;
  bank_name: string | null;
  raw_text: string;
  date: string;
  status: PendingStatus;
  created_at: string;
};

export type Category = {
  id: string;
  user_id: string;
  name: string;
  type: TransactionType;
  created_at: string;
};

export type BankAccount = {
  id: string;
  user_id: string;
  bank_name: string;
  account_alias: string;
  created_at: string;
};

/**
 * Row shapes keyed by table name, for use with a typed Supabase client.
 * `Views`/`Functions`/`Enums`/`CompositeTypes` are required (even empty) to
 * satisfy supabase-js's internal `GenericSchema` constraint — omitting them
 * silently degrades all query builder generics (insert/update/select) to
 * `never`, same failure mode as the interface issue above.
 */
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & Pick<Profile, "id" | "email">;
        Update: Partial<Profile>;
        Relationships: [];
      };
      transactions: {
        Row: Transaction;
        Insert: Partial<Transaction> &
          Pick<Transaction, "user_id" | "amount" | "type">;
        Update: Partial<Transaction>;
        Relationships: [];
      };
      pending_transactions: {
        Row: PendingTransaction;
        Insert: Partial<PendingTransaction> &
          Pick<PendingTransaction, "user_id" | "raw_text">;
        Update: Partial<PendingTransaction>;
        Relationships: [];
      };
      categories: {
        Row: Category;
        Insert: Partial<Category> & Pick<Category, "user_id" | "name" | "type">;
        Update: Partial<Category>;
        Relationships: [];
      };
      bank_accounts: {
        Row: BankAccount;
        Insert: Partial<BankAccount> & Pick<BankAccount, "user_id" | "bank_name" | "account_alias">;
        Update: Partial<BankAccount>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      approve_pending_transaction: {
        Args: { p_pending_id: string; p_category: string; p_account_id: string | null };
        Returns: Transaction;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
