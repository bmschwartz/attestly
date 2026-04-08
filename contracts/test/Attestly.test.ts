import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import {
  type Address,
  keccak256,
  toHex,
  encodeFunctionData,
  zeroAddress,
} from "viem";

import {
  signPublishSurvey,
  signSubmitResponse,
  signCloseSurvey,
  computeBlindedId,
} from "./helpers/eip712.js";
import {
  setViem,
  deployAttestation,
  deployWithPublishedSurvey,
  deployWithOneResponse,
  TEST_SURVEY_HASH,
  TEST_TITLE,
  TEST_SLUG,
  TEST_QUESTION_COUNT,
  TEST_IPFS_CID,
  TEST_RESPONSE_IPFS_CID,
  TEST_ANSWERS_HASH,
  TEST_ANSWER_COUNT,
} from "./helpers/fixtures.js";

const { viem, networkHelpers } = await network.connect();

// Wire up viem for fixtures
setViem(viem, networkHelpers);

// ─────────────────────────────────────────────────────
// publishSurvey
// ─────────────────────────────────────────────────────
describe("publishSurvey", () => {
  it("publishes with a valid signature", async () => {
    const { attestly, contractAddress, chainId, creator } =
      await networkHelpers.loadFixture(deployAttestation);

    const signature = await signPublishSurvey(
      creator,
      contractAddress,
      chainId,
      {
        surveyHash: TEST_SURVEY_HASH,
        title: TEST_TITLE,
        slug: TEST_SLUG,
        questionCount: TEST_QUESTION_COUNT,
        creator: creator.account.address,
      },
    );

    await attestly.write.publishSurvey([
      TEST_SURVEY_HASH,
      TEST_IPFS_CID,
      creator.account.address,
      TEST_TITLE,
      TEST_SLUG,
      TEST_QUESTION_COUNT,
      signature,
    ]);

    const survey = await attestly.read.getSurvey([TEST_SURVEY_HASH]);
    assert.equal(survey[0].toLowerCase(), creator.account.address.toLowerCase());
    assert.ok(survey[1] > 0n); // publishedAt
    assert.equal(survey[2], false); // closed
    assert.equal(survey[3], 0n); // closedAt
    assert.equal(survey[4], 0n); // responseCount
  });

  it("reverts with SurveyAlreadyExists on duplicate hash", async () => {
    const { attestly, contractAddress, chainId, creator } =
      await networkHelpers.loadFixture(deployAttestation);

    const signature = await signPublishSurvey(
      creator,
      contractAddress,
      chainId,
      {
        surveyHash: TEST_SURVEY_HASH,
        title: TEST_TITLE,
        slug: TEST_SLUG,
        questionCount: TEST_QUESTION_COUNT,
        creator: creator.account.address,
      },
    );

    await attestly.write.publishSurvey([
      TEST_SURVEY_HASH,
      TEST_IPFS_CID,
      creator.account.address,
      TEST_TITLE,
      TEST_SLUG,
      TEST_QUESTION_COUNT,
      signature,
    ]);

    // Second publish with same hash should revert
    await viem.assertions.revertWithCustomError(
      attestly.write.publishSurvey([
        TEST_SURVEY_HASH,
        TEST_IPFS_CID,
        creator.account.address,
        TEST_TITLE,
        TEST_SLUG,
        TEST_QUESTION_COUNT,
        signature,
      ]),
      attestly,
      "SurveyAlreadyExists",
    );
  });

  it("reverts with SignerMismatch when wrong signer", async () => {
    const { attestly, contractAddress, chainId, creator, stranger } =
      await networkHelpers.loadFixture(deployAttestation);

    // Stranger signs, but we claim creator is the creator
    const signature = await signPublishSurvey(
      stranger,
      contractAddress,
      chainId,
      {
        surveyHash: TEST_SURVEY_HASH,
        title: TEST_TITLE,
        slug: TEST_SLUG,
        questionCount: TEST_QUESTION_COUNT,
        creator: creator.account.address,
      },
    );

    await viem.assertions.revertWithCustomError(
      attestly.write.publishSurvey([
        TEST_SURVEY_HASH,
        TEST_IPFS_CID,
        creator.account.address,
        TEST_TITLE,
        TEST_SLUG,
        TEST_QUESTION_COUNT,
        signature,
      ]),
      attestly,
      "SignerMismatch",
    );
  });
});

