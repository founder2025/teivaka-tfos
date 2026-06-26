import { lazy } from "react";
import { Truck, Handshake } from "lucide-react";
import FarmTabs from "../../components/farm/FarmTabs";
const Buyers = lazy(() => import("./Buyers"));
const ServiceHub = lazy(() => import("./ServiceHub"));
export default function Market() {
  return <FarmTabs tabs={[
    { key: "buyers", label: "Buyers & sales", Icon: Truck, Comp: Buyers },
    { key: "services", label: "Services", Icon: Handshake, Comp: ServiceHub },
  ]} />;
}
