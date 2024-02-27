import { isHexString } from 'ethereumjs-util';
import { Interface, FunctionFragment } from '@ethersproject/abi';
import { BigNumber } from '@ethersproject/bignumber';
import { abiERC721, abiERC20, abiERC1155 } from '@metamask/metamask-eth-abis';
import log from 'loglevel';
import {
  TransactionMeta,
  TransactionType,
} from '@metamask/transaction-controller';
import { TransactionParams } from '@metamask/transaction-controller/dist/types';
import { Result } from '@ethersproject/abi/src.ts/coders/abstract-coder';
import { AssetType, TokenStandard } from '../constants/transaction';
import { EthQueryWithGetCode, readAddressAsContract } from './contract-utils';
import { isEqualCaseInsensitive } from './string-utils';

const INFERRABLE_TRANSACTION_TYPES: TransactionType[] = [
  TransactionType.tokenMethodApprove,
  TransactionType.tokenMethodSetApprovalForAll,
  TransactionType.tokenMethodTransfer,
  TransactionType.tokenMethodTransferFrom,
  TransactionType.contractInteraction,
  TransactionType.simpleSend,
];

type InferTransactionTypeResult = {
  // The type of transaction
  type: TransactionType;
  // The contract code, in hex format if it exists. '0x0' or '0x' are also indicators of non-existent contract code
  getCodeResponse: string | null;
};

// same as TransactionDescription from @ethersproject/abi/src.ts/interface.ts
type TransactionDescription = {
  args: Result; // The args/params to the function call. An array-like object with numerical and string indices.
  name: string; // The name of the function.
  signature: string; // The function signature.
  sighash: string; // The function signature hash.
  value: BigNumber; // The ETH value associated with the call.
  functionFragment: FunctionFragment; // The Ethers function fragment representation of the function.
};

const erc20Interface = new Interface(abiERC20);
const erc721Interface = new Interface(abiERC721);
const erc1155Interface = new Interface(abiERC1155);

/**
 * Determines if the maxFeePerGas and maxPriorityFeePerGas fields are supplied
 * and valid inputs. This will return false for non hex string inputs.
 *
 * @param transactionMeta - the transaction to check
 * @returns boolean true if transaction uses valid EIP1559 fields
 */
export function isEIP1559Transaction(
  transactionMeta: TransactionMeta,
): boolean {
  return (
    isHexString(transactionMeta?.txParams?.maxFeePerGas as string) &&
    isHexString(transactionMeta?.txParams?.maxPriorityFeePerGas as string)
  );
}

/**
 * Determine if the maxFeePerGas and maxPriorityFeePerGas fields are not
 * supplied and that the gasPrice field is valid if it is provided. This will
 * return false if gasPrice is a non hex string.
 *
 * @param transactionMeta - the transaction to check
 * @returns boolean true if transaction uses valid Legacy fields OR lacks EIP1559 fields
 */
export function isLegacyTransaction(transactionMeta: TransactionMeta): boolean {
  return (
    typeof transactionMeta.txParams.maxFeePerGas === 'undefined' &&
    typeof transactionMeta.txParams.maxPriorityFeePerGas === 'undefined' &&
    (typeof transactionMeta.txParams.gasPrice === 'undefined' ||
      isHexString(transactionMeta.txParams.gasPrice))
  );
}

/**
 * Determine if a transactions gas fees in txParams match those in its dappSuggestedGasFees property
 *
 * @param  transactionMeta - the transaction to check
 * @returns boolean - true if both the txParams and dappSuggestedGasFees are objects with truthy gas fee properties,
 * and those properties are strictly equal
 */
export function txParamsAreDappSuggested(
  transactionMeta: TransactionMeta,
): boolean {
  const { gasPrice, maxPriorityFeePerGas, maxFeePerGas } =
    transactionMeta?.txParams || {};
  return (
    (gasPrice &&
      gasPrice === transactionMeta?.dappSuggestedGasFees?.gasPrice) ||
    (maxPriorityFeePerGas &&
      maxFeePerGas &&
      transactionMeta?.dappSuggestedGasFees?.maxPriorityFeePerGas ===
        maxPriorityFeePerGas &&
      transactionMeta?.dappSuggestedGasFees?.maxFeePerGas === maxFeePerGas)
  );
}

/**
 * Attempts to decode transaction data using ABIs for three different token standards: ERC20, ERC721, ERC1155.
 * The data will decode correctly if the transaction is an interaction with a contract that matches one of these
 * contract standards
 *
 * @param data - encoded transaction data
 * @returns TransactionDescription | undefined
 */
export function parseStandardTokenTransactionData(
  data: string,
): TransactionDescription | undefined {
  try {
    return erc20Interface.parseTransaction({ data });
  } catch {
    // ignore and next try to parse with erc721 ABI
  }

  try {
    return erc721Interface.parseTransaction({ data });
  } catch {
    // ignore and next try to parse with erc1155 ABI
  }

  try {
    return erc1155Interface.parseTransaction({ data });
  } catch {
    // ignore and return undefined
  }

  return undefined;
}