// ─────────────────────────────────────────────────────
// submitResponse
// ─────────────────────────────────────────────────────
describe("submitResponse", () => {
  it("accepts a valid response submission", async () => {
    const { attestly, contractAddress, chainId, respondent1 } =
      await networkHelpers.loadFixture(deployWithPublishedSurvey);

    const blindedId = computeBlindedId(
      respondent1.account.address,
      TEST_SURVEY_HASH,
    );

    const signature = await signSubmitResponse(
      respondent1,
      contractAddress,
      chainId,
      {
        surveyHash: TEST_SURVEY_HASH,
        blindedId,
        answerCount: TEST_ANSWER_COUNT,
        answersHash: TEST_ANSWERS_HASH,
      },
    );

    await attestly.write.submitResponse([
      TEST_SURVEY_HASH,
      blindedId,
      TEST_RESPONSE_IPFS_CID,
      TEST_ANSWER_COUNT,
      TEST_ANSWERS_HASH,
      signature,
    ]);

    const count = await attestly.read.getResponseCount([TEST_SURVEY_HASH]);
    assert.equal(count, 1n);

    const submitted = await attestly.read.isResponseSubmitted([
      TEST_SURVEY_HASH,
      blindedId,
    ]);
    assert.ok(submitted);
  });

  it("reverts with DuplicateResponse on duplicate blinded ID", async () => {
    const { attestly, contractAddress, chainId, respondent1 } =
      await networkHelpers.loadFixture(deployWithOneResponse);

    const blindedId = computeBlindedId(
      respondent1.account.address,
      TEST_SURVEY_HASH,
    );

    // Try submitting again with same respondent
    const signature = await signSubmitResponse(
      respondent1,
      contractAddress,
      chainId,
      {
        surveyHash: TEST_SURVEY_HASH,
        blindedId,
        answerCount: TEST_ANSWER_COUNT,
        answersHash: TEST_ANSWERS_HASH,
      },
    );

    await viem.assertions.revertWithCustomError(
      attestly.write.submitResponse([
        TEST_SURVEY_HASH,
        blindedId,
        TEST_RESPONSE_IPFS_CID,
        TEST_ANSWER_COUNT,
        TEST_ANSWERS_HASH,
        signature,
      ]),
      attestly,
      "DuplicateResponse",
    );
  });

  it("reverts with SurveyNotFound for nonexistent survey", async () => {
    const { attestly, contractAddress, chainId, respondent1 } =
      await networkHelpers.loadFixture(deployAttestation);

    const fakeSurveyHash = keccak256(toHex("nonexistent-survey"));
    const blindedId = computeBlindedId(
      respondent1.account.address,
      fakeSurveyHash,
    );

    const signature = await signSubmitResponse(
      respondent1,
      contractAddress,
      chainId,
      {
        surveyHash: fakeSurveyHash,
        blindedId,
        answerCount: TEST_ANSWER_COUNT,
        answersHash: TEST_ANSWERS_HASH,
      },
    );

    await viem.assertions.revertWithCustomError(
      attestly.write.submitResponse([
        fakeSurveyHash,
        blindedId,
        TEST_RESPONSE_IPFS_CID,
        TEST_ANSWER_COUNT,
        TEST_ANSWERS_HASH,
        signature,
      ]),
      attestly,
      "SurveyNotFound",
    );
  });

  it("reverts with SurveyAlreadyClosed on closed survey", async () => {
    const { attestly, contractAddress, chainId, creator, respondent1 } =
      await networkHelpers.loadFixture(deployWithPublishedSurvey);

    // Close the survey first
    const closeSig = await signCloseSurvey(
      creator,
      contractAddress,
      chainId,
      { surveyHash: TEST_SURVEY_HASH },
    );
    await attestly.write.closeSurvey([TEST_SURVEY_HASH, closeSig]);

    // Now try to submit a response
    const blindedId = computeBlindedId(
      respondent1.account.address,
      TEST_SURVEY_HASH,
    );
    const signature = await signSubmitResponse(
      respondent1,
      contractAddress,
      chainId,
      {
        surveyHash: TEST_SURVEY_HASH,
        blindedId,
        answerCount: TEST_ANSWER_COUNT,
        answersHash: TEST_ANSWERS_HASH,
      },
    );

    await viem.assertions.revertWithCustomError(
      attestly.write.submitResponse([
        TEST_SURVEY_HASH,
        blindedId,
        TEST_RESPONSE_IPFS_CID,
        TEST_ANSWER_COUNT,
        TEST_ANSWERS_HASH,
        signature,
      ]),
      attestly,
      "SurveyAlreadyClosed",
    );
  });

  it("reverts with BlindedIdMismatch when wrong blinded ID", async () => {
    const { attestly, contractAddress, chainId, respondent1, stranger } =
      await networkHelpers.loadFixture(deployWithPublishedSurvey);

    // Compute blinded ID for stranger but sign as respondent1
    const wrongBlindedId = computeBlindedId(
      stranger.account.address,
      TEST_SURVEY_HASH,
    );

    const signature = await signSubmitResponse(
      respondent1,
      contractAddress,
      chainId,
      {
        surveyHash: TEST_SURVEY_HASH,
        blindedId: wrongBlindedId,
        answerCount: TEST_ANSWER_COUNT,
        answersHash: TEST_ANSWERS_HASH,
      },
    );

    await viem.assertions.revertWithCustomError(
      attestly.write.submitResponse([
        TEST_SURVEY_HASH,
        wrongBlindedId,
        TEST_RESPONSE_IPFS_CID,
        TEST_ANSWER_COUNT,
        TEST_ANSWERS_HASH,
        signature,
      ]),
      attestly,
      "BlindedIdMismatch",
    );
  });

  it("allows multiple different respondents to submit", async () => {
    const { attestly, contractAddress, chainId, respondent1, respondent2 } =
      await networkHelpers.loadFixture(deployWithPublishedSurvey);

    // Respondent 1
    const blindedId1 = computeBlindedId(
      respondent1.account.address,
      TEST_SURVEY_HASH,
    );
    const sig1 = await signSubmitResponse(
      respondent1,
      contractAddress,
      chainId,
      {
        surveyHash: TEST_SURVEY_HASH,
        blindedId: blindedId1,
        answerCount: TEST_ANSWER_COUNT,
        answersHash: TEST_ANSWERS_HASH,
      },
    );
    await attestly.write.submitResponse([
      TEST_SURVEY_HASH,
      blindedId1,
      TEST_RESPONSE_IPFS_CID,
      TEST_ANSWER_COUNT,
      TEST_ANSWERS_HASH,
      sig1,
    ]);

    // Respondent 2
    const blindedId2 = computeBlindedId(
      respondent2.account.address,
      TEST_SURVEY_HASH,
    );
    const sig2 = await signSubmitResponse(
      respondent2,
      contractAddress,
      chainId,
      {
        surveyHash: TEST_SURVEY_HASH,
        blindedId: blindedId2,
        answerCount: TEST_ANSWER_COUNT,
        answersHash: TEST_ANSWERS_HASH,
      },
    );
    await attestly.write.submitResponse([
      TEST_SURVEY_HASH,
      blindedId2,
      TEST_RESPONSE_IPFS_CID,
      TEST_ANSWER_COUNT,
      TEST_ANSWERS_HASH,
      sig2,
    ]);

    const count = await attestly.read.getResponseCount([TEST_SURVEY_HASH]);
    assert.equal(count, 2n);
  });
});

