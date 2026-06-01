-- Add bids_status column to bids table
ALTER TABLE "bids" ADD COLUMN "bids_status" text DEFAULT 'open-bids';
