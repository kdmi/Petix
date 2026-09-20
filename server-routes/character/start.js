const {
  getSessionFromRequest,
  handleCors,
  isAdminWallet,
  json,
  parseJsonBody,
} = require("../../api/_lib/auth");
const {
  buildCharacterDraft,
  isDraftExpired,
  serializeCharacterRecord,
} = require("../../api/_lib/character");
const { isCharacterProxyEnabled, proxyCharacterJson } = require("../../api/_lib/character-proxy");
const { debitCurrency, normalizeCurrency, recordSpend } = require("../../api/_lib/currency");
const { createImageStore, getWalletProfile, updateWalletProfile } = require("../../api/_lib/store");
const { getEconomyConfig } = require("../../api/_lib/economy-config");
const { priceForNextPet, resolvePointsPerUsd } = require("../../api/_lib/pet-price");
const { readQuote } = require("../../api/_lib/price-quote");
const { ensurePrepaidCreations } = require("../../api/_lib/slots");
const { addSpend, withTokenState } = require("../../api/_lib/token-store");

function fail(status, message, code, extra) {
  const error = new Error(message);
  error.httpStatus = status;
  if (code) error.httpCode = code;
  if (extra) Object.assign(error, extra);
  return error;
}

/**
 * Питомец со второго стоит Points (024). Цена берётся из лестницы по текущему
 * числу питомцев; expectedPrice — то, что видел игрок, и служит только для
 * сверки: считает всегда сервер.
 */
