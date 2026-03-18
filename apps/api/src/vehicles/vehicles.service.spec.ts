import type { ConnectorType as PrismaConnectorType } from '@prisma/client';
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { ConnectorType } from '@lilocharge/shared-types';

import type { PrismaService } from '../prisma/prisma.service';
import { VehiclesService } from './vehicles.service';

interface VehicleRecord {
  readonly batteryCapacity: number;
  readonly connectorType: PrismaConnectorType;
  readonly createdAt: Date;
  readonly id: string;
  readonly make: string;
  readonly maxChargePower: number;
  readonly model: string;
  readonly updatedAt: Date;
  readonly userId: string;
  readonly year: number;
}

interface PrismaVehicleDelegateMock {
  readonly create: jest.Mock<Promise<VehicleRecord>, [unknown]>;
  readonly deleteMany: jest.Mock<Promise<{ count: number }>, [unknown]>;
  readonly findFirst: jest.Mock<Promise<VehicleRecord | null>, [unknown]>;
  readonly findMany: jest.Mock<Promise<VehicleRecord[]>, [unknown]>;
  readonly update: jest.Mock<Promise<VehicleRecord>, [unknown]>;
}

interface PrismaServiceMock {
  readonly vehicle: PrismaVehicleDelegateMock;
}

const USER_ID = '11111111-1111-1111-1111-111111111111';
const VEHICLE_ID = '22222222-2222-2222-2222-222222222222';

/** Builds a complete vehicle fixture with optional field overrides. */
function buildVehicle(overrides?: Partial<VehicleRecord>): VehicleRecord {
  const now = new Date('2026-02-17T00:00:00.000Z');

  return {
    batteryCapacity: 62,
    connectorType: 'CCS',
    createdAt: now,
    id: VEHICLE_ID,
    make: 'Kia',
    maxChargePower: 240,
    model: 'EV6',
    updatedAt: now,
    userId: USER_ID,
    year: 2024,
    ...overrides,
  };
}

