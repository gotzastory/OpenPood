import { createRoot } from "react-dom/client";
import { DashboardPage } from "./pages/dashboard";

export { routeFromHash } from "./pages/dashboard";

export function mountShell(root: HTMLElement) {
  createRoot(root).render(<DashboardPage />);
}