function assertAffordable(pricing, profile, expectedPrice) {
  if (pricing.atMax) {
    throw fail(409, `Character limit reached. Maximum is ${pricing.maxPets}.`, "MAX_PETS", {
      maxPets: pricing.maxPets,
    });
  }

  if (pricing.price <= 0) return;

  const expected = Math.floor(Number(expectedPrice));
  if (Number.isFinite(expected) && expected !== pricing.price) {
    throw fail(409, "The price changed while you were deciding.", "PRICE_CHANGED", {
      price: pricing.price,
      priceUsd: pricing.priceUsd,
    });
  }

  const balance = normalizeCurrency(profile.currency).balance;
  if (balance < pricing.price) {
    throw fail(402, "Not enough Points.", "INSUFFICIENT_FUNDS", {
      required: pricing.price,
      balance,
      missing: pricing.price - balance,
    });
  }
}

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  if (isCharacterProxyEnabled()) {
    await proxyCharacterJson(req, res, "/api/character/start");
    return;
  }

  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }

  const session = getSessionFromRequest(req);
  if (!session) {
    json(res, 401, { error: "Unauthorized." });
    return;
  }

  try {
    // Read the body before anything awaits on storage: the request stream is
    // still unread at this point, and parsing it later can miss the payload.
    const body = await parseJsonBody(req);
    const creatureType = body.creatureType || body.archetype || "";
    const expectedPrice = body.expectedPrice;

    const profile = await getWalletProfile(session.wallet);
    const cfg = await getEconomyConfig();
    const isAdmin = isAdminWallet(session.wallet);
    ensurePrepaidCreations(profile, cfg);

    const pointsPerUsd = resolvePointsPerUsd(await readQuote(), cfg);
    const pricing = priceForNextPet(profile, cfg, pointsPerUsd);

    // Администраторы создают питомцев бесплатно и без ограничения: это нужно,
    // чтобы проверять генерацию на проде.
    if (!isAdmin) {
      assertAffordable(pricing, profile, expectedPrice);
    }

    // Every start is a paid generation (one image plus two text calls), and the
    // cap above only counts saved characters — a wallet that keeps an
    // unfinished draft would otherwise redraw its pet for free on every call.
    // Уже оплаченный черновик возвращается как есть, второй раз не списываем.
    // Оплаченный черновик не истекает: игрок заплатил, значит вернётся и
    // достроит. Срок в сутки остаётся только у бесплатного, чтобы кошелёк с
    // брошенным первым питомцем мог начать заново.
    const pendingDraft = profile.draft;
    const pendingPaid = pendingDraft && Number(pendingDraft.chargedPoints) > 0;
    if (pendingDraft && (pendingPaid || !isDraftExpired(pendingDraft)) && !isAdmin) {
      console.log(
        "[character:start]",
        JSON.stringify({
          wallet: session.wallet,
          characterId: pendingDraft.id,
          creatureType: pendingDraft.creatureType,
          resumedDraft: true,
        })
      );

      json(res, 200, {
        draft: serializeCharacterRecord(pendingDraft),
        characters: profile.characters.map(serializeCharacterRecord),
        charged: 0,
        resumed: true,
        currency: normalizeCurrency(profile.currency),
      });
      return;
    }

    const draft = await buildCharacterDraft(creatureType, createImageStore());

    // Списание и сохранение питомца — одна запись профиля: если генерация выше
    // упала, сюда мы не дошли и Points остались у игрока. Баланс перепроверяем
    // внутри мутации, потому что между проверкой и записью он мог измениться в
    // другой вкладке.
    let charged = 0;
    const nextProfile = await updateWalletProfile(session.wallet, (current) => {
      ensurePrepaidCreations(current, cfg);
      const freshPricing = priceForNextPet(current, cfg, pointsPerUsd);

      if (!isAdmin) {
        assertAffordable(freshPricing, current, undefined);

        if (freshPricing.price > 0) {
          charged = debitCurrency(current, freshPricing.price);
          recordSpend(current, { points: charged, reason: "pet_creation", ref: draft.id });
        } else if (freshPricing.freeReason === "prepaid") {
          current.prepaidCreations = Math.max(0, Number(current.prepaidCreations) - 1);
        }
        // Бесплатное создание помечается израсходованным при завершении
        // питомца (create.js), а не здесь: иначе игрок, бросивший первого
        // питомца на полпути, остался бы и без него, и без бесплатной попытки.
      }

      current.draft = {
        ...draft,
        chargedPoints: charged,
        wallet: session.wallet,
        walletName: session.walletName,
        updatedAt: new Date().toISOString(),
      };
      return current;
    });

    // Очередь на сжигание живёт в состоянии токена, отдельно от профиля. Она
    // обновляется после успешной записи: при сбое очередь отстанет в меньшую
    // сторону, и это безопаснее, чем сжечь больше, чем потрачено.
    if (charged > 0) {
      await withTokenState((state) =>
        addSpend(state, { points: charged, reason: "pet_creation" })
      ).catch((error) => {
        console.warn("[character:start]", `burn queue not updated: ${error.message}`);
      });
    }

    console.log(
      "[character:start]",
      JSON.stringify({
        wallet: session.wallet,
        characterId: draft.id,
        creatureType: draft.creatureType,
        charged,
        nameProvider: draft.generation?.nameProvider || "unknown",
        powersProvider: draft.generation?.powersProvider || "unknown",
        imageProvider: draft.generation?.imageProvider || "unknown",
        nameError: draft.generation?.nameError || null,
        powersError: draft.generation?.powersError || null,
        imageError: draft.generation?.imageError || null,
      })
    );

    json(res, 200, {
      draft: serializeCharacterRecord(nextProfile.draft),
      characters: nextProfile.characters.map(serializeCharacterRecord),
      charged,
      balance: normalizeCurrency(nextProfile.currency).balance,
      // Клиент обновляет баланс в шапке по этому полю: после платного создания
      // цифра должна поменяться сразу, без перезагрузки.
      currency: normalizeCurrency(nextProfile.currency),
    });
  } catch (error) {
    if (error.httpStatus) {
      const payload = { error: error.message, code: error.httpCode };
      for (const key of ["required", "balance", "missing", "price", "priceUsd", "maxPets"]) {
        if (error[key] != null) payload[key] = error[key];
      }
      json(res, error.httpStatus, payload);
      return;
    }
    json(res, 400, { error: error.message || "Bad request." });
  }
};
