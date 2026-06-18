import { useRoutes } from "react-router-dom";
import { appRoutes } from "./routes/AppRoutes";

export default function App() {
  return useRoutes(appRoutes);
}
