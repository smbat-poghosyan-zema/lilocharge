import { readFile } from 'node:fs/promises';

import { PrismaClient } from '@prisma/client';

import { parseOperatorStationsCsv } from '../operator-csv.parser';
import { StationImportService } from '../station-import.service';

const prisma = new PrismaClient();

/** Imports Armenian operator CSV rows and persists them as upserted stations and connectors. */
async function main(): Promise<void> {
  const csvPath = process.argv[2];
  if (csvPath === undefined) {
    throw new Error(
      'CSV path is required. Usage: pnpm --filter @lilocharge/api import:csv -- <path-to-csv>',
    );
  }

  const csvContent = await readFile(csvPath, 'utf8');
  const stations = parseOperatorStationsCsv(csvContent);
  const stationImportService = new StationImportService(prisma);
  const summary = await stationImportService.importStations(stations);

  process.stdout.write(
    `Imported ${summary.stationsUpserted} stations and ${summary.connectorsUpserted} connectors from CSV.\n`,
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
