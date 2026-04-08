/**
 * Attestly smart contract ABI.
 *
 * Derived from IAttestly interface in the blockchain verification design spec.
 * Replace with auto-generated ABI from Hardhat compilation once available.
 */
export const attestlyAbi = [
  // Events
  {
    type: "event",
    name: "SurveyPublished",
    inputs: [
      { name: "surveyHash", type: "bytes32", indexed: true },
      { name: "ipfsCid", type: "string", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ResponseSubmitted",
    inputs: [
      { name: "surveyHash", type: "bytes32", indexed: true },
      { name: "blindedId", type: "bytes32", indexed: true },
      { name: "ipfsCid", type: "string", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "SurveyClosed",
    inputs: [
      { name: "surveyHash", type: "bytes32", indexed: true },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },

  // State-changing functions
  {
    type: "function",
    name: "publishSurvey",
    inputs: [
      { name: "surveyHash", type: "bytes32" },
      { name: "ipfsCid", type: "string" },
      { name: "creator", type: "address" },
      { name: "title", type: "string" },
      { name: "slug", type: "string" },
      { name: "questionCount", type: "uint8" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "submitResponse",
    inputs: [
      { name: "surveyHash", type: "bytes32" },
      { name: "blindedId", type: "bytes32" },
      { name: "ipfsCid", type: "string" },
      { name: "answerCount", type: "uint8" },
      { name: "answersHash", type: "bytes32" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "closeSurvey",
    inputs: [
      { name: "surveyHash", type: "bytes32" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },

  // View functions
  {
    type: "function",
    name: "getSurvey",
    inputs: [{ name: "surveyHash", type: "bytes32" }],
    outputs: [
      { name: "creator", type: "address" },
      { name: "publishedAt", type: "uint256" },
      { name: "closed", type: "bool" },
      { name: "closedAt", type: "uint256" },
      { name: "responseCount", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isResponseSubmitted",
    inputs: [
      { name: "surveyHash", type: "bytes32" },
      { name: "blindedId", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getResponseCount",
    inputs: [{ name: "surveyHash", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;
