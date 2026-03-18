import { randomUUID } from 'node:crypto';

import {
  PrismaClient,
  type ConnectorType,
  type SessionStatus,
  type StationStatus,
} from '@prisma/client';

import { buildMeterValueSeries, summarizeMeterValueSeries } from '../src/seed/meter-value-series';

const prisma = new PrismaClient();

const DEMO_IDS = {
  vehicleId: '00000000-0000-0000-0000-000000000001',
  stationId: '00000000-0000-0000-0000-000000000101',
  connectorId: '00000000-0000-0000-0000-000000000201',
  pricingPlanId: '00000000-0000-0000-0000-000000000301',
  sessionId: '00000000-0000-0000-0000-000000000401',
} as const;

/**
 * Seeds deterministic baseline entities used by backend development.
 */
async function seedCoreEntities(): Promise<{
  readonly userId: string;
  readonly connectorId: string;
}> {
  const user = await prisma.user.upsert({
    where: { email: 'test@lilocharge.am' },
    update: {
      displayName: 'Անի Սարգսյան',
      language: 'HY',
      marketingNotificationsEnabled: false,
      phone: '+37477123456',
      pushNotificationsEnabled: true,
    },
    create: {
      email: 'test@lilocharge.am',
      passwordHash: '$2b$12$4J1Vjgvnk2B5Miy2MduZue2FE5HOlBU7n0OHfkbB6Pj4T1N6hQH5S',
      phone: '+37477123456',
      displayName: 'Անի Սարգսյան',
      language: 'HY',
      pushNotificationsEnabled: true,
      marketingNotificationsEnabled: false,
    },
  });

  await prisma.vehicle.upsert({
    where: { id: DEMO_IDS.vehicleId },
    update: {
      batteryCapacity: 60.48,
      connectorType: 'CCS' satisfies ConnectorType,
      make: 'BYD',
      maxChargePower: 88,
      model: 'Dolphin',
      year: 2024,
    },
    create: {
      batteryCapacity: 60.48,
      connectorType: 'CCS' satisfies ConnectorType,
      id: DEMO_IDS.vehicleId,
      make: 'BYD',
      maxChargePower: 88,
      model: 'Dolphin',
      userId: user.id,
      year: 2024,
    },
  });

  await prisma.station.upsert({
    where: { id: DEMO_IDS.stationId },
    update: {
      address: 'Հյուսիսային պողոտա 10',
      amenities: ['parking', 'cafe'],
      city: 'Yerevan',
      latitude: 40.1792,
      longitude: 44.4991,
      name: 'LiloCharge Kentron Hub',
      openingHours: '24/7',
      operatorId: 'ev_armenia',
      operatorName: 'EV Armenia',
      status: 'AVAILABLE' satisfies StationStatus,
    },
    create: {
      address: 'Հյուսիսային պողոտա 10',
      amenities: ['parking', 'cafe'],
      city: 'Yerevan',
      id: DEMO_IDS.stationId,
      latitude: 40.1792,
      longitude: 44.4991,
      name: 'LiloCharge Kentron Hub',
      openingHours: '24/7',
      operatorId: 'ev_armenia',
      operatorName: 'EV Armenia',
      status: 'AVAILABLE' satisfies StationStatus,
    },
  });

  const connector = await prisma.connector.upsert({
    where: {
      stationId_evseId: {
        evseId: 'EVA-KEN-001',
        stationId: DEMO_IDS.stationId,
      },
    },
    update: {
      connectorType: 'CCS' satisfies ConnectorType,
      id: DEMO_IDS.connectorId,
      powerKw: 120,
      status: 'AVAILABLE' satisfies StationStatus,
    },
    create: {
      connectorType: 'CCS' satisfies ConnectorType,
      evseId: 'EVA-KEN-001',
      id: DEMO_IDS.connectorId,
      powerKw: 120,
      stationId: DEMO_IDS.stationId,
      status: 'AVAILABLE' satisfies StationStatus,
    },
  });

  await prisma.pricingPlan.upsert({
    where: { id: DEMO_IDS.pricingPlanId },
    update: {
      idleFee: 500,
      name: 'Default DC Fast',
      pricePerKwh: 14000,
      pricePerMinute: null,
      sessionFee: 1000,
      validFrom: new Date('2026-01-01T00:00:00.000Z'),
      validUntil: null,
    },
    create: {
      connectorId: DEMO_IDS.connectorId,
      id: DEMO_IDS.pricingPlanId,
      idleFee: 500,
      name: 'Default DC Fast',
      pricePerKwh: 14000,
      pricePerMinute: null,
      sessionFee: 1000,
      validFrom: new Date('2026-01-01T00:00:00.000Z'),
      validUntil: null,
    },
  });

  return {
    connectorId: connector.id,
    userId: user.id,
  };
}