// ─────────────────────────────────────────────────────
// closeSurvey
// ─────────────────────────────────────────────────────
describe("closeSurvey", () => {
  it("allows creator to close survey", async () => {
    const { attestly, contractAddress, chainId, creator } =
      await networkHelpers.loadFixture(deployWithPublishedSurvey);

    const signature = await signCloseSurvey(
      creator,
      contractAddress,
      chainId,
      { surveyHash: TEST_SURVEY_HASH },
    );

    await attestly.write.closeSurvey([TEST_SURVEY_HASH, signature]);

    const survey = await attestly.read.getSurvey([TEST_SURVEY_HASH]);
    assert.equal(survey[2], true); // closed
    assert.ok(survey[3] > 0n); // closedAt
  });

  it("reverts with SignerMismatch when non-creator tries to close", async () => {
    const { attestly, contractAddress, chainId, stranger } =
      await networkHelpers.loadFixture(deployWithPublishedSurvey);

    const signature = await signCloseSurvey(
      stranger,
      contractAddress,
      chainId,
      { surveyHash: TEST_SURVEY_HASH },
    );

    await viem.assertions.revertWithCustomError(
      attestly.write.closeSurvey([TEST_SURVEY_HASH, signature]),
      attestly,
      "SignerMismatch",
    );
  });

  it("reverts with SurveyAlreadyClosed on double close", async () => {
    const { attestly, contractAddress, chainId, creator } =
      await networkHelpers.loadFixture(deployWithPublishedSurvey);

    const signature = await signCloseSurvey(
      creator,
      contractAddress,
      chainId,
      { surveyHash: TEST_SURVEY_HASH },
    );

    await attestly.write.closeSurvey([TEST_SURVEY_HASH, signature]);

    await viem.assertions.revertWithCustomError(
      attestly.write.closeSurvey([TEST_SURVEY_HASH, signature]),
      attestly,
      "SurveyAlreadyClosed",
    );
  });

  it("reverts with SurveyNotFound for nonexistent survey", async () => {
    const { attestly, contractAddress, chainId, creator } =
      await networkHelpers.loadFixture(deployAttestation);

    const fakeSurveyHash = keccak256(toHex("nonexistent-survey"));
    const signature = await signCloseSurvey(
      creator,
      contractAddress,
      chainId,
      { surveyHash: fakeSurveyHash },
    );

    await viem.assertions.revertWithCustomError(
      attestly.write.closeSurvey([fakeSurveyHash, signature]),
      attestly,
      "SurveyNotFound",
    );
  });
});

