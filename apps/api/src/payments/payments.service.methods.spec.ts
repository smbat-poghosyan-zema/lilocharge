import { ConflictException, NotFoundException } from '@nestjs/common';
import { PaymentGateway } from '@prisma/client';

import type { NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ApplePayClient } from './apple-pay.client';
import type { ArcaClient } from './arca.client';
import type { GooglePayClient } from './google-pay.client';
import type { IdramClient } from './idram.client';
import { PaymentsService } from './payments.service';

interface PaymentMethodRecord {
  readonly createdAt: Date;
  readonly displayLabel: string | null;
  readonly expiryMonth: number | null;
  readonly expiryYear: number | null;
  readonly gateway: PaymentGateway;
  readonly id: string;
  readonly isDefault: boolean;
  readonly last4: string | null;
  readonly updatedAt: Date;
  readonly userId: string;
}

interface PrismaPaymentMethodDelegateMock {
  readonly count: jest.Mock<Promise<number>, [unknown]>;
  readonly create: jest.Mock<Promise<PaymentMethodRecord>, [unknown]>;
  readonly delete: jest.Mock<Promise<{ readonly id: string }>, [unknown]>;
  readonly findFirst: jest.Mock<Promise<PaymentMethodRecord | { readonly id: string } | null>, [unknown]>;
  readonly findMany: jest.Mock<Promise<PaymentMethodRecord[]>, [unknown]>;
  readonly update: jest.Mock<Promise<PaymentMethodRecord>, [unknown]>;
  readonly updateMany: jest.Mock<Promise<{ readonly count: number }>, [unknown]>;
}

interface PrismaPaymentDelegateMock {
  readonly count: jest.Mock<Promise<number>, [unknown]>;
}

interface PrismaServiceMock {
  readonly $transaction: jest.Mock<Promise<unknown[]>, [readonly Promise<unknown>[]]>;
  readonly payment: PrismaPaymentDelegateMock;
  readonly paymentMethod: PrismaPaymentMethodDelegateMock;
}

const USER_ID = '11111111-1111-1111-1111-111111111111';
const METHOD_ID = '55555555-5555-5555-5555-555555555555';

/** Builds one payment method record fixture with optional field overrides. */
function buildPaymentMethodRecord(overrides?: Partial<PaymentMethodRecord>): PaymentMethodRecord {
  return {
    createdAt: new Date('2026-07-06T00:00:00.000Z'),
    displayLabel: 'My ArCa card',
    expiryMonth: null,
    expiryYear: null,
    gateway: PaymentGateway.ARCA,
    id: METHOD_ID,
    isDefault: true,
    last4: null,
    updatedAt: new Date('2026-07-06T00:00:00.000Z'),
    userId: USER_ID,
    ...overrides,
  };
}

/** Builds one Prisma service mock for payment-method management tests. */
function buildPrismaMock(): PrismaServiceMock {
  return {
    $transaction: jest
      .fn<Promise<unknown[]>, [readonly Promise<unknown>[]]>()
      .mockImplementation(async (operations) => Promise.all(operations)),
    payment: {
      count: jest.fn<Promise<number>, [unknown]>(),
    },
    paymentMethod: {
      count: jest.fn<Promise<number>, [unknown]>(),
      create: jest.fn<Promise<PaymentMethodRecord>, [unknown]>(),
      delete: jest.fn<Promise<{ readonly id: string }>, [unknown]>(),
      findFirst: jest.fn<
        Promise<PaymentMethodRecord | { readonly id: string } | null>,
        [unknown]
      >(),
      findMany: jest.fn<Promise<PaymentMethodRecord[]>, [unknown]>(),
      update: jest.fn<Promise<PaymentMethodRecord>, [unknown]>(),
      updateMany: jest.fn<Promise<{ readonly count: number }>, [unknown]>(),
    },
  };
}

