import "dotenv/config";
import app from "./app";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

process.on("uncaughtException", (error) => {
  console.error("[Uncaught Exception]", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[Unhandled Rejection]", reason);
  process.exit(1);
});

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`✅ Server listening on port ${port}`);
});

server.on("error", (error) => {
  console.error("[Server Error]", error);
  process.exit(1);
});