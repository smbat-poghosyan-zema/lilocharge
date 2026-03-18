import type {
  CreateVehicleRequest,
  UpdateVehicleRequest,
  VehicleResponse,
} from '@lilocharge/shared-types';
import { ConnectorType } from '@lilocharge/shared-types';

import type { VehiclesService } from './vehicles.service';
import { VehiclesController } from './vehicles.controller';

interface VehiclesServiceMock {
  readonly createVehicle: jest.Mock<Promise<VehicleResponse>, [string, CreateVehicleRequest]>;
  readonly deleteVehicle: jest.Mock<Promise<void>, [string, string]>;
  readonly getVehicle: jest.Mock<Promise<VehicleResponse>, [string, string]>;
  readonly listVehicles: jest.Mock<Promise<VehicleResponse[]>, [string]>;
  readonly updateVehicle: jest.Mock<
    Promise<VehicleResponse>,
    [string, string, UpdateVehicleRequest]
  >;
}

const USER_ID = '11111111-1111-1111-1111-111111111111';
const VEHICLE_ID = '22222222-2222-2222-2222-222222222222';

/** Builds a stable vehicle response fixture for controller delegation tests. */
function buildVehicleResponse(): VehicleResponse {
  return {
    batteryCapacity: 62,
    connectorType: ConnectorType.CCS,
    createdAt: '2026-02-17T00:00:00.000Z',
    id: VEHICLE_ID,
    make: 'Kia',
    maxChargePower: 240,
    model: 'EV6',
    updatedAt: '2026-02-17T00:00:00.000Z',
    userId: USER_ID,
    year: 2024,
  };
}

describe('VehiclesController', () => {
  it('delegates vehicle CRUD operations to vehicles service methods', async () => {
    const vehicle = buildVehicleResponse();
    const vehiclesServiceMock: VehiclesServiceMock = {
      createVehicle: jest
        .fn<Promise<VehicleResponse>, [string, CreateVehicleRequest]>()
        .mockResolvedValue(vehicle),
      deleteVehicle: jest.fn<Promise<void>, [string, string]>().mockResolvedValue(undefined),
      getVehicle: jest.fn<Promise<VehicleResponse>, [string, string]>().mockResolvedValue(vehicle),
      listVehicles: jest.fn<Promise<VehicleResponse[]>, [string]>().mockResolvedValue([vehicle]),
      updateVehicle: jest
        .fn<Promise<VehicleResponse>, [string, string, UpdateVehicleRequest]>()
        .mockResolvedValue(vehicle),
    };

    const controller = new VehiclesController(vehiclesServiceMock as unknown as VehiclesService);
    const createPayload: CreateVehicleRequest = {
      batteryCapacity: 75,
      make: 'Tesla',
      maxChargePower: 250,
      model: 'Model 3',
      year: 2023,
    };
    const updatePayload: UpdateVehicleRequest = {
      batteryCapacity: 80,
      make: 'Tesla',
      model: 'Model Y',
      year: 2024,
    };

    await expect(controller.listVehicles(USER_ID)).resolves.toEqual([vehicle]);
    await expect(controller.getVehicle(USER_ID, VEHICLE_ID)).resolves.toEqual(vehicle);
    await expect(controller.createVehicle(USER_ID, createPayload)).resolves.toEqual(vehicle);
    await expect(controller.updateVehicle(USER_ID, VEHICLE_ID, updatePayload)).resolves.toEqual(
      vehicle,
    );
    await expect(controller.deleteVehicle(USER_ID, VEHICLE_ID)).resolves.toBeUndefined();

    expect(vehiclesServiceMock.listVehicles).toHaveBeenCalledWith(USER_ID);
    expect(vehiclesServiceMock.getVehicle).toHaveBeenCalledWith(USER_ID, VEHICLE_ID);
    expect(vehiclesServiceMock.createVehicle).toHaveBeenCalledWith(USER_ID, createPayload);
    expect(vehiclesServiceMock.updateVehicle).toHaveBeenCalledWith(
      USER_ID,
      VEHICLE_ID,
      updatePayload,
    );
    expect(vehiclesServiceMock.deleteVehicle).toHaveBeenCalledWith(USER_ID, VEHICLE_ID);
  });
});
