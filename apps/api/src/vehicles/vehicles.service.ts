import type {
  ConnectorType as SharedConnectorType,
  CreateVehicleRequest,
  UpdateVehicleRequest,
  VehicleResponse,
} from '@lilocharge/shared-types';
import { ConnectorType } from '@lilocharge/shared-types';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConnectorType as PrismaConnectorType, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

const USER_NOT_FOUND_MESSAGE = 'User not found';
const VEHICLE_MAKE_EMPTY_MESSAGE = 'Vehicle make cannot be empty';
const VEHICLE_MODEL_EMPTY_MESSAGE = 'Vehicle model cannot be empty';
const VEHICLE_NOT_FOUND_MESSAGE = 'Vehicle not found';
const VEHICLE_UPDATE_REQUIRED_MESSAGE = 'At least one vehicle field must be provided';

const GBT_MAKES = new Set(['AION', 'BYD', 'CHANGAN', 'GEELY', 'LI AUTO', 'NIO', 'XPENG', 'ZEEKR']);
const CHADEMO_MAKES = new Set(['LEXUS', 'MITSUBISHI', 'NISSAN']);
const CHADEMO_MODEL_MATCHERS: readonly RegExp[] = [/LEAF/i, /I-MIEV/i, /E-NV200/i];
const TYPE_2_MODEL_MATCHERS: readonly RegExp[] = [/ZOE/i, /TWINGO E-TECH/i];
const TYPE_1_MODEL_MATCHERS: readonly RegExp[] = [/SPARK EV/i, /B-CLASS ELECTRIC DRIVE/i];

const VEHICLE_SELECT = {
  batteryCapacity: true,
  connectorType: true,
  createdAt: true,
  id: true,
  make: true,
  maxChargePower: true,
  model: true,
  updatedAt: true,
  userId: true,
  year: true,
} satisfies Prisma.VehicleSelect;

type VehicleRecord = Prisma.VehicleGetPayload<{
  select: typeof VEHICLE_SELECT;
}>;

/** Service responsible for user vehicle CRUD and connector-type auto-detection logic. */
@Injectable()
export class VehiclesService {
  constructor(private readonly prismaService: PrismaService) {}

  /** Returns all vehicles associated with the requested user id. */
  public async listVehicles(userId: string): Promise<VehicleResponse[]> {
    const vehicles = await this.prismaService.vehicle.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: VEHICLE_SELECT,
    });

    return vehicles.map((vehicle) => mapVehicleRecordToResponse(vehicle));
  }

  /** Fetches one vehicle by user ownership and vehicle id. */
  public async getVehicle(userId: string, vehicleId: string): Promise<VehicleResponse> {
    const vehicle = await this.prismaService.vehicle.findFirst({
      where: {
        id: vehicleId,
        userId,
      },
      select: VEHICLE_SELECT,
    });

    if (vehicle === null) {
      throw new NotFoundException(VEHICLE_NOT_FOUND_MESSAGE);
    }

    return mapVehicleRecordToResponse(vehicle);
  }

  /** Creates a vehicle profile and auto-detects connector type when omitted. */
  public async createVehicle(
    userId: string,
    request: CreateVehicleRequest,
  ): Promise<VehicleResponse> {
    const data = buildCreateVehicleData(request, userId);

    try {
      const vehicle = await this.prismaService.vehicle.create({
        data,
        select: VEHICLE_SELECT,
      });

      return mapVehicleRecordToResponse(vehicle);
    } catch (error: unknown) {
      throw mapVehicleMutationError(error);
    }
  }

  /** Updates a vehicle profile and recomputes connector type for identity changes. */
  public async updateVehicle(
    userId: string,
    vehicleId: string,
    request: UpdateVehicleRequest,
  ): Promise<VehicleResponse> {
    const existingVehicle = await this.prismaService.vehicle.findFirst({
      where: {
        id: vehicleId,
        userId,
      },
      select: VEHICLE_SELECT,
    });

    if (existingVehicle === null) {
      throw new NotFoundException(VEHICLE_NOT_FOUND_MESSAGE);
    }

    const data = buildVehicleUpdateData(request, existingVehicle);

    try {
      const vehicle = await this.prismaService.vehicle.update({
        where: { id: vehicleId },
        data,
        select: VEHICLE_SELECT,
      });

      return mapVehicleRecordToResponse(vehicle);
    } catch (error: unknown) {
      throw mapVehicleMutationError(error);
    }
  }

  /** Deletes one vehicle owned by the given user id. */
  public async deleteVehicle(userId: string, vehicleId: string): Promise<void> {
    const deletedResult = await this.prismaService.vehicle.deleteMany({
      where: {
        id: vehicleId,
        userId,
      },
    });

    if (deletedResult.count === 0) {
      throw new NotFoundException(VEHICLE_NOT_FOUND_MESSAGE);
    }
  }
}