/**
 * Seeds one completed session and related high-frequency meter values.
 */
async function seedSessionAndMeterValues(input: {
  readonly connectorId: string;
  readonly userId: string;
}): Promise<void> {
  const meterSeries = buildMeterValueSeries({
    currentAmps: 31.3,
    initialEnergyWh: 128000,
    initialSocPercent: 58,
    powerWatts: 7210,
    sampleCount: 120,
    sampleIntervalSeconds: 30,
    socDropPerSample: -0.08,
    startedAt: new Date('2026-02-17T12:00:00.000Z'),
    voltageVolts: 401.2,
  });

  const summary = summarizeMeterValueSeries(meterSeries);
  const startedAt = meterSeries[0]?.timestamp ?? null;
  const endedAt = meterSeries[meterSeries.length - 1]?.timestamp ?? null;

  await prisma.session.upsert({
    where: { id: DEMO_IDS.sessionId },
    update: {
      connectorId: input.connectorId,
      endTime: endedAt,
      energyDelivered: summary.energyDeliveredKwh,
      peakPower: summary.peakPowerKw,
      startTime: startedAt,
      status: 'COMPLETED' satisfies SessionStatus,
      totalCost: 185000,
      transactionId: 'TXN-EVA-20260217-0001',
      userId: input.userId,
      vehicleId: DEMO_IDS.vehicleId,
    },
    create: {
      connectorId: input.connectorId,
      endTime: endedAt,
      energyDelivered: summary.energyDeliveredKwh,
      id: DEMO_IDS.sessionId,
      peakPower: summary.peakPowerKw,
      startTime: startedAt,
      status: 'COMPLETED' satisfies SessionStatus,
      totalCost: 185000,
      transactionId: 'TXN-EVA-20260217-0001',
      userId: input.userId,
      vehicleId: DEMO_IDS.vehicleId,
    },
  });

  await prisma.meterValue.deleteMany({
    where: {
      sessionId: DEMO_IDS.sessionId,
    },
  });

  await prisma.meterValue.createMany({
    data: meterSeries.map((sample) => {
      return {
        createdAt: sample.timestamp,
        currentImport: sample.currentImport,
        energyActiveImport: sample.energyActiveImport,
        id: randomUUID(),
        powerActiveImport: sample.powerActiveImport,
        sessionId: DEMO_IDS.sessionId,
        soc: sample.soc,
        timestamp: sample.timestamp,
        voltage: sample.voltage,
      };
    }),
  });
}

/**
 * Seeds Yerevan charging stations with varied connector types, statuses, and addresses.
 */
