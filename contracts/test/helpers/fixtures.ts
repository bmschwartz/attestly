/**
 * Shared test fixtures for Attestly contract tests.
 * Deploys UUPS proxy manually (implementation + ERC1967Proxy + initialize).
 */
import { type Address, type GetContractReturnType, encodeFunctionData, keccak256, toHex } from "viem";
import {
  signPublishSurvey,
  signSubmitResponse,
  computeBlindedId,
} from "./eip712.js";

// These will be set by the test file after network.connect()
let _viem: any;
let _networkHelpers: any;

export function setViem(v: any, nh: any) {
  _viem = v;
  _networkHelpers = nh;
}

// Test constants
export const TEST_SURVEY_HASH = keccak256(toHex("test-survey-content-v1"));
export const TEST_TITLE = "Test Survey";
export const TEST_SLUG = "test-survey";
export const TEST_QUESTION_COUNT = 5;
export const TEST_IPFS_CID = "QmTestSurveyCid123456789";
export const TEST_RESPONSE_IPFS_CID = "QmTestResponseCid123456789";
export const TEST_ANSWERS_HASH = keccak256(toHex("test-answers-content-v1"));
export const TEST_ANSWER_COUNT = 5;

/**
 * Deploy a fresh Attestly proxy via UUPS pattern (manual deployment).
 * 1. Deploy implementation contract
 * 2. Encode initialize(owner) calldata
 * 3. Deploy ERC1967Proxy(implementation, initData)
 * 4. Get Attestly interface at proxy address
 */
export async function deployAttestation() {
  const [owner, creator, respondent1, respondent2, stranger] =
    await _viem.getWalletClients();

  // Deploy implementation
  const implementation = await _viem.deployContract("Attestly");

  // Encode initialize calldata
  const initData = encodeFunctionData({
    abi: implementation.abi,
    functionName: "initialize",
    args: [owner.account.address],
  });

  // Deploy TestERC1967Proxy pointing to implementation with init calldata
  const proxy = await _viem.deployContract("TestERC1967Proxy", [
    implementation.address,
    initData,
  ]);

  // Get Attestly interface at proxy address
  const attestly = await _viem.getContractAt("Attestly", proxy.address);

  const publicClient = await _viem.getPublicClient();
  const chainId = await publicClient.getChainId();

  return {
    attestly,
    contractAddress: proxy.address as Address,
    chainId,
    owner,
    creator,
    respondent1,
    respondent2,
    stranger,
  };
}

/**
 * Deploy + publish a test survey.
 */
export async function deployWithPublishedSurvey() {
  const base = await deployAttestation();
  const { attestly, contractAddress, chainId, creator } = base;

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

  return { ...base, signature };
}

/**
 * Deploy + publish + submit one response from respondent1.
 */
export async function deployWithOneResponse() {
  const base = await deployWithPublishedSurvey();
  const { attestly, contractAddress, chainId, respondent1 } = base;

  const blindedId = computeBlindedId(
    respondent1.account.address,
    TEST_SURVEY_HASH,
  );

  const responseSig = await signSubmitResponse(
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
    responseSig,
  ]);

  return { ...base, blindedId, responseSig };
}
