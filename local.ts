// Local / Docker entry point: serves app.ts on a port. (On Vercel, app.ts is used directly.)
import { config } from "./src/config.ts";
import { connectDb } from "./src/db.ts";
import app from "./app.ts";

await connectDb();
console.log("Connected to MongoDB");

app.listen(config.PORT, () => {
  console.log(`Server listening on http://localhost:${config.PORT}`);
});
