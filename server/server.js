import "dotenv/config";
import mongoose from "mongoose";
import { createServer } from "node:http";
import app from "./src/app.js";
import connectDatabase from "./src/config/database.js";
import { startNotificationSchedulers } from "./src/jobs/notificationJobs.js";
import { validatePaymentEnvironment } from "./src/config/payment.js";
import { initializeChatSocket } from "./src/realtime/chatSocket.js";
import { startCalendarSyncScheduler } from "./src/jobs/calendarSyncJobs.js";

const port = Number(process.env.PORT) || 5001;

async function startServer() {
  try {
    validatePaymentEnvironment();
    await connectDatabase();
    const notificationScheduler = startNotificationSchedulers();
    const calendarSyncScheduler = startCalendarSyncScheduler();

    const server = createServer(app);
    initializeChatSocket(server, app);
    server.listen(port, () => {
      console.log(`Planzo API listening on http://localhost:${port}`);
    });

    const shutdown = (signal) => {
      console.log(`${signal} received. Closing Planzo API...`);
      if (notificationScheduler) {
        clearInterval(notificationScheduler);
      }
      if (calendarSyncScheduler) clearInterval(calendarSyncScheduler);
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
