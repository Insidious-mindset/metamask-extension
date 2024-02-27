import pify from 'pify';
import { TransactionType } from '@metamask/transaction-controller';

export type Contract = {
  contractCode: TransactionType | null;
  isContractAddress: boolean;
};

// Note(@dbrans): This is a simplified version of the 'EthQuery' interface specific to this file.
export type EthQueryWithGetCode = {
  getCode: (
    address: string,
    cb: (err: Error, contractCode: string) => void,
  ) => void;
};

export const readAddressAsContract = async (
  ethQuery: EthQueryWithGetCode,
  address: string | undefined,
): Promise<Contract> => {
  let contractCode: TransactionType | null;
  try {
    contractCode = await pify(ethQuery.getCode.bind(ethQuery))(address);
  } catch (err) {
    // TODO(@dbrans): Dangerous to swallow errors here.
    contractCode = null;
  }
  const isContractAddress = contractCode
    ? contractCode !== '0x' && contractCode !== '0x0'
    : false;
  return { contractCode, isContractAddress };
};
