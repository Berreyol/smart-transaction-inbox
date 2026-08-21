// Shared date-range filter, UI-only (no Supabase persistence) — kept in a
// store rather than screen-local state so Dashboard and Transactions stay
// in sync when the user swaps between them.
import { create } from "zustand";
import { DEFAULT_DATE_PRESET, type DatePreset } from "../utils/dateFilter";

interface DateFilterState {
  datePreset: DatePreset;
  customStart: string;
  customEnd: string;
  setDatePreset: (preset: DatePreset) => void;
  setCustomStart: (value: string) => void;
  setCustomEnd: (value: string) => void;
}

export const useDateFilterStore = create<DateFilterState>((set) => ({
  datePreset: DEFAULT_DATE_PRESET,
  customStart: "",
  customEnd: "",
  setDatePreset: (datePreset) => set({ datePreset }),
  setCustomStart: (customStart) => set({ customStart }),
  setCustomEnd: (customEnd) => set({ customEnd }),
}));
