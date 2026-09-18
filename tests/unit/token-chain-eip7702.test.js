const test = require("node:test");
const assert = require("node:assert/strict");

const { createChainClient, isDeployedContractCode } = require("../../api/_lib/token-chain");

// Incident 2026-09-18: Robinhood Wallet accounts carry an EIP-7702 delegation
// designator (0xef0100 + delegate). They are people's wallets that sign their
// own transactions, so their deposits must be credited — only protocol
// contracts (Pons curve, DEX pools) are skipped.

test("isDeployedContractCode: empty code and EIP-7702 delegation are not contracts", () => {
  assert.equal(isDeployedContractCode("0x"), false);
  assert.equal(isDeployedContractCode(""), false);
  assert.equal(isDeployedContractCode(null), false);
  assert.equal(isDeployedContractCode("0xef0100" + "69007702764179f14f51cdce752f4f775d74e139"), false);
  assert.equal(isDeployedContractCode("0xEF0100" + "612373D7003D694220F7800EEAF8E3924C0951D3"), false);
});

test("isDeployedContractCode: real bytecode is a contract, even when it starts like a designator", () => {
  assert.equal(isDeployedContractCode("0x6080604052" + "00".repeat(40)), true);
  // 0xef0100 prefix but longer than 23 bytes → not a delegation designator
  assert.equal(isDeployedContractCode("0xef0100" + "00".repeat(21)), true);
  // too short to be a designator
  assert.equal(isDeployedContractCode("0xef0100" + "00".repeat(19)), true);
});

test("chain.isContract: delegated EOA → false, deployed contract → true, results cached", async () => {
  const codes = new Map([
    ["0x" + "a".repeat(40), "0xef0100" + "1".repeat(40)],
    ["0x" + "b".repeat(40), "0x60806040" + "ff".repeat(100)],
    ["0x" + "c".repeat(40), "0x"],
  ]);
  let calls = 0;
  const provider = {
    async getCode(address) {
      calls += 1;
      return codes.get(String(address).toLowerCase());
    },
  };
  const chain = createChainClient({ provider, contract: {}, signer: {} });

  assert.equal(await chain.isContract("0x" + "A".repeat(40)), false, "EIP-7702 wallet is a person");
  assert.equal(await chain.isContract("0x" + "b".repeat(40)), true, "bytecode is a contract");
  assert.equal(await chain.isContract("0x" + "c".repeat(40)), false, "plain EOA");
  assert.equal(calls, 3);

  await chain.isContract("0x" + "a".repeat(40));
  assert.equal(calls, 3, "answers are cached per address");
});
