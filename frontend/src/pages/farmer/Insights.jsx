import { lazy } from "react";
import { BarChart3, Crosshair } from "lucide-react";
import FarmTabs from "../../components/farm/FarmTabs";
const Analytics = lazy(() => import("./Analytics"));
const DecisionCenter = lazy(() => import("./DecisionCenter"));
export default function Insights() {
  return <FarmTabs tabs={[
    { key: "analytics", label: "Analytics", Icon: BarChart3, Comp: Analytics },
    { key: "decisions", label: "Decisions", Icon: Crosshair, Comp: DecisionCenter },
  ]} />;
}
