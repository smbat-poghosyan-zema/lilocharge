import { PrismaClient } from '@prisma/client';

import { OpenChargeMapClient } from '../open-charge-map.client';
import { StationImportService } from '../station-import.service';

const prisma = new PrismaClient();

/** Imports Armenian stations from Open Charge Map and persists them via Prisma upsert operations. */
async function main(): Promise<void> {
  const client = new OpenChargeMapClient({
    apiKey: process.env.OPEN_CHARGE_MAP_API_KEY,
  });
  const stationImportService = new StationImportService(prisma);

  const importedStations = await client.fetchArmenianStations();
  const summary = await stationImportService.importStations(importedStations);

  process.stdout.write(
    `Imported ${summary.stationsUpserted} stations and ${summary.connectorsUpserted} connectors from Open Charge Map.\n`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