/** Builds Prisma create payload including normalized fields and detected connector type. */
function buildCreateVehicleData(
  request: CreateVehicleRequest,
  userId: string,
): Prisma.VehicleUncheckedCreateInput {
  const make = normalizeVehicleMake(request.make);
  const model = normalizeVehicleModel(request.model);

  const connectorType =
    request.connectorType ?? detectConnectorType({ make, model, year: request.year });

  return {
    batteryCapacity: request.batteryCapacity,
    connectorType: mapSharedConnectorTypeToPrismaEnum(connectorType),
    make,
    maxChargePower: request.maxChargePower,
    model,
    userId,
    year: request.year,
  };
}

/** Builds Prisma update payload and applies connector auto-detection when identity changes. */
function buildVehicleUpdateData(
  request: UpdateVehicleRequest,
  existingVehicle: VehicleRecord,
): Prisma.VehicleUpdateInput {
  const data: Prisma.VehicleUpdateInput = {};

  const normalizedMake =
    request.make !== undefined ? normalizeVehicleMake(request.make) : existingVehicle.make;
  const normalizedModel =
    request.model !== undefined ? normalizeVehicleModel(request.model) : existingVehicle.model;
  const resolvedYear = request.year ?? existingVehicle.year;

  const identityChanged =
    normalizedMake !== existingVehicle.make ||
    normalizedModel !== existingVehicle.model ||
    resolvedYear !== existingVehicle.year;

  if (request.make !== undefined) {
    data.make = normalizedMake;
  }

  if (request.model !== undefined) {
    data.model = normalizedModel;
  }

  if (request.year !== undefined) {
    data.year = request.year;
  }

  if (request.batteryCapacity !== undefined) {
    data.batteryCapacity = request.batteryCapacity;
  }

  if (request.maxChargePower !== undefined) {
    data.maxChargePower = request.maxChargePower;
  }

  if (request.connectorType !== undefined) {
    data.connectorType = mapSharedConnectorTypeToPrismaEnum(request.connectorType);
  } else if (identityChanged) {
    const detectedConnectorType = detectConnectorType({
      make: normalizedMake,
      model: normalizedModel,
      year: resolvedYear,
    });
    data.connectorType = mapSharedConnectorTypeToPrismaEnum(detectedConnectorType);
  }

  if (Object.keys(data).length === 0) {
    throw new BadRequestException(VEHICLE_UPDATE_REQUIRED_MESSAGE);
  }

  return data;
}

/** Normalizes and validates a vehicle make string. */
function normalizeVehicleMake(make: string): string {
  const normalized = make.trim();
  if (normalized.length === 0) {
    throw new BadRequestException(VEHICLE_MAKE_EMPTY_MESSAGE);
  }

  return normalized;
}

/** Normalizes and validates a vehicle model string. */
function normalizeVehicleModel(model: string): string {
  const normalized = model.trim();
  if (normalized.length === 0) {
    throw new BadRequestException(VEHICLE_MODEL_EMPTY_MESSAGE);
  }

  return normalized;
}