async function seedYerevanStations(): Promise<void> {
  const stations = [
    {
      id: '10000000-0000-0000-0000-000000000001',
      name: 'Cascade Mall Fast Charge',
      address: 'Տարոն 1/3, Կասկադ',
      city: 'Yerevan',
      latitude: 40.1921,
      longitude: 44.5147,
      status: 'AVAILABLE' as StationStatus,
      operatorId: 'green_charge_am',
      operatorName: 'GreenCharge Armenia',
      openingHours: '08:00–22:00',
      amenities: ['parking', 'shopping'],
      connectors: [
        {
          evseId: 'GCA-CAS-001',
          connectorType: 'CCS' as ConnectorType,
          powerKw: 150,
          status: 'AVAILABLE' as StationStatus,
        },
        {
          evseId: 'GCA-CAS-002',
          connectorType: 'CHADEMO' as ConnectorType,
          powerKw: 50,
          status: 'AVAILABLE' as StationStatus,
        },
      ],
    },
    {
      id: '10000000-0000-0000-0000-000000000002',
      name: 'Mashtots Avenue Hub',
      address: 'Մաշտոցի պողոտա 45',
      city: 'Yerevan',
      latitude: 40.1768,
      longitude: 44.5108,
      status: 'OCCUPIED' as StationStatus,
      operatorId: 'ev_armenia',
      operatorName: 'EV Armenia',
      openingHours: '24/7',
      amenities: ['parking', 'cafe'],
      connectors: [
        {
          evseId: 'EVA-MSH-001',
          connectorType: 'CCS' as ConnectorType,
          powerKw: 120,
          status: 'OCCUPIED' as StationStatus,
        },
        {
          evseId: 'EVA-MSH-002',
          connectorType: 'TYPE_2' as ConnectorType,
          powerKw: 22,
          status: 'AVAILABLE' as StationStatus,
        },
      ],
    },
    {
      id: '10000000-0000-0000-0000-000000000003',
      name: 'Erebuni Plaza Charger',
      address: 'Էրեբունու 26/1',
      city: 'Yerevan',
      latitude: 40.1583,
      longitude: 44.5231,
      status: 'AVAILABLE' as StationStatus,
      operatorId: 'green_charge_am',
      operatorName: 'GreenCharge Armenia',
      openingHours: '10:00–21:00',
      amenities: ['parking', 'shopping', 'restroom'],
      connectors: [
        {
          evseId: 'GCA-ERE-001',
          connectorType: 'TYPE_2' as ConnectorType,
          powerKw: 22,
          status: 'AVAILABLE' as StationStatus,
        },
        {
          evseId: 'GCA-ERE-002',
          connectorType: 'TYPE_2' as ConnectorType,
          powerKw: 22,
          status: 'AVAILABLE' as StationStatus,
        },
        {
          evseId: 'GCA-ERE-003',
          connectorType: 'TYPE_1' as ConnectorType,
          powerKw: 7,
          status: 'OFFLINE' as StationStatus,
        },
      ],
    },
    {
      id: '10000000-0000-0000-0000-000000000004',
      name: 'Dalma Garden Mall DC',
      address: 'Ադոնցի 2',
      city: 'Yerevan',
      latitude: 40.2017,
      longitude: 44.4847,
      status: 'MAINTENANCE' as StationStatus,
      operatorId: 'chargepoint_am',
      operatorName: 'ChargePoint Armenia',
      openingHours: '10:00–22:00',
      amenities: ['parking', 'shopping', 'cafe', 'wifi'],
      connectors: [
        {
          evseId: 'CPA-DAL-001',
          connectorType: 'CCS' as ConnectorType,
          powerKw: 350,
          status: 'MAINTENANCE' as StationStatus,
        },
        {
          evseId: 'CPA-DAL-002',
          connectorType: 'CCS' as ConnectorType,
          powerKw: 350,
          status: 'MAINTENANCE' as StationStatus,
        },
      ],
    },
    {
      id: '10000000-0000-0000-0000-000000000005',
      name: 'Komaygi Park & Charge',
      address: 'Կոմիտաս 51',
      city: 'Yerevan',
      latitude: 40.2106,
      longitude: 44.5036,
      status: 'AVAILABLE' as StationStatus,
      operatorId: 'ev_armenia',
      operatorName: 'EV Armenia',
      openingHours: '24/7',
      amenities: ['parking'],
      connectors: [
        {
          evseId: 'EVA-KOM-001',
          connectorType: 'CHADEMO' as ConnectorType,
          powerKw: 50,
          status: 'AVAILABLE' as StationStatus,
        },
        {
          evseId: 'EVA-KOM-002',
          connectorType: 'TYPE_2' as ConnectorType,
          powerKw: 22,
          status: 'OCCUPIED' as StationStatus,
        },
      ],
    },
    {
      id: '10000000-0000-0000-0000-000000000006',
      name: 'Tesla Supercharger Yerevan',
      address: 'Բաղրամյան 24',
      city: 'Yerevan',
      latitude: 40.1879,
      longitude: 44.5048,
      status: 'AVAILABLE' as StationStatus,
      operatorId: 'tesla_am',
      operatorName: 'Tesla',
      openingHours: '24/7',
      amenities: ['parking', 'wifi'],
      connectors: [
        {
          evseId: 'TES-BAG-001',
          connectorType: 'TESLA' as ConnectorType,
          powerKw: 250,
          status: 'AVAILABLE' as StationStatus,
        },
        {
          evseId: 'TES-BAG-002',
          connectorType: 'TESLA' as ConnectorType,
          powerKw: 250,
          status: 'AVAILABLE' as StationStatus,
        },
        {
          evseId: 'TES-BAG-003',
          connectorType: 'TESLA' as ConnectorType,
          powerKw: 250,
          status: 'OCCUPIED' as StationStatus,
        },
        {
          evseId: 'TES-BAG-004',
          connectorType: 'TESLA' as ConnectorType,
          powerKw: 250,
          status: 'AVAILABLE' as StationStatus,
        },
      ],
    },
    {
      id: '10000000-0000-0000-0000-000000000007',
      name: 'Zvartnots Airport Charge',
      address: 'Զվարթնոց օդանավակայան',
      city: 'Yerevan',
      latitude: 40.1473,
      longitude: 44.396,
      status: 'AVAILABLE' as StationStatus,
      operatorId: 'chargepoint_am',
      operatorName: 'ChargePoint Armenia',
      openingHours: '24/7',
      amenities: ['parking', 'restroom', 'wifi'],
      connectors: [
        {
          evseId: 'CPA-ZVA-001',
          connectorType: 'CCS' as ConnectorType,
          powerKw: 180,
          status: 'AVAILABLE' as StationStatus,
        },
        {
          evseId: 'CPA-ZVA-002',
          connectorType: 'CHADEMO' as ConnectorType,
          powerKw: 50,
          status: 'OFFLINE' as StationStatus,
        },
        {
          evseId: 'CPA-ZVA-003',
          connectorType: 'TYPE_2' as ConnectorType,
          powerKw: 22,
          status: 'AVAILABLE' as StationStatus,
        },
      ],
    },
    {
      id: '10000000-0000-0000-0000-000000000008',
      name: 'Silachi GBT Charging Point',
      address: 'Արշակունյաց 34',
      city: 'Yerevan',
      latitude: 40.1634,
      longitude: 44.5382,
      status: 'OFFLINE' as StationStatus,
      operatorId: 'silachi_charge',
      operatorName: 'Silachi Charge',
      openingHours: '09:00–21:00',
      amenities: ['parking'],
      connectors: [
        {
          evseId: 'SLC-ARS-001',
          connectorType: 'GBT' as ConnectorType,
          powerKw: 60,
          status: 'OFFLINE' as StationStatus,
        },
        {
          evseId: 'SLC-ARS-002',
          connectorType: 'GBT' as ConnectorType,
          powerKw: 60,
          status: 'OFFLINE' as StationStatus,
        },
      ],
    },
    {
      id: '10000000-0000-0000-0000-000000000009',
      name: 'Republic Square EV Station',
      address: 'Հանրապետության հրապարակ',
      city: 'Yerevan',
      latitude: 40.1777,
      longitude: 44.513,
      status: 'OCCUPIED' as StationStatus,
      operatorId: 'ev_armenia',
      operatorName: 'EV Armenia',
      openingHours: '07:00–23:00',
      amenities: ['parking', 'cafe', 'wifi'],
      connectors: [
        {
          evseId: 'EVA-REP-001',
          connectorType: 'CCS' as ConnectorType,
          powerKw: 120,
          status: 'OCCUPIED' as StationStatus,
        },
        {
          evseId: 'EVA-REP-002',
          connectorType: 'TYPE_2' as ConnectorType,
          powerKw: 22,
          status: 'AVAILABLE' as StationStatus,
        },
        {
          evseId: 'EVA-REP-003',
          connectorType: 'TYPE_1' as ConnectorType,
          powerKw: 7,
          status: 'AVAILABLE' as StationStatus,
        },
      ],
    },
    {
      id: '10000000-0000-0000-0000-000000000010',
      name: 'Nork Marash DC Hub',
      address: 'Տիգրանաշեն 12',
      city: 'Yerevan',
      latitude: 40.1695,
      longitude: 44.5587,
      status: 'AVAILABLE' as StationStatus,
      operatorId: 'green_charge_am',
      operatorName: 'GreenCharge Armenia',
      openingHours: '24/7',
      amenities: ['parking', 'restroom'],
      connectors: [
        {
          evseId: 'GCA-NOR-001',
          connectorType: 'CCS' as ConnectorType,
          powerKw: 180,
          status: 'AVAILABLE' as StationStatus,
        },
        {
          evseId: 'GCA-NOR-002',
          connectorType: 'CHADEMO' as ConnectorType,
          powerKw: 50,
          status: 'MAINTENANCE' as StationStatus,
        },
        {
          evseId: 'GCA-NOR-003',
          connectorType: 'GBT' as ConnectorType,
          powerKw: 60,
          status: 'AVAILABLE' as StationStatus,
        },
      ],
    },
  ];

  for (const station of stations) {
    const { connectors, ...stationData } = station;

    await prisma.station.upsert({
      where: { id: stationData.id },
      update: {
        address: stationData.address,
        amenities: stationData.amenities,
        city: stationData.city,
        latitude: stationData.latitude,
        longitude: stationData.longitude,
        name: stationData.name,
        openingHours: stationData.openingHours,
        operatorId: stationData.operatorId,
        operatorName: stationData.operatorName,
        status: stationData.status,
      },
      create: {
        id: stationData.id,
        address: stationData.address,
        amenities: stationData.amenities,
        city: stationData.city,
        latitude: stationData.latitude,
        longitude: stationData.longitude,
        name: stationData.name,
        openingHours: stationData.openingHours,
        operatorId: stationData.operatorId,
        operatorName: stationData.operatorName,
        status: stationData.status,
      },
    });

    for (const connector of connectors) {
      await prisma.connector.upsert({
        where: {
          stationId_evseId: {
            evseId: connector.evseId,
            stationId: stationData.id,
          },
        },
        update: {
          connectorType: connector.connectorType,
          powerKw: connector.powerKw,
          status: connector.status,
        },
        create: {
          connectorType: connector.connectorType,
          evseId: connector.evseId,
          powerKw: connector.powerKw,
          stationId: stationData.id,
          status: connector.status,
        },
      });
    }
  }

  console.log(`Seeded ${stations.length} Yerevan stations.`);
}

/**
 * Runs the full Prisma seed for Step 6 entities.
 */
async function main(): Promise<void> {
  const context = await seedCoreEntities();
  await seedSessionAndMeterValues(context);
  await seedYerevanStations();
}

main()
  .catch(async (error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