// ─────────────────────────────────────────────────────
// View functions
// ─────────────────────────────────────────────────────
describe("View functions", () => {
  it("getSurvey returns correct data after publish", async () => {
    const { attestly, creator } =
      await networkHelpers.loadFixture(deployWithPublishedSurvey);

    const survey = await attestly.read.getSurvey([TEST_SURVEY_HASH]);
    assert.equal(survey[0].toLowerCase(), creator.account.address.toLowerCase());
    assert.ok(survey[1] > 0n);
    assert.equal(survey[2], false);
    assert.equal(survey[3], 0n);
    assert.equal(survey[4], 0n);
  });

  it("getSurvey returns zeroes for nonexistent survey", async () => {
    const { attestly } =
      await networkHelpers.loadFixture(deployAttestation);

    const fakeSurveyHash = keccak256(toHex("does-not-exist"));
    const survey = await attestly.read.getSurvey([fakeSurveyHash]);
    assert.equal(survey[0], zeroAddress);
    assert.equal(survey[1], 0n);
    assert.equal(survey[2], false);
    assert.equal(survey[3], 0n);
    assert.equal(survey[4], 0n);
  });

  it("getResponseCount increments correctly", async () => {
    const { attestly, contractAddress, chainId, respondent1, respondent2 } =
      await networkHelpers.loadFixture(deployWithPublishedSurvey);

    assert.equal(
      await attestly.read.getResponseCount([TEST_SURVEY_HASH]),
      0n,
    );

    // Submit response from respondent1
    const blindedId1 = computeBlindedId(
      respondent1.account.address,
      TEST_SURVEY_HASH,
    );
    const sig1 = await signSubmitResponse(
      respondent1,
      contractAddress,
      chainId,
      {
        surveyHash: TEST_SURVEY_HASH,
        blindedId: blindedId1,
        answerCount: TEST_ANSWER_COUNT,
        answersHash: TEST_ANSWERS_HASH,
      },
    );
    await attestly.write.submitResponse([
      TEST_SURVEY_HASH,
      blindedId1,
      TEST_RESPONSE_IPFS_CID,
      TEST_ANSWER_COUNT,
      TEST_ANSWERS_HASH,
      sig1,
    ]);

    assert.equal(
      await attestly.read.getResponseCount([TEST_SURVEY_HASH]),
      1n,
    );

    // Submit response from respondent2
    const blindedId2 = computeBlindedId(
      respondent2.account.address,
      TEST_SURVEY_HASH,
    );
    const sig2 = await signSubmitResponse(
      respondent2,
      contractAddress,
      chainId,
      {
        surveyHash: TEST_SURVEY_HASH,
        blindedId: blindedId2,
        answerCount: TEST_ANSWER_COUNT,
        answersHash: TEST_ANSWERS_HASH,
      },
    );
    await attestly.write.submitResponse([
      TEST_SURVEY_HASH,
      blindedId2,
      TEST_RESPONSE_IPFS_CID,
      TEST_ANSWER_COUNT,
      TEST_ANSWERS_HASH,
      sig2,
    ]);

    assert.equal(
      await attestly.read.getResponseCount([TEST_SURVEY_HASH]),
      2n,
    );
  });

  it("isResponseSubmitted returns correct values", async () => {
    const { attestly, respondent1, respondent2 } =
      await networkHelpers.loadFixture(deployWithOneResponse);

    const blindedId1 = computeBlindedId(
      respondent1.account.address,
      TEST_SURVEY_HASH,
    );
    const blindedId2 = computeBlindedId(
      respondent2.account.address,
      TEST_SURVEY_HASH,
    );

    assert.ok(
      await attestly.read.isResponseSubmitted([TEST_SURVEY_HASH, blindedId1]),
    );
    assert.ok(
      !(await attestly.read.isResponseSubmitted([
        TEST_SURVEY_HASH,
        blindedId2,
      ])),
    );
  });
});

