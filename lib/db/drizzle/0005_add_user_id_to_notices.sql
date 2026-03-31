ALTER TABLE "notices" ADD COLUMN "user_id" integer;
ALTER TABLE "notices" ADD CONSTRAINT "notices_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL;
