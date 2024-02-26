import React from 'react';
import configureMockStore from 'redux-mock-store';
import { useSelector } from 'react-redux';
import { renderWithProvider } from '../../../../../test/jest/rendering';
import { defaultNetworksData } from '../networks-tab.constants';
import { getTheme } from '../../../../selectors';
import { getProviderConfig } from '../../../../ducks/metamask/metamask';
import NetworksListItem from '.';

// Mock Redux store
jest.mock('react-redux', () => {
  const actual = jest.requireActual('react-redux');

  return {
    ...actual,
    useSelector: jest.fn(),
  };
});

const mockState = {
  metamask: {
    providerConfig: {
      chainId: '0x5',
      nickname: '',
      rpcPrefs: {},
      rpcUrl: 'https://goerli.infura.io/v3/undefined',
      ticker: 'ETH',
      type: 'goerli',
    },
  },
};

const renderComponent = (props) => {
  const store = configureMockStore([])(mockState);
  return renderWithProvider(<NetworksListItem {...props} />, store);
};

const defaultNetworks = defaultNetworksData.map((network) => ({
  ...network,
  viewOnly: true,
}));

const MainnetProps = {
  network: defaultNetworks[0],
  networkIsSelected: false,
  selectedRpcUrl: 'http://localhost:8545',
};
const testNetProps = {
  network: defaultNetworks[1],
  networkIsSelected: false,
  selectedRpcUrl: 'http://localhost:8545',
};

const PalmProps = {
  network: {
    ...defaultNetworks[1],
    chainId: '0x2a15c308d',
  },
  networkIsSelected: false,
  selectedRpcUrl: 'http://localhost:8545',
};

const generateUseSelectorRouter = (opts) => (selector) => {
  if (selector === getTheme) {
    return opts;
  }
  if (selector === getProviderConfig) {
    return {
      chainId: '0x2a15c308d',
      nickname: '',
      rpcPrefs: {},
      rpcUrl: 'https://palm.infura.io/v3/undefined',
      ticker: 'PALM',
      type: 'goerli',
    };
  }
  return undefined;
};
describe('NetworksListItem Component', () => {
  it('should render a Mainnet network item correctly', () => {
    useSelector.mockImplementation(generateUseSelectorRouter('dark'));
    const { queryByText } = renderComponent(MainnetProps);
    expect(queryByText('Ethereum Mainnet')).toBeInTheDocument();
  });

  it('should render a test network item correctly', () => {
    useSelector.mockImplementation(generateUseSelectorRouter('dark'));
    const { queryByText } = renderComponent(testNetProps);
    expect(queryByText('Sepolia test network')).toBeInTheDocument();
  });

  it('should render a palm network item correctly on light mode', async () => {
    useSelector.mockImplementation(generateUseSelectorRouter('light'));
    const { getByAltText } = renderComponent(PalmProps);

    const img = getByAltText('network-icon');

    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', './images/palm-white.svg');
  });
});
