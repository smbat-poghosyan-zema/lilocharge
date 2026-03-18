/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { BadRequestException } from '@nestjs/common';
import { WalletTransactionType } from '@prisma/client';

import type { ArcaClient } from '../payments/arca.client';
import type { IdramClient } from '../payments/idram.client';
import type { PrismaService } from '../prisma/prisma.service';
import { WalletService } from './wallet.service';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const WALLET_ID = '22222222-2222-2222-2222-222222222222';
const SESSION_ID = '33333333-3333-3333-3333-333333333333';

interface WalletRecord {
  readonly balance: number;
  readonly createdAt: Date;
  readonly id: string;
  readonly updatedAt: Date;
  readonly userId: string;
}

interface WalletTransactionRecord {
  readonly amount: number;
  readonly balanceAfter: number;
  readonly balanceBefore: number;
  readonly createdAt: Date;
  readonly description: string | null;
  readonly gateway: string | null;
  readonly gatewayTransactionId: string | null;
  readonly id: string;
  readonly sessionId: string | null;
  readonly type: WalletTransactionType;
  readonly walletId: string;
}

describe('WalletService', () => {
  let service: WalletService;
  let prismaService: jest.Mocked<PrismaService>;
  let arcaClient: jest.Mocked<ArcaClient>;
  let idramClient: jest.Mocked<IdramClient>;

  const buildWalletRecord = (overrides?: Partial<WalletRecord>): WalletRecord => ({
    balance: 10000,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    id: WALLET_ID,
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    userId: USER_ID,
    ...overrides,
  });

  const buildTransactionRecord = (
    overrides?: Partial<WalletTransactionRecord>,
  ): WalletTransactionRecord => ({
    amount: 5000,
    balanceAfter: 15000,
    balanceBefore: 10000,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    description: 'Test transaction',
    gateway: null,
    gatewayTransactionId: null,
    id: '44444444-4444-4444-4444-444444444444',
    sessionId: null,
    type: WalletTransactionType.TOP_UP,
    walletId: WALLET_ID,
    ...overrides,
  });

  beforeEach(() => {
    prismaService = {
      wallet: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      walletTransaction: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
    } as never;

    arcaClient = {
      preAuthorize: jest.fn(),
      capture: jest.fn(),
    } as never;

    idramClient = {
      debitWallet: jest.fn(),
    } as never;

    service = new WalletService(prismaService, arcaClient, idramClient);
  });

  describe('getOrCreateWallet', () => {
    it('should return existing wallet', async () => {
      const wallet = buildWalletRecord();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      (prismaService.wallet.findUnique as jest.Mock).mockResolvedValue(wallet);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const result = await service.getOrCreateWallet(USER_ID);

      expect(result.id).toBe(WALLET_ID);
      expect(result.balance).toBe(10000);
      expect(result.userId).toBe(USER_ID);
      expect(prismaService.wallet.findUnique).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        select: expect.any(Object),
      });
    });

    it('should create new wallet if none exists', async () => {
      const newWallet = buildWalletRecord({ balance: 0 });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      (prismaService.wallet.findUnique as jest.Mock).mockResolvedValue(null);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      (prismaService.wallet.create as jest.Mock).mockResolvedValue(newWallet);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const result = await service.getOrCreateWallet(USER_ID);

      expect(result.id).toBe(WALLET_ID);
      expect(result.balance).toBe(0);
      expect(prismaService.wallet.create).toHaveBeenCalledWith({
        data: { userId: USER_ID, balance: 0 },
        select: expect.any(Object),
      });
    });
  });

  describe('topUp', () => {
    it('should top up wallet via ARCA gateway', async () => {
      const wallet = buildWalletRecord();
      const transaction = buildTransactionRecord({
        type: WalletTransactionType.TOP_UP,
        amount: 5000,
        balanceBefore: 10000,
        balanceAfter: 15000,
      });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      (prismaService.wallet.findUnique as jest.Mock).mockResolvedValue(wallet);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      (arcaClient.preAuthorize as jest.Mock).mockResolvedValue({
        gatewayTransactionId: 'arca-tx-123',
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      (arcaClient.capture as jest.Mock).mockResolvedValue(undefined);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      (prismaService.$transaction as jest.Mock).mockImplementation(
        (callback: (tx: never) => Promise<unknown>) => {
          return callback({
            wallet: {
              findUnique: jest.fn().mockResolvedValue({ balance: 10000 }),
              update: jest.fn().mockResolvedValue({ ...wallet, balance: 15000 }),
            },
            walletTransaction: {
              create: jest.fn().mockResolvedValue(transaction),
            },
          } as never);
        },
      );

      const result = await service.topUp({
        userId: USER_ID,
        amount: 5000,
        gateway: 'ARCA',
      });

      expect(result.newBalance).toBe(15000);
      expect(result.gatewayTransactionId).toBe('arca-tx-123');
      expect(result.transaction.amount).toBe(5000);
      expect(arcaClient.preAuthorize).toHaveBeenCalled();
      expect(arcaClient.capture).toHaveBeenCalled();
    });

    it('should top up wallet via IDRAM gateway', async () => {
      const wallet = buildWalletRecord();
      const transaction = buildTransactionRecord({
        type: WalletTransactionType.TOP_UP,
        amount: 3000,
        balanceBefore: 10000,
        balanceAfter: 13000,
      });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      (prismaService.wallet.findUnique as jest.Mock).mockResolvedValue(wallet);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      (idramClient.debitWallet as jest.Mock).mockResolvedValue({
        gatewayTransactionId: 'idram-tx-456',
      });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      (prismaService.$transaction as jest.Mock).mockImplementation(
        (callback: (tx: never) => Promise<unknown>) => {
          return callback({
            wallet: {
              findUnique: jest.fn().mockResolvedValue({ balance: 10000 }),
              update: jest.fn().mockResolvedValue({ ...wallet, balance: 13000 }),
            },
            walletTransaction: {
              create: jest.fn().mockResolvedValue(transaction),
            },
          } as never);
        },
      );

      const result = await service.topUp({
        userId: USER_ID,
        amount: 3000,
        gateway: 'IDRAM',
      });

      expect(result.newBalance).toBe(13000);
      expect(result.gatewayTransactionId).toBe('idram-tx-456');
      expect(idramClient.debitWallet).toHaveBeenCalled();
    });

    it('should throw BadRequestException for non-positive amount', async () => {
      await expect(
        service.topUp({
          userId: USER_ID,
          amount: 0,
          gateway: 'ARCA',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.topUp({
          userId: USER_ID,
          amount: -100,
          gateway: 'ARCA',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deductBalance', () => {
    it('should deduct balance for session payment', async () => {
      const wallet = buildWalletRecord({ balance: 10000 });
      const transaction = buildTransactionRecord({
        type: WalletTransactionType.DEDUCTION,
        amount: 2000,
        balanceBefore: 10000,
        balanceAfter: 8000,
        sessionId: SESSION_ID,
      });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      (prismaService.wallet.findUnique as jest.Mock).mockResolvedValue(wallet);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      (prismaService.$transaction as jest.Mock).mockImplementation(
        (callback: (tx: never) => Promise<unknown>) => {
          return callback({
            wallet: {
              findUnique: jest.fn().mockResolvedValue({ balance: 10000 }),
              update: jest.fn().mockResolvedValue({ ...wallet, balance: 8000 }),
            },
            walletTransaction: {
              create: jest.fn().mockResolvedValue(transaction),
            },
          } as never);
        },
      );

      const result = await service.deductBalance({
        userId: USER_ID,
        amount: 2000,
        sessionId: SESSION_ID,
      });

      expect(result.amount).toBe(2000);
      expect(result.balanceAfter).toBe(8000);
      expect(result.sessionId).toBe(SESSION_ID);
    });

    it('should throw BadRequestException for insufficient balance', async () => {
      const wallet = buildWalletRecord({ balance: 1000 });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      (prismaService.wallet.findUnique as jest.Mock).mockResolvedValue(wallet);

      await expect(
        service.deductBalance({
          userId: USER_ID,
          amount: 5000,
          sessionId: SESSION_ID,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for non-positive amount', async () => {
      await expect(
        service.deductBalance({
          userId: USER_ID,
          amount: 0,
          sessionId: SESSION_ID,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('refundBalance', () => {
    it('should refund balance back to wallet', async () => {
      const wallet = buildWalletRecord({ balance: 5000 });
      const transaction = buildTransactionRecord({
        type: WalletTransactionType.REFUND,
        amount: 1500,
        balanceBefore: 5000,
        balanceAfter: 6500,
        sessionId: SESSION_ID,
      });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      (prismaService.wallet.findUnique as jest.Mock).mockResolvedValue(wallet);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      (prismaService.$transaction as jest.Mock).mockImplementation(
        (callback: (tx: never) => Promise<unknown>) => {
          return callback({
            wallet: {
              findUnique: jest.fn().mockResolvedValue({ balance: 5000 }),
              update: jest.fn().mockResolvedValue({ ...wallet, balance: 6500 }),
            },
            walletTransaction: {
              create: jest.fn().mockResolvedValue(transaction),
            },
          } as never);
        },
      );

      const result = await service.refundBalance({
        userId: USER_ID,
        amount: 1500,
        sessionId: SESSION_ID,
      });

      expect(result.amount).toBe(1500);
      expect(result.balanceAfter).toBe(6500);
      expect(result.type).toBe(WalletTransactionType.REFUND);
    });

    it('should throw BadRequestException for non-positive amount', async () => {
      await expect(
        service.refundBalance({
          userId: USER_ID,
          amount: 0,
          sessionId: SESSION_ID,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getTransactions', () => {
    it('should return paginated transactions', async () => {
      const wallet = buildWalletRecord();
      const transactions = [
        buildTransactionRecord({ id: 'tx-1', type: WalletTransactionType.TOP_UP }),
        buildTransactionRecord({ id: 'tx-2', type: WalletTransactionType.DEDUCTION }),
      ];

      // eslint-disable-next-line @typescript-eslint/unbound-method
      (prismaService.wallet.findUnique as jest.Mock).mockResolvedValue(wallet);
      // eslint-disable-next-line @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment
      (prismaService.walletTransaction.findMany as jest.Mock).mockResolvedValue(transactions);

      const result = await service.getTransactions(USER_ID, { limit: 20 });

      expect(result.transactions).toHaveLength(2);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('should filter transactions by type', async () => {
      const wallet = buildWalletRecord();
      const transactions = [buildTransactionRecord({ type: WalletTransactionType.TOP_UP })];

      (prismaService.wallet.findUnique as jest.Mock).mockResolvedValue(wallet);
      (prismaService.walletTransaction.findMany as jest.Mock).mockResolvedValue(transactions);

      await service.getTransactions(USER_ID, { type: WalletTransactionType.TOP_UP });

      expect(prismaService.walletTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: WalletTransactionType.TOP_UP,
          }),
        }),
      );
    });

    it('should handle cursor-based pagination', async () => {
      const wallet = buildWalletRecord();
      const transactions = Array.from({ length: 15 }, (_, i) =>
        buildTransactionRecord({ id: `tx-${i}` }),
      );

      (prismaService.wallet.findUnique as jest.Mock).mockResolvedValue(wallet);
      (prismaService.walletTransaction.findMany as jest.Mock).mockResolvedValue(transactions);

      const result = await service.getTransactions(USER_ID, { limit: 10 });

      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('tx-9');
    });
  });

  describe('checkSufficientBalance', () => {
    it('should return true when wallet has sufficient balance', async () => {
      const wallet = buildWalletRecord({ balance: 5000 });
      (prismaService.wallet.findUnique as jest.Mock).mockResolvedValue(wallet);

      const result = await service.checkSufficientBalance(USER_ID, 3000);

      expect(result).toBe(true);
    });

    it('should return true when wallet has exact required balance', async () => {
      const wallet = buildWalletRecord({ balance: 5000 });
      (prismaService.wallet.findUnique as jest.Mock).mockResolvedValue(wallet);

      const result = await service.checkSufficientBalance(USER_ID, 5000);

      expect(result).toBe(true);
    });

    it('should return false when wallet has insufficient balance', async () => {
      const wallet = buildWalletRecord({ balance: 2000 });
      (prismaService.wallet.findUnique as jest.Mock).mockResolvedValue(wallet);

      const result = await service.checkSufficientBalance(USER_ID, 5000);

      expect(result).toBe(false);
    });

    it('should return false when wallet does not exist', async () => {
      (prismaService.wallet.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.checkSufficientBalance(USER_ID, 1000);

      expect(result).toBe(false);
    });

    it('should return true for zero or negative required amount', async () => {
      const result1 = await service.checkSufficientBalance(USER_ID, 0);
      const result2 = await service.checkSufficientBalance(USER_ID, -100);

      expect(result1).toBe(true);
      expect(result2).toBe(true);
    });
  });
});