// ─────────────────────────────────────────────────────
// EIP-712
// ─────────────────────────────────────────────────────
describe("EIP-712", () => {
  it("accepts signature created via signTypedData", async () => {
    const { attestly, contractAddress, chainId, creator } =
      await networkHelpers.loadFixture(deployAttestation);

    // This is essentially the same as publishSurvey valid test,
    // but explicitly tests the EIP-712 flow
    const signature = await signPublishSurvey(
      creator,
      contractAddress,
      chainId,
      {
        surveyHash: TEST_SURVEY_HASH,
        title: TEST_TITLE,
        slug: TEST_SLUG,
        questionCount: TEST_QUESTION_COUNT,
        creator: creator.account.address,
      },
    );

    // Should not revert
    await attestly.write.publishSurvey([
      TEST_SURVEY_HASH,
      TEST_IPFS_CID,
      creator.account.address,
      TEST_TITLE,
      TEST_SLUG,
      TEST_QUESTION_COUNT,
      signature,
    ]);

    const survey = await attestly.read.getSurvey([TEST_SURVEY_HASH]);
    assert.ok(survey[1] > 0n);
  });

  it("rejects signature with wrong domain (wrong contract address)", async () => {
    const { attestly, chainId, creator } =
      await networkHelpers.loadFixture(deployAttestation);

    // Sign with a wrong contract address (random address)
    const wrongAddress = "0x1234567890123456789012345678901234567890" as Address;
    const signature = await signPublishSurvey(
      creator,
      wrongAddress,
      chainId,
      {
        surveyHash: TEST_SURVEY_HASH,
        title: TEST_TITLE,
        slug: TEST_SLUG,
        questionCount: TEST_QUESTION_COUNT,
        creator: creator.account.address,
      },
    );

    await viem.assertions.revertWithCustomError(
      attestly.write.publishSurvey([
        TEST_SURVEY_HASH,
        TEST_IPFS_CID,
        creator.account.address,
        TEST_TITLE,
        TEST_SLUG,
        TEST_QUESTION_COUNT,
        signature,
      ]),
      attestly,
      "SignerMismatch",
    );
  });
});

// ─────────────────────────────────────────────────────
// UUPS
// ─────────────────────────────────────────────────────
describe("UUPS", () => {
  it("allows owner to upgrade", async () => {
    const { attestly, contractAddress, owner } =
      await networkHelpers.loadFixture(deployAttestation);

    // Deploy new implementation (AttestlyV2)
    const newImpl = await viem.deployContract("AttestlyV2");

    // Call upgradeToAndCall via the proxy as owner
    await attestly.write.upgradeToAndCall([newImpl.address, "0x"], {
      account: owner.account,
    });

    // Get V2 interface at same proxy address
    const v2 = await viem.getContractAt("AttestlyV2", contractAddress);
    const ver = await v2.read.version();
    assert.equal(ver, 2n);
  });

  it("reverts when non-owner tries to upgrade", async () => {
    const { attestly, stranger } =
      await networkHelpers.loadFixture(deployAttestation);

    const newImpl = await viem.deployContract("AttestlyV2");

    await viem.assertions.revertWithCustomError(
      attestly.write.upgradeToAndCall([newImpl.address, "0x"], {
        account: stranger.account,
      }),
      attestly,
      "OwnableUnauthorizedAccount",
    );
  });
});

