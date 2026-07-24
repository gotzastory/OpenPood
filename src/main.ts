import "./style.css";
import "./types.d.ts";
import { mountWidget } from "./widget";

const app = document.querySelector<HTMLDivElement>("#app")!;

const DASHBOARD_ROUTES = ["/", "/history", "/dictionary", "/settings"];
const hash = location.hash.replace(/^#/, "");

if (hash === "/onboarding") {
  import("./onboarding.css");
  import("./pages/onboarding").then(({ mountOnboarding }) =>
    mountOnboarding(app),
  );
} else if (DASHBOARD_ROUTES.includes(hash)) {
  import("./dashboard.css");
  import("./shell").then(({ mountShell }) => mountShell(app));
} else {
  mountWidget(app);
}
