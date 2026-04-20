(function attachAdminPanelState(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.PetixAdminPanelState = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createAdminPanelState() {
  function normalizeAdminSearchValue(value) {
    return String(value || "").trim();
  }

  function toSearchable(value) {
    return normalizeAdminSearchValue(value).toLowerCase();
  }

  function filterAdminCharacters(records, query) {
    const normalizedQuery = toSearchable(query);
    const source = Array.isArray(records) ? records : [];
    if (!normalizedQuery) {
      return source;
    }

    return source.filter((record) =>
      String(record?.creatorWallet || "")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }

  function filterAdminWaitlistEntries(records, query) {
    const normalizedQuery = toSearchable(query);
    const source = Array.isArray(records) ? records : [];
    if (!normalizedQuery) {
      return source;
    }

    return source.filter((entry) =>
      [entry?.email, entry?.source, entry?.pagePath, entry?.userAgent].some((field) =>
        String(field || "")
          .toLowerCase()
          .includes(normalizedQuery)
      )
    );
  }

  function filterAdminBattles(records, query) {
    const normalizedQuery = toSearchable(query);
    const source = Array.isArray(records) ? records : [];
    if (!normalizedQuery) {
      return source;
    }

    return source.filter((record) =>
      [
        record?.battleId,
        record?.status,
        record?.rewardStatus,
        record?.failureStage,
        record?.error,
        record?.finalizationState?.lastAttemptResult,
        record?.attackerPet?.name,
        record?.attackerPet?.wallet,
        record?.defenderPet?.name,
        record?.defenderPet?.wallet,
        record?.winnerPetId,
      ].some((field) =>
        String(field || "")
          .toLowerCase()
          .includes(normalizedQuery)
      )
    );
  }

  function getAdminWalletPivotState(wallet) {
    return {
      query: normalizeAdminSearchValue(wallet),
      page: 1,
    };
  }

  return {
    filterAdminBattles,
    filterAdminCharacters,
    filterAdminWaitlistEntries,
    getAdminWalletPivotState,
    normalizeAdminSearchValue,
  };
});
