import { render, RenderOptions } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import { networkConfig } from '../config/networkConfig';
import React, { FC, ReactElement } from 'react';

const queryClient = new QueryClient();

const AllTheProviders: FC<{children: React.ReactNode}> = ({ children }) => {
  return (
    <Theme appearance="dark">
      <QueryClientProvider client={queryClient}>
        <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
          <WalletProvider autoConnect={false}>
            {children}
          </WalletProvider>
        </SuiClientProvider>
      </QueryClientProvider>
    </Theme>
  );
};

const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) => render(ui, { wrapper: AllTheProviders, ...options });

export * from '@testing-library/react';
export { customRender as render };