/**
 * Determines the contractCode of the transaction by analyzing the txParams.
 *
 * @param txParams - Parameters for the transaction
 * @param query - EthQuery instance
 */
export async function determineTransactionContractCode(
  txParams: TransactionParams,
  query: EthQueryWithGetCode,
): Promise<TransactionType | null> {
  const { to } = txParams<TransactionParams>;
  const { contractCode } = await readAddressAsContract(query, to);
  return contractCode;
}

/**
 * Determines the type of the transaction by analyzing the txParams.
 * This method will return one of the types defined in {@link TransactionType}
 * It will never return TRANSACTION_TYPE_CANCEL or TRANSACTION_TYPE_RETRY as these
 * represent specific events that we control from the extension and are added manually
 * at transaction creation.
 *
 * @param txParams - Parameters for the transaction
 * @param query - EthQuery instance
 * @returns InferTransactionTypeResult
 */
export async function determineTransactionType(
  txParams: TransactionParams,
  query: EthQueryWithGetCode,
): Promise<InferTransactionTypeResult> {
  const { data, to } = txParams;
  let result: TransactionType;
  let contractCode: string | null;

  if (data && !to) {
    result = TransactionType.deployContract;
  } else {
    const { contractCode: resultCode, isContractAddress } =
      await readAddressAsContract(query, to);

    contractCode = resultCode;

    if (isContractAddress) {
      const hasValue = txParams.value && Number(txParams.value) !== 0;

      let name: string = '';
      try {
        const decodedData = data && parseStandardTokenTransactionData(data);
        if ('name' in decodedData) {
          name = decodedData.name;
        }
      } catch (error) {
        log.debug('Failed to parse transaction data.', error, data);
      }

      const tokenMethodName = [
        TransactionType.tokenMethodApprove,
        TransactionType.tokenMethodSetApprovalForAll,
        TransactionType.tokenMethodTransfer,
        TransactionType.tokenMethodTransferFrom,
        TransactionType.tokenMethodSafeTransferFrom,
      ].find((methodName) => isEqualCaseInsensitive(methodName, name));

      result =
        data && tokenMethodName && !hasValue
          ? tokenMethodName
          : TransactionType.contractInteraction;
    } else {
      result = TransactionType.simpleSend;
    }
  }

  return { type: result, getCodeResponse: contractCode };
}

type getTokenStandardAndDetails = (to) => () => {
  decimals?: string;
  balance?: string;
  symbol?: string;
  standard?: TokenStandard;
};
/**
 * Given a transaction meta object, determine the asset type that the
 * transaction is dealing with, as well as the standard for the token if it
 * is a token transaction.
 *
 * @param txMeta - transaction meta object
 * @param query - EthQuery instance
 * @param getTokenStandardAndDetails - function to get token standards and details.
 * @returns assetType: AssetType, tokenStandard: TokenStandard
 */
export async function determineTransactionAssetType(
  txMeta: TransactionMeta,
  query: EthQueryWithGetCode,
  getTokenStandardAndDetails: getTokenStandardAndDetails,
): Promise<{
  assetType: AssetType;
  tokenStandard: TokenStandard;
}> {
  // If the transaction type is already one of the inferrable types, then we do
  // not need to re-establish the type.
  let inferrableType = txMeta.type;
  if (!INFERRABLE_TRANSACTION_TYPES.includes(txMeta.type as TransactionType)) {
    // Because we will deal with all types of transactions (including swaps)
    // we want to get an inferrable type of transaction that isn't special cased
    // that way we can narrow the number of logic gates required.
    const result = await determineTransactionType(txMeta.txParams, query);
    inferrableType = result.type;
  }

  // If the inferred type of the transaction is one of those that are part of
  // the token contract standards, we can use the getTokenStandardAndDetails
  // method to get the asset type.
  const isTokenMethod = [
    TransactionType.tokenMethodApprove,
    TransactionType.tokenMethodSetApprovalForAll,
    TransactionType.tokenMethodTransfer,
    TransactionType.tokenMethodTransferFrom,
  ].find((methodName) => methodName === inferrableType);

  if (
    isTokenMethod ||
    // We can also check any contract interaction type to see if the to address
    // is a token contract. If it isn't, then the method will throw and we can
    // fall through to the other checks.
    inferrableType === TransactionType.contractInteraction
  ) {
    try {
      // We don't need a balance check, so the second parameter to
      // getTokenStandardAndDetails is omitted.
      const details = await getTokenStandardAndDetails(txMeta.txParams.to);
      if (details.standard) {
        return {
          assetType:
            details.standard === TokenStandard.ERC20
              ? AssetType.token
              : AssetType.NFT,
          tokenStandard: details.standard,
        };
      }
    } catch {
      // noop, We expect errors here but we don't need to report them or do
      // anything in response.
    }
  }

  // If the transaction is interacting with a contract but isn't a token method
  // we use the 'UNKNOWN' value to show that it isn't a transaction sending any
  // particular asset.
  if (inferrableType === TransactionType.contractInteraction) {
    return {
      assetType: AssetType.unknown,
      tokenStandard: TokenStandard.none,
    };
  }
  return { assetType: AssetType.native, tokenStandard: TokenStandard.none };
}
