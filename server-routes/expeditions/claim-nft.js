const { handleCors, json } = require("../../api/_lib/auth");
const { parseJsonBody } = require("../../api/_lib/auth");
const { getWalletProfile } = require("../../api/_lib/store");
const { claimTrophy } = require("../../api/_lib/expedition-nft");
const X = require("../../api/_lib/expeditions");
const { assertExpeditionsAccess, requireMethod, sendDomainError } = require("./_shared");

// POST /api/expeditions/claim-nft { bossIndex } — mint the boss trophy to the
// session wallet (3★ required). Answers { status: minted | pending, tokenId?, txHash?, progress }.
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  const access = await assertExpeditionsAccess(req, res);
  if (!access) return;
  if (!requireMethod(req, res, "POST")) return;
  const wallet = access.session.wallet;
  try {
    const body = await parseJsonBody(req);
    const bossIndex = Math.floor(Number(body?.bossIndex));
    const outcome = await claimTrophy(wallet, bossIndex);
    const profile = await getWalletProfile(wallet);
    json(res, 200, { ...outcome, progress: X.progressOf(profile, bossIndex) });
  } catch (error) {
    if (error?.code === "RPC_UNAVAILABLE") {
      json(res, 503, { error: "Chain RPC is unavailable — try again.", code: "RPC_UNAVAILABLE" });
      return;
    }
    if (sendDomainError(res, error)) return;
    console.error("[expeditions] claim-nft failed", error);
    json(res, 500, { error: "Couldn't send the NFT, try again later.", code: "MINT_FAILED" });
  }
};
