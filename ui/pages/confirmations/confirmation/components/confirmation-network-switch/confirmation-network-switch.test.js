import React from 'react';
import { useSelector } from 'react-redux';
import configureMockStore from 'redux-mock-store';
import { getTheme } from '../../../../../selectors';
import mockState from '../../../../../../test/data/mock-state.json';
import { renderWithProvider } from '../../../../../../test/lib/render-helpers';
import ConfirmationNetworkSwitch from './confirmation-network-switch';

// Mock Redux store
jest.mock('react-redux', () => {
  const actual = jest.requireActual('react-redux');

  return {
    ...actual,
    useSelector: jest.fn(),
  };
});

const mockPalmNetwork = {
  ...mockState,
  metamask: {
    ...mockState.metamask,
    providerConfig: {
      chainId: '0x7',
    },
    networkConfigurations: {
      ...mockState.metamask.networkConfigurations,
      testNetworkConfigurationId: {
        rpcUrl: 'https://testrpc.com',
        chainId: '0x7',
        nickname: 'Custom Mainnet RPC',
        type: 'rpc',
        id: 'testNetworkConfigurationId',
        rpcPrefs: {
          imageUrl: './some_image',
        },
      },
    },
  },
  confirm: {
    currentConfirmation: { id: '1', msgParams: {} },
  },
};

// Mock networks
const mockFromNetwork = {
  chainId: '1',
  nickname: 'Ethereum',
};
const mockToNetwork = {
  chainId: '137',
  nickname: 'Polygon',
};

const generateUseSelectorRouter = (opts) => (selector) => {
  if (selector === getTheme) {
    return opts;
  }
  return undefined;
};

const mockStore = configureMockStore([])(mockPalmNetwork);

describe('ConfirmationNetworkSwitch', () => {
  it('should match snapshot', () => {
    const { container } = renderWithProvider(
      <ConfirmationNetworkSwitch
        toNetwork={mockToNetwork}
        fromNetwork={mockFromNetwork}
      />,
      mockStore,
    );
    expect(container).toMatchSnapshot();
  });

  it('renders network switch component with given networks', () => {
    useSelector.mockImplementation(generateUseSelectorRouter('dark'));
    const { getByTestId } = renderWithProvider(
      <ConfirmationNetworkSwitch
        toNetwork={mockToNetwork}
        fromNetwork={mockFromNetwork}
      />,
      mockStore,
    );

    expect(getByTestId('network-switch-from-network')).toHaveTextContent(
      'Ethereum',
    );
    expect(getByTestId('network-switch-to-network')).toHaveTextContent(
      'Polygon',
    );
  });
});
