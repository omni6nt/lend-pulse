/**
 * This file contains external contract definitions (contracts not deployed by this project).
 * Add entries here to interact with pre-deployed contracts on any supported chain.
 */
import { GenericContractsDeclaration } from "~~/utils/scaffold-hbar/contract";

const externalContracts = {
  296: {
    BonzoDataProvider: {
      address: "0x121A2AFFA5f595175E60E01EAeF0deC43Cc3b024",
      abi: [
        {
          inputs: [],
          name: "getAllReservesTokens",
          outputs: [
            {
              components: [
                { internalType: "string", name: "symbol", type: "string" },
                { internalType: "address", name: "tokenAddress", type: "address" },
              ],
              internalType: "struct IBonzoDataProvider.TokenData[]",
              name: "",
              type: "tuple[]",
            },
          ],
          stateMutability: "view",
          type: "function",
        },
        {
          inputs: [
            { internalType: "address", name: "asset", type: "address" },
            { internalType: "address", name: "user", type: "address" },
          ],
          name: "getUserReserveData",
          outputs: [
            { internalType: "uint256", name: "currentATokenBalance", type: "uint256" },
            { internalType: "uint256", name: "currentStableDebt", type: "uint256" },
            { internalType: "uint256", name: "currentVariableDebt", type: "uint256" },
            { internalType: "uint256", name: "principalStableDebt", type: "uint256" },
            { internalType: "uint256", name: "scaledVariableDebt", type: "uint256" },
            { internalType: "uint256", name: "stableBorrowRate", type: "uint256" },
            { internalType: "uint256", name: "liquidityRate", type: "uint256" },
            { internalType: "uint40", name: "stableRateLastUpdated", type: "uint40" },
            { internalType: "bool", name: "usageAsCollateralEnabled", type: "bool" },
          ],
          stateMutability: "view",
          type: "function",
        },
        {
          inputs: [{ internalType: "address", name: "asset", type: "address" }],
          name: "getReserveData",
          outputs: [
            { internalType: "uint256", name: "availableLiquidity", type: "uint256" },
            { internalType: "uint256", name: "totalStableDebt", type: "uint256" },
            { internalType: "uint256", name: "totalVariableDebt", type: "uint256" },
            { internalType: "uint256", name: "liquidityRate", type: "uint256" },
            { internalType: "uint256", name: "variableBorrowRate", type: "uint256" },
            { internalType: "uint256", name: "stableBorrowRate", type: "uint256" },
            { internalType: "uint256", name: "averageStableBorrowRate", type: "uint256" },
            { internalType: "uint256", name: "liquidityIndex", type: "uint256" },
            { internalType: "uint256", name: "variableBorrowIndex", type: "uint256" },
            { internalType: "uint40", name: "lastUpdateTimestamp", type: "uint40" },
          ],
          stateMutability: "view",
          type: "function",
        },
        {
          inputs: [{ internalType: "address", name: "asset", type: "address" }],
          name: "getReserveConfigurationData",
          outputs: [
            { internalType: "uint256", name: "decimals", type: "uint256" },
            { internalType: "uint256", name: "ltv", type: "uint256" },
            { internalType: "uint256", name: "liquidationThreshold", type: "uint256" },
            { internalType: "uint256", name: "liquidationBonus", type: "uint256" },
            { internalType: "uint256", name: "reserveFactor", type: "uint256" },
            { internalType: "bool", name: "usageAsCollateralEnabled", type: "bool" },
            { internalType: "bool", name: "borrowingEnabled", type: "bool" },
            { internalType: "bool", name: "stableBorrowRateEnabled", type: "bool" },
            { internalType: "bool", name: "isActive", type: "bool" },
            { internalType: "bool", name: "isFrozen", type: "bool" },
          ],
          stateMutability: "view",
          type: "function",
        },
      ],
    },
    BonzoLendingPool: {
      address: "0xf67DBe9bD1B331cA379c44b5562EAa1CE831EbC2",
      abi: [
        {
          inputs: [{ internalType: "address", name: "user", type: "address" }],
          name: "getUserAccountData",
          outputs: [
            { internalType: "uint256", name: "totalCollateralETH", type: "uint256" },
            { internalType: "uint256", name: "totalDebtETH", type: "uint256" },
            { internalType: "uint256", name: "availableBorrowsETH", type: "uint256" },
            { internalType: "uint256", name: "currentLiquidationThreshold", type: "uint256" },
            { internalType: "uint256", name: "ltv", type: "uint256" },
            { internalType: "uint256", name: "healthFactor", type: "uint256" },
          ],
          stateMutability: "view",
          type: "function",
        },
      ],
    },
  },
} as const;

export default externalContracts satisfies GenericContractsDeclaration;
