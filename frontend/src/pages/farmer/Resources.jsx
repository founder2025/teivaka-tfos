import { lazy } from "react";
import { Package, Users, Wrench, MapPin } from "lucide-react";
import FarmTabs from "../../components/farm/FarmTabs";
const InventoryList = lazy(() => import("./InventoryList"));
const Labor = lazy(() => import("./Labor"));
const Equipment = lazy(() => import("./Equipment"));
const LocationsPage = lazy(() => import("./LocationsPage"));
export default function Resources() {
  return <FarmTabs tabs={[
    { key: "inventory", label: "Inventory", Icon: Package, Comp: InventoryList },
    { key: "labour", label: "Labour", Icon: Users, Comp: Labor },
    { key: "equipment", label: "Equipment", Icon: Wrench, Comp: Equipment },
    { key: "locations", label: "Locations", Icon: MapPin, Comp: LocationsPage },
  ]} />;
}
