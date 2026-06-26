import { lazy } from "react";
import { DollarSign, Wallet } from "lucide-react";
import FarmTabs from "../../components/farm/FarmTabs";
const CashLedger = lazy(() => import("./CashLedger"));
const Payments = lazy(() => import("./Payments"));
export default function Money() {
  return <FarmTabs tabs={[
    { key: "cash", label: "Cash", Icon: DollarSign, Comp: CashLedger },
    { key: "payments", label: "Payments", Icon: Wallet, Comp: Payments },
  ]} />;
}
