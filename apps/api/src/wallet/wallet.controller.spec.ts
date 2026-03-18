import type {
  WalletResponse,
  WalletTopUpResponse,
  WalletTransactionsResponse,
} from '@lilocharge/shared-types';

import { WalletController } from './wallet.controller';
import type { WalletService } from './wallet.service';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const WALLET_ID = '22222222-2222-2222-2222-222222222222';

describe('WalletController', () => {
  describe('getWallet', () => {
    it('should return wallet balance', async () => {
      const mockWallet: WalletResponse = {
        balance: 15000,
        createdAt: '2024-01-01T00:00:00.000Z',
        id: WALLET_ID,
        updatedAt: '2024-01-01T00:00:00.000Z',
        userId: USER_ID,
      };

      const walletServiceMock = {
        getOrCreateWallet: jest.fn().mockResolvedValue(mockWallet),
      };
      const controller = new WalletController(walletServiceMock as never as WalletService);

      const result = await controller.getWallet(USER_ID);

      expect(result).toEqual(mockWallet);
      expect(walletServiceMock.getOrCreateWallet).toHaveBeenCalledWith(USER_ID);
    });
  });

  describe('topUp', () => {
    it('should top up wallet via ARCA', async () => {
      const mockResponse: WalletTopUpResponse = {
        gatewayTransactionId: 'arca-tx-123',
        newBalance: 20000,
        transaction: {
          amount: 5000,
          balanceAfter: 20000,
          balanceBefore: 15000,
          createdAt: '2024-01-01T00:00:00.000Z',
          description: 'Wallet top-up via ARCA',
          gateway: 'ARCA',
          gatewayTransactionId: 'arca-tx-123',
          id: '33333333-3333-3333-3333-333333333333',
          sessionId: null,
          type: 'TOP_UP',
          walletId: WALLET_ID,
        },
      };

      const walletServiceMock = {
        topUp: jest.fn().mockResolvedValue(mockResponse),
      };
      const controller = new WalletController(walletServiceMock as never as WalletService);

      const result = await controller.topUp(USER_ID, {
        amount: 5000,
        gateway: 'ARCA',
      });

      expect(result).toEqual(mockResponse);
      expect(walletServiceMock.topUp).toHaveBeenCalledWith({
        userId: USER_ID,
        amount: 5000,
        gateway: 'ARCA',
        paymentMethodId: undefined,
      });
    });

    it('should top up wallet via IDRAM with payment method', async () => {
      const mockResponse: WalletTopUpResponse = {
        gatewayTransactionId: 'idram-tx-456',
        newBalance: 18000,
        transaction: {
          amount: 3000,
          balanceAfter: 18000,
          balanceBefore: 15000,
          createdAt: '2024-01-01T00:00:00.000Z',
          description: 'Wallet top-up via IDRAM',
          gateway: 'IDRAM',
          gatewayTransactionId: 'idram-tx-456',
          id: '44444444-4444-4444-4444-444444444444',
          sessionId: null,
          type: 'TOP_UP',
          walletId: WALLET_ID,
        },
      };

      const walletServiceMock = {
        topUp: jest.fn().mockResolvedValue(mockResponse),
      };
      const controller = new WalletController(walletServiceMock as never as WalletService);

      const result = await controller.topUp(USER_ID, {
        amount: 3000,
        gateway: 'IDRAM',
        paymentMethodId: 'pm-123',
      });

      expect(result).toEqual(mockResponse);
      expect(walletServiceMock.topUp).toHaveBeenCalledWith({
        userId: USER_ID,
        amount: 3000,
        gateway: 'IDRAM',
        paymentMethodId: 'pm-123',
      });
    });
  });

  describe('getTransactions', () => {
    it('should return paginated transactions', async () => {
      const mockResponse: WalletTransactionsResponse = {
        hasMore: false,
        nextCursor: null,
        transactions: [
          {
            amount: 5000,
            balanceAfter: 15000,
            balanceBefore: 10000,
            createdAt: '2024-01-01T00:00:00.000Z',
            description: 'Wallet top-up via ARCA',
            gateway: 'ARCA',
            gatewayTransactionId: 'tx-123',
            id: '33333333-3333-3333-3333-333333333333',
            sessionId: null,
            type: 'TOP_UP',
            walletId: WALLET_ID,
          },
        ],
      };

      const walletServiceMock = {
        getTransactions: jest.fn().mockResolvedValue(mockResponse),
      };
      const controller = new WalletController(walletServiceMock as never as WalletService);

      const result = await controller.getTransactions(USER_ID, {});

      expect(result).toEqual(mockResponse);
      expect(walletServiceMock.getTransactions).toHaveBeenCalledWith(USER_ID, {
        type: undefined,
        limit: undefined,
        cursor: undefined,
      });
    });

    it('should filter transactions by type', async () => {
      const mockResponse: WalletTransactionsResponse = {
        hasMore: false,
        nextCursor: null,
        transactions: [
          {
            amount: 2000,
            balanceAfter: 13000,
            balanceBefore: 15000,
            createdAt: '2024-01-01T00:00:00.000Z',
            description: 'Payment for charging session',
            gateway: null,
            gatewayTransactionId: null,
            id: '55555555-5555-5555-5555-555555555555',
            sessionId: '66666666-6666-6666-6666-666666666666',
            type: 'DEDUCTION',
            walletId: WALLET_ID,
          },
        ],
      };

      const walletServiceMock = {
        getTransactions: jest.fn().mockResolvedValue(mockResponse),
      };
      const controller = new WalletController(walletServiceMock as never as WalletService);

      const result = await controller.getTransactions(USER_ID, {
        type: 'DEDUCTION',
        limit: 10,
      });

      expect(result).toEqual(mockResponse);
      expect(walletServiceMock.getTransactions).toHaveBeenCalledWith(USER_ID, {
        type: 'DEDUCTION',
        limit: 10,
        cursor: undefined,
      });
    });
  });
});
