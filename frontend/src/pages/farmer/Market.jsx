import { lazy } from "react";
import { Truck, Handshake, Briefcase } from "lucide-react";
import FarmTabs from "../../components/farm/FarmTabs";
const Buyers = lazy(() => import("./Buyers"));
const ServiceHub = lazy(() => import("./ServiceHub"));
const Jobs = lazy(() => import("./Jobs"));
export default function Market() {
  return <FarmTabs tabs={[
    { key: "buyers", label: "Buyers & sales", Icon: Truck, Comp: Buyers },
    { key: "services", label: "Services", Icon: Handshake, Comp: ServiceHub },
    { key: "jobs", label: "Jobs", Icon: Briefcase, Comp: Jobs },
  ]} />;
}
