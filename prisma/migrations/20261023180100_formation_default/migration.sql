-- Separate migration: a new enum value can't be used in the transaction that adds it.
ALTER TABLE "Season" ALTER COLUMN "teamFormation" SET DEFAULT 'UNDECIDED';