/** Builds one PaymentsService wired with mocked collaborators for method-management tests. */
function buildService(prismaMock: PrismaServiceMock): PaymentsService {
  return new PaymentsService(
    prismaMock as unknown as PrismaService,
    {} as unknown as NotificationsService,
    {} as unknown as ArcaClient,
    {} as unknown as IdramClient,
    {} as unknown as ApplePayClient,
    {} as unknown as GooglePayClient,
  );
}

describe('PaymentsService payment-method management', () => {
  let prismaMock: PrismaServiceMock;
  let service: PaymentsService;

  beforeEach(() => {
    prismaMock = buildPrismaMock();
    service = buildService(prismaMock);
  });

  describe('listPaymentMethods', () => {
    it('lists user methods defaults-first without exposing raw tokens', async () => {
      prismaMock.paymentMethod.findMany.mockResolvedValue([
        buildPaymentMethodRecord(),
        buildPaymentMethodRecord({
          displayLabel: null,
          gateway: PaymentGateway.IDRAM,
          id: '66666666-6666-6666-6666-666666666666',
          isDefault: false,
        }),
      ]);

      const result = await service.listPaymentMethods(USER_ID);

      expect(result).toEqual([
        {
          createdAt: '2026-07-06T00:00:00.000Z',
          displayLabel: 'My ArCa card',
          expiryMonth: null,
          expiryYear: null,
          gateway: 'ARCA',
          id: METHOD_ID,
          isDefault: true,
          last4: null,
          updatedAt: '2026-07-06T00:00:00.000Z',
          userId: USER_ID,
        },
        {
          createdAt: '2026-07-06T00:00:00.000Z',
          displayLabel: null,
          expiryMonth: null,
          expiryYear: null,
          gateway: 'IDRAM',
          id: '66666666-6666-6666-6666-666666666666',
          isDefault: false,
          last4: null,
          updatedAt: '2026-07-06T00:00:00.000Z',
          userId: USER_ID,
        },
      ]);
      expect(prismaMock.paymentMethod.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        }),
      );

      const selectArg = (
        prismaMock.paymentMethod.findMany.mock.calls[0]?.[0] as {
          readonly select: Record<string, boolean>;
        }
      ).select;
      expect(selectArg['token']).toBeUndefined();
    });

    it('returns an empty list for users without stored methods', async () => {
      prismaMock.paymentMethod.findMany.mockResolvedValue([]);

      await expect(service.listPaymentMethods(USER_ID)).resolves.toEqual([]);
    });
  });

  describe('registerPaymentMethod', () => {
    it('creates the first method as the user default', async () => {
      prismaMock.paymentMethod.findFirst.mockResolvedValue(null);
      prismaMock.paymentMethod.count.mockResolvedValue(0);
      prismaMock.paymentMethod.create.mockResolvedValue(buildPaymentMethodRecord());

      const result = await service.registerPaymentMethod(USER_ID, {
        displayLabel: 'My ArCa card',
        gateway: 'ARCA',
        token: 'arca-binding-token-1',
      });

      expect(result.isDefault).toBe(true);
      expect(result.gateway).toBe('ARCA');
      expect(prismaMock.paymentMethod.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            displayLabel: 'My ArCa card',
            gateway: PaymentGateway.ARCA,
            isDefault: true,
            token: 'arca-binding-token-1',
            userId: USER_ID,
          },
        }),
      );
    });

    it('creates subsequent methods as non-default', async () => {
      prismaMock.paymentMethod.findFirst.mockResolvedValue(null);
      prismaMock.paymentMethod.count.mockResolvedValue(2);
      prismaMock.paymentMethod.create.mockResolvedValue(
        buildPaymentMethodRecord({ gateway: PaymentGateway.IDRAM, isDefault: false }),
      );

      const result = await service.registerPaymentMethod(USER_ID, {
        gateway: 'IDRAM',
        token: 'idram-wallet-token-1',
      });

      expect(result.isDefault).toBe(false);
      expect(prismaMock.paymentMethod.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            displayLabel: null,
            gateway: PaymentGateway.IDRAM,
            isDefault: false,
          }) as unknown,
        }),
      );
    });

    it('updates and returns the existing method when the same token is re-registered', async () => {
      const existingMethod = buildPaymentMethodRecord({ displayLabel: 'Old label' });
      prismaMock.paymentMethod.findFirst.mockResolvedValue(existingMethod);
      prismaMock.paymentMethod.update.mockResolvedValue(
        buildPaymentMethodRecord({ displayLabel: 'New label' }),
      );

      const result = await service.registerPaymentMethod(USER_ID, {
        displayLabel: 'New label',
        gateway: 'ARCA',
        token: 'arca-binding-token-1',
      });

      expect(result.displayLabel).toBe('New label');
      expect(prismaMock.paymentMethod.create).not.toHaveBeenCalled();
      expect(prismaMock.paymentMethod.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: METHOD_ID },
          data: { displayLabel: 'New label' },
        }),
      );
    });

    it('normalizes blank display labels to null', async () => {
      prismaMock.paymentMethod.findFirst.mockResolvedValue(null);
      prismaMock.paymentMethod.count.mockResolvedValue(0);
      prismaMock.paymentMethod.create.mockResolvedValue(
        buildPaymentMethodRecord({ displayLabel: null }),
      );

      await service.registerPaymentMethod(USER_ID, {
        displayLabel: '   ',
        gateway: 'ARCA',
        token: 'arca-binding-token-1',
      });

      expect(prismaMock.paymentMethod.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ displayLabel: null }) as unknown,
        }),
      );
    });
  });

  describe('deletePaymentMethod', () => {
    it('deletes one unreferenced method owned by the user', async () => {
      prismaMock.paymentMethod.findFirst.mockResolvedValue({ id: METHOD_ID });
      prismaMock.payment.count.mockResolvedValue(0);
      prismaMock.paymentMethod.delete.mockResolvedValue({ id: METHOD_ID });

      await service.deletePaymentMethod(USER_ID, METHOD_ID);

      expect(prismaMock.paymentMethod.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: METHOD_ID, userId: USER_ID } }),
      );
      expect(prismaMock.paymentMethod.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: METHOD_ID } }),
      );
    });

    it('throws NotFoundException for missing or foreign methods', async () => {
      prismaMock.paymentMethod.findFirst.mockResolvedValue(null);

      await expect(service.deletePaymentMethod(USER_ID, METHOD_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(prismaMock.paymentMethod.delete).not.toHaveBeenCalled();
    });

    it('throws ConflictException when payments reference the method', async () => {
      prismaMock.paymentMethod.findFirst.mockResolvedValue({ id: METHOD_ID });
      prismaMock.payment.count.mockResolvedValue(3);

      await expect(service.deletePaymentMethod(USER_ID, METHOD_ID)).rejects.toThrow(
        ConflictException,
      );
      expect(prismaMock.paymentMethod.delete).not.toHaveBeenCalled();
    });
  });

  describe('setDefaultPaymentMethod', () => {
    it('unsets other defaults and sets the requested method atomically', async () => {
      prismaMock.paymentMethod.findFirst.mockResolvedValue({ id: METHOD_ID });
      prismaMock.paymentMethod.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.paymentMethod.update.mockResolvedValue(buildPaymentMethodRecord());

      const result = await service.setDefaultPaymentMethod(USER_ID, METHOD_ID);

      expect(result.isDefault).toBe(true);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.paymentMethod.updateMany).toHaveBeenCalledWith({
        where: {
          id: { not: METHOD_ID },
          isDefault: true,
          userId: USER_ID,
        },
        data: { isDefault: false },
      });
      expect(prismaMock.paymentMethod.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: METHOD_ID },
          data: { isDefault: true },
        }),
      );
    });

    it('throws NotFoundException for missing or foreign methods', async () => {
      prismaMock.paymentMethod.findFirst.mockResolvedValue(null);

      await expect(service.setDefaultPaymentMethod(USER_ID, METHOD_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });
});