// ─────────────────────────────────────────────────────
// Full lifecycle
// ─────────────────────────────────────────────────────
describe("Full lifecycle", () => {
  it("publish → 2 responses → close → verify state → late response rejected", async () => {
    const { attestly, contractAddress, chainId, creator, respondent1, respondent2 } =
      await networkHelpers.loadFixture(deployAttestation);

    // 1. Publish survey
    const publishSig = await signPublishSurvey(
      creator,
      contractAddress,
      chainId,
      {
        surveyHash: TEST_SURVEY_HASH,
        title: TEST_TITLE,
        slug: TEST_SLUG,
        questionCount: TEST_QUESTION_COUNT,
        creator: creator.account.address,
      },
    );
    await attestly.write.publishSurvey([
      TEST_SURVEY_HASH,
      TEST_IPFS_CID,
      creator.account.address,
      TEST_TITLE,
      TEST_SLUG,
      TEST_QUESTION_COUNT,
      publishSig,
    ]);

    // 2. Submit response from respondent1
    const blindedId1 = computeBlindedId(
      respondent1.account.address,
      TEST_SURVEY_HASH,
    );
    const respSig1 = await signSubmitResponse(
      respondent1,
      contractAddress,
      chainId,
      {
        surveyHash: TEST_SURVEY_HASH,
        blindedId: blindedId1,
        answerCount: TEST_ANSWER_COUNT,
        answersHash: TEST_ANSWERS_HASH,
      },
    );
    await attestly.write.submitResponse([
      TEST_SURVEY_HASH,
      blindedId1,
      TEST_RESPONSE_IPFS_CID,
      TEST_ANSWER_COUNT,
      TEST_ANSWERS_HASH,
      respSig1,
    ]);

    // 3. Submit response from respondent2
    const blindedId2 = computeBlindedId(
      respondent2.account.address,
      TEST_SURVEY_HASH,
    );
    const respSig2 = await signSubmitResponse(
      respondent2,
      contractAddress,
      chainId,
      {
        surveyHash: TEST_SURVEY_HASH,
        blindedId: blindedId2,
        answerCount: TEST_ANSWER_COUNT,
        answersHash: TEST_ANSWERS_HASH,
      },
    );
    await attestly.write.submitResponse([
      TEST_SURVEY_HASH,
      blindedId2,
      TEST_RESPONSE_IPFS_CID,
      TEST_ANSWER_COUNT,
      TEST_ANSWERS_HASH,
      respSig2,
    ]);

    // 4. Close survey
    const closeSig = await signCloseSurvey(
      creator,
      contractAddress,
      chainId,
      { surveyHash: TEST_SURVEY_HASH },
    );
    await attestly.write.closeSurvey([TEST_SURVEY_HASH, closeSig]);

    // 5. Verify final state
    const survey = await attestly.read.getSurvey([TEST_SURVEY_HASH]);
    assert.equal(survey[0].toLowerCase(), creator.account.address.toLowerCase());
    assert.equal(survey[2], true); // closed
    assert.ok(survey[3] > 0n); // closedAt
    assert.equal(survey[4], 2n); // responseCount

    assert.ok(
      await attestly.read.isResponseSubmitted([TEST_SURVEY_HASH, blindedId1]),
    );
    assert.ok(
      await attestly.read.isResponseSubmitted([TEST_SURVEY_HASH, blindedId2]),
    );

    // 6. Late response should be rejected
    const wallets = await viem.getWalletClients();
    const lateRespondent = wallets[4]!; // stranger wallet (index 4)

    const lateBlindedId = computeBlindedId(
      lateRespondent.account.address,
      TEST_SURVEY_HASH,
    );
    const lateSig = await signSubmitResponse(
      lateRespondent,
      contractAddress,
      chainId,
      {
        surveyHash: TEST_SURVEY_HASH,
        blindedId: lateBlindedId,
        answerCount: TEST_ANSWER_COUNT,
        answersHash: TEST_ANSWERS_HASH,
      },
    );

    await viem.assertions.revertWithCustomError(
      attestly.write.submitResponse([
        TEST_SURVEY_HASH,
        lateBlindedId,
        TEST_RESPONSE_IPFS_CID,
        TEST_ANSWER_COUNT,
        TEST_ANSWERS_HASH,
        lateSig,
      ]),
      attestly,
      "SurveyAlreadyClosed",
    );
  });
});
