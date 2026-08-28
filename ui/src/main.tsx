import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Dashboard } from "./components/soc/Dashboard";
import "./index.css";

// One surface. There used to be a second console route behind `#/console` with
// its own landing, verdict and findings — so "review the report" left the page
// for a different rendering of the same audit, and a refresh with that hash
// still in the URL came back on the wrong landing. The review gate now lives on
// this page, so there is one report and one layout to come back to.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Dashboard />
  </StrictMode>,
);
