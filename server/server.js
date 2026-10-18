import "dotenv/config";
import mongoose from "mongoose";
import { validateEnvironment } from "./src/config/environment.js";

async function startServer() {
  try {
    validateEnvironment();
    const [{ default: app }, { default: connectDatabase }, ...models] = await Promise.all([
      import("./src/app.js"), import("./src/config/database.js"),
      ...["Booking", "User", "Vendor", "Availability", "RefreshToken"].map((model) => import(`./src/models/${model}.js`)),
    ]);
    await connectDatabase();
    // Add required indexes without dropping legacy indexes or data.
    // Conflicting legacy reservations must be resolved before deployment.
    await Promise.all(models.map(({ default: model }) => model.createIndexes()));
    const port = Number(process.env.PORT) || 5001;
    const server = app.listen(port, () => console.log(`Planzo API listening on http://localhost:${port}`));
    server.on("error", async (error) => {
      console.error(`Server failed: ${error.message}`);
      await mongoose.disconnect();
      process.exitCode = 1;
    });
    let closing = false;
    const shutdown = () => {
      if (closing) return;
      closing = true;
      const deadline = setTimeout(() => process.exit(1), 10000);
      deadline.unref();
      server.close(async () => {
        await mongoose.disconnect();
        clearTimeout(deadline);
      });
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    console.error(`Server startup failed: ${error.message}`);
    await mongoose.disconnect();
    process.exitCode = 1;
  }
}

startServer();
