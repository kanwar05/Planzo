import "dotenv/config";
import mongoose from "mongoose";
import app from "./src/app.js";
import connectDatabase from "./src/config/database.js";
import { startNotificationSchedulers } from "./src/jobs/notificationJobs.js";
import { validatePaymentEnvironment } from "./src/config/payment.js";

const port = Number(process.env.PORT) || 5001;

async function startServer() {
  try {
    validatePaymentEnvironment();
    await connectDatabase();
    const notificationScheduler = startNotificationSchedulers();

    const server = app.listen(port, () => {
      console.log(`Planzo API listening on http://localhost:${port}`);
    });

    const shutdown = (signal) => {
      console.log(`${signal} received. Closing Planzo API...`);
      if (notificationScheduler) {
        clearInterval(notificationScheduler);
      }
      server.close(async () => {
        await mongoose.connection.close();
        process.exit(0);
      });
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (error) {
    console.error(`Server startup failed: ${error.message}`);
    process.exit(1);
  }
}

startServer();