describe('VehiclesService', () => {
  let service: VehiclesService;
  let prismaMock: PrismaServiceMock;

  beforeEach(() => {
    prismaMock = {
      vehicle: {
        create: jest.fn<Promise<VehicleRecord>, [unknown]>(),
        deleteMany: jest.fn<Promise<{ count: number }>, [unknown]>(),
        findFirst: jest.fn<Promise<VehicleRecord | null>, [unknown]>(),
        findMany: jest.fn<Promise<VehicleRecord[]>, [unknown]>(),
        update: jest.fn<Promise<VehicleRecord>, [unknown]>(),
      },
    };

    service = new VehiclesService(prismaMock as unknown as PrismaService);
  });

  it('returns vehicles for the requested user id', async () => {
    prismaMock.vehicle.findMany.mockResolvedValue([buildVehicle()]);

    const vehicles = await service.listVehicles(USER_ID);

    expect(vehicles).toEqual([
      {
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
      },
    ]);
    expect(prismaMock.vehicle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_ID },
      }),
    );
  });

  it('returns a single vehicle by user and vehicle ids', async () => {
    prismaMock.vehicle.findFirst.mockResolvedValue(buildVehicle());

    const vehicle = await service.getVehicle(USER_ID, VEHICLE_ID);

    expect(vehicle.connectorType).toBe(ConnectorType.CCS);
    expect(prismaMock.vehicle.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: VEHICLE_ID, userId: USER_ID },
      }),
    );
  });

  it('throws not found when requested vehicle does not exist for user', async () => {
    prismaMock.vehicle.findFirst.mockResolvedValue(null);

    await expect(service.getVehicle(USER_ID, VEHICLE_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('auto-detects connector type on create when connector type is omitted', async () => {
    prismaMock.vehicle.create.mockResolvedValue(
      buildVehicle({
        connectorType: 'TESLA',
        make: 'Tesla',
        model: 'Model 3',
      }),
    );

    const vehicle = await service.createVehicle(USER_ID, {
      batteryCapacity: 75,
      make: '  Tesla  ',
      maxChargePower: 250,
      model: ' Model 3 ',
      year: 2023,
    });

    expect(vehicle.connectorType).toBe(ConnectorType.TESLA);
    expect(prismaMock.vehicle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          batteryCapacity: 75,
          connectorType: 'TESLA',
          make: 'Tesla',
          maxChargePower: 250,
          model: 'Model 3',
          userId: USER_ID,
          year: 2023,
        },
      }),
    );
  });

  it('keeps explicit connector type on create without auto-detection override', async () => {
    prismaMock.vehicle.create.mockResolvedValue(
      buildVehicle({
        connectorType: 'CCS',
        make: 'Tesla',
        model: 'Model Y',
      }),
    );

    const vehicle = await service.createVehicle(USER_ID, {
      batteryCapacity: 78,
      connectorType: ConnectorType.CCS,
      make: 'Tesla',
      maxChargePower: 250,
      model: 'Model Y',
      year: 2024,
    });

    expect(vehicle.connectorType).toBe(ConnectorType.CCS);
    expect(prismaMock.vehicle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          batteryCapacity: 78,
          connectorType: 'CCS',
          make: 'Tesla',
          maxChargePower: 250,
          model: 'Model Y',
          userId: USER_ID,
          year: 2024,
        },
      }),
    );
  });

  it('rejects create when make is blank after trimming', async () => {
    await expect(
      service.createVehicle(USER_ID, {
        batteryCapacity: 50,
        make: '   ',
        maxChargePower: 100,
        model: 'Leaf',
        year: 2018,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recomputes connector type on update when identity fields change', async () => {
    prismaMock.vehicle.findFirst.mockResolvedValue(
      buildVehicle({
        connectorType: 'CHADEMO',
        make: 'Nissan',
        model: 'Leaf',
        year: 2016,
      }),
    );
    prismaMock.vehicle.update.mockResolvedValue(
      buildVehicle({
        connectorType: 'TESLA',
        make: 'Tesla',
        model: 'Model Y',
        year: 2024,
      }),
    );

    const vehicle = await service.updateVehicle(USER_ID, VEHICLE_ID, {
      make: ' Tesla ',
      model: ' Model Y ',
      year: 2024,
    });

    expect(vehicle.connectorType).toBe(ConnectorType.TESLA);
    expect(prismaMock.vehicle.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          connectorType: 'TESLA',
          make: 'Tesla',
          model: 'Model Y',
          year: 2024,
        },
        where: { id: VEHICLE_ID },
      }),
    );
  });

  it('keeps connector type unchanged when updating non-identity fields only', async () => {
    prismaMock.vehicle.findFirst.mockResolvedValue(
      buildVehicle({
        connectorType: 'CHADEMO',
      }),
    );
    prismaMock.vehicle.update.mockResolvedValue(
      buildVehicle({
        batteryCapacity: 68,
        connectorType: 'CHADEMO',
      }),
    );

    const vehicle = await service.updateVehicle(USER_ID, VEHICLE_ID, {
      batteryCapacity: 68,
    });

    expect(vehicle.connectorType).toBe(ConnectorType.CHADEMO);
    expect(prismaMock.vehicle.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          batteryCapacity: 68,
        },
      }),
    );
  });

  it('rejects update when no updatable fields are provided', async () => {
    prismaMock.vehicle.findFirst.mockResolvedValue(buildVehicle());

    await expect(service.updateVehicle(USER_ID, VEHICLE_ID, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('deletes a vehicle for the user', async () => {
    prismaMock.vehicle.deleteMany.mockResolvedValue({ count: 1 });

    await expect(service.deleteVehicle(USER_ID, VEHICLE_ID)).resolves.toBeUndefined();
    expect(prismaMock.vehicle.deleteMany).toHaveBeenCalledWith({
      where: {
        id: VEHICLE_ID,
        userId: USER_ID,
      },
    });
  });

  it('throws not found when deleting unknown vehicle', async () => {
    prismaMock.vehicle.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.deleteVehicle(USER_ID, VEHICLE_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
