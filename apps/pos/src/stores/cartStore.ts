import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CartPackage {
  id: string;
  code: string;
  actualWeight: string;
  sellingPrice: string;
  product?: { name: string };
}

interface CartState {
  items: CartPackage[];
  addPackage: (item: CartPackage) => void;
  removePackage: (id: string) => void;
  replacePackages: (items: CartPackage[]) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      addPackage: (item) => set((state) => state.items.some((row) => row.id === item.id)
        ? state
        : { items: [...state.items, item] }),
      removePackage: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
      replacePackages: (items) => set({ items }),
      clear: () => set({ items: [] }),
    }),
    {
      name: "seafood-pos-cart",
      partialize: (state) => ({ items: state.items }),
    },
  ),
);
