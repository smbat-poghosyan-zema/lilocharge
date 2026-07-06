import type { PaymentMethodResponse, RegisterPaymentMethodRequest } from '@lilocharge/shared-types';

import type { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import type { RegisterPaymentMethodDto } from './dto/register-payment-method.dto';

interface PaymentMethodManagementServiceMock {
  readonly deletePaymentMethod: jest.Mock<Promise<void>, [string, string]>;
  readonly listPaymentMethods: jest.Mock<Promise<PaymentMethodResponse[]>, [string]>;
  readonly registerPaymentMethod: jest.Mock<
    Promise<PaymentMethodResponse>,
    [string, RegisterPaymentMethodRequest]
  >;
  readonly setDefaultPaymentMethod: jest.Mock<Promise<PaymentMethodResponse>, [string, string]>;
}

const USER_ID = '11111111-1111-1111-1111-111111111111';
const METHOD_ID = '55555555-5555-5555-5555-555555555555';

/** Builds one payment method response fixture for controller delegation assertions. */
function buildPaymentMethodResponse(): PaymentMethodResponse {
  return {
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
  };
}

/** Builds one payments service mock covering the method-management endpoints. */
function buildServiceMock(): PaymentMethodManagementServiceMock {
  return {
    deletePaymentMethod: jest.fn<Promise<void>, [string, string]>().mockResolvedValue(undefined),
    listPaymentMethods: jest
      .fn<Promise<PaymentMethodResponse[]>, [string]>()
      .mockResolvedValue([buildPaymentMethodResponse()]),
    registerPaymentMethod: jest
      .fn<Promise<PaymentMethodResponse>, [string, RegisterPaymentMethodRequest]>()
      .mockResolvedValue(buildPaymentMethodResponse()),
    setDefaultPaymentMethod: jest
      .fn<Promise<PaymentMethodResponse>, [string, string]>()
      .mockResolvedValue(buildPaymentMethodResponse()),
  };
}

describe('PaymentsController payment-method management', () => {
  let serviceMock: PaymentMethodManagementServiceMock;
  let controller: PaymentsController;

  beforeEach(() => {
    serviceMock = buildServiceMock();
    controller = new PaymentsController(serviceMock as unknown as PaymentsService);
  });

  it('delegates method listing to the payments service', async () => {
    await expect(controller.listPaymentMethods(USER_ID)).resolves.toEqual([
      buildPaymentMethodResponse(),
    ]);
    expect(serviceMock.listPaymentMethods).toHaveBeenCalledWith(USER_ID);
  });

  it('delegates tokenized method registration to the payments service', async () => {
    const payload: RegisterPaymentMethodDto = {
      displayLabel: 'My ArCa card',
      gateway: 'ARCA',
      token: 'arca-binding-token-1',
    };

    await expect(controller.registerPaymentMethod(USER_ID, payload)).resolves.toEqual(
      buildPaymentMethodResponse(),
    );
    expect(serviceMock.registerPaymentMethod).toHaveBeenCalledWith(USER_ID, payload);
  });

  it('delegates method deletion to the payments service', async () => {
    await expect(controller.deletePaymentMethod(USER_ID, METHOD_ID)).resolves.toBeUndefined();
    expect(serviceMock.deletePaymentMethod).toHaveBeenCalledWith(USER_ID, METHOD_ID);
  });

  it('delegates default selection to the payments service', async () => {
    await expect(controller.setDefaultPaymentMethod(USER_ID, METHOD_ID)).resolves.toEqual(
      buildPaymentMethodResponse(),
    );
    expect(serviceMock.setDefaultPaymentMethod).toHaveBeenCalledWith(USER_ID, METHOD_ID);
  });
});
