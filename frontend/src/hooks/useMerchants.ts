import { useState, useEffect } from "react";
import { DEMO_MERCHANTS } from "../utils/constants";
import { fetchMerchants, fetchHealth } from "../utils/api";
import type { ZalyxMerchantSnapshot } from "../types";

const DEFAULT_MERCHANT = DEMO_MERCHANTS.restaurant;
const ALL_DEMO = Object.values(DEMO_MERCHANTS);

function findById(list: ZalyxMerchantSnapshot[], id: string) {
  return list.find((m) => m.id === id);
}

export function useMerchants(initialMerchantId?: string) {
  const [merchants, setMerchants] = useState<ZalyxMerchantSnapshot[]>(ALL_DEMO);
  const [selectedMerchant, setSelectedMerchant] = useState<ZalyxMerchantSnapshot>(
    () => (initialMerchantId ? findById(ALL_DEMO, initialMerchantId) : undefined) ?? DEFAULT_MERCHANT
  );
  const [isMock, setIsMock] = useState<boolean | null>(null);

  useEffect(() => {
    fetchHealth()
      .then(({ mockMode }) => setIsMock(mockMode))
      .catch(() => {});

    fetchMerchants()
      .then((list) => {
        if (list.length > 0) {
          setMerchants(list);
          // Honour URL param on deep link; otherwise keep current selection
          const targetId = initialMerchantId ?? selectedMerchant.id;
          const match = findById(list, targetId);
          if (match) setSelectedMerchant(match);
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectMerchant = (merchant: ZalyxMerchantSnapshot) => setSelectedMerchant(merchant);

  const addMerchant = (merchant: ZalyxMerchantSnapshot) => {
    setMerchants((prev) =>
      prev.find((m) => m.id === merchant.id) ? prev : [...prev, merchant]
    );
    setSelectedMerchant(merchant);
  };

  const refreshIsMock = () => {
    fetchHealth()
      .then(({ mockMode }) => setIsMock(mockMode))
      .catch(() => undefined);
  };

  return { merchants, selectedMerchant, isMock, selectMerchant, addMerchant, refreshIsMock };
}
