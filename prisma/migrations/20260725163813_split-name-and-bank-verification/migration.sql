-- Breaking change: no production data yet. Wipe dependent rows so required
-- columns can be added without defaults / backfill.
TRUNCATE TABLE "User" CASCADE;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "name",
ADD COLUMN     "firstName" TEXT NOT NULL,
ADD COLUMN     "lastName" TEXT NOT NULL,
ADD COLUMN     "middleName" TEXT,
ADD COLUMN     "bankCode" TEXT NOT NULL,
ADD COLUMN     "bankVerified" BOOLEAN NOT NULL DEFAULT false;