/** Maps a shared connector type enum value to Prisma's connector enum. */
function mapSharedConnectorTypeToPrismaEnum(
  connectorType: SharedConnectorType,
): PrismaConnectorType {
  switch (connectorType) {
    case ConnectorType.TYPE_1:
      return PrismaConnectorType.TYPE_1;
    case ConnectorType.TYPE_2:
      return PrismaConnectorType.TYPE_2;
    case ConnectorType.CHADEMO:
      return PrismaConnectorType.CHADEMO;
    case ConnectorType.TESLA:
      return PrismaConnectorType.TESLA;
    case ConnectorType.GBT:
      return PrismaConnectorType.GBT;
    case ConnectorType.CCS:
    default:
      return PrismaConnectorType.CCS;
  }
}

/** Maps a Prisma connector enum value to the shared connector type enum. */
function mapPrismaConnectorTypeToSharedEnum(
  connectorType: PrismaConnectorType,
): SharedConnectorType {
  switch (connectorType) {
    case PrismaConnectorType.TYPE_1:
      return ConnectorType.TYPE_1;
    case PrismaConnectorType.TYPE_2:
      return ConnectorType.TYPE_2;
    case PrismaConnectorType.CHADEMO:
      return ConnectorType.CHADEMO;
    case PrismaConnectorType.TESLA:
      return ConnectorType.TESLA;
    case PrismaConnectorType.GBT:
      return ConnectorType.GBT;
    case PrismaConnectorType.CCS:
    default:
      return ConnectorType.CCS;
  }
}

/** Maps selected Prisma vehicle fields into a public vehicle response payload. */
function mapVehicleRecordToResponse(vehicle: VehicleRecord): VehicleResponse {
  return {
    batteryCapacity: vehicle.batteryCapacity,
    connectorType: mapPrismaConnectorTypeToSharedEnum(vehicle.connectorType),
    createdAt: vehicle.createdAt.toISOString(),
    id: vehicle.id,
    make: vehicle.make,
    maxChargePower: vehicle.maxChargePower,
    model: vehicle.model,
    updatedAt: vehicle.updatedAt.toISOString(),
    userId: vehicle.userId,
    year: vehicle.year,
  };
}

/** Converts Prisma mutation errors into consistent HTTP exceptions. */
function mapVehicleMutationError(error: unknown): Error {
  if (isPrismaKnownRequestError(error, 'P2025')) {
    return new NotFoundException(VEHICLE_NOT_FOUND_MESSAGE);
  }

  if (isPrismaKnownRequestError(error, 'P2003')) {
    return new NotFoundException(USER_NOT_FOUND_MESSAGE);
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error('Unknown vehicle mutation error');
}

/** Type guard for Prisma known request errors with a specific error code. */
function isPrismaKnownRequestError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

interface ConnectorDetectionInput {
  readonly make: string;
  readonly model: string;
  readonly year: number;
}

/** Derives the connector type for a vehicle from make/model/year heuristics. */
function detectConnectorType(input: ConnectorDetectionInput): SharedConnectorType {
  const normalizedMake = normalizeForMatching(input.make);
  const normalizedModel = normalizeForMatching(input.model);

  if (normalizedMake.includes('TESLA') || normalizedModel.includes('TESLA')) {
    return ConnectorType.TESLA;
  }

  if (GBT_MAKES.has(normalizedMake)) {
    return ConnectorType.GBT;
  }

  if (matchesAnyPattern(input.model, TYPE_2_MODEL_MATCHERS)) {
    return ConnectorType.TYPE_2;
  }

  if (
    CHADEMO_MAKES.has(normalizedMake) &&
    (input.year <= 2020 || matchesAnyPattern(input.model, CHADEMO_MODEL_MATCHERS))
  ) {
    return ConnectorType.CHADEMO;
  }

  if (matchesAnyPattern(input.model, TYPE_1_MODEL_MATCHERS)) {
    return ConnectorType.TYPE_1;
  }

  return ConnectorType.CCS;
}

/** Uppercases and normalizes spacing for connector detection matching. */
function normalizeForMatching(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toUpperCase();
}

/** Checks whether the provided value matches any of the supplied regular-expression patterns. */
function matchesAnyPattern(value: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}
