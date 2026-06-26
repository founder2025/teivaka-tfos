import { lazy } from "react";
import { Clock, FileText, Image as ImageIcon } from "lucide-react";
import FarmTabs from "../../components/farm/FarmTabs";
const FarmHistory = lazy(() => import("./FarmHistory"));
const Reports = lazy(() => import("./Reports"));
const Gallery = lazy(() => import("./Gallery"));
export default function Records() {
  return <FarmTabs tabs={[
    { key: "history", label: "History", Icon: Clock, Comp: FarmHistory },
    { key: "reports", label: "Reports", Icon: FileText, Comp: Reports },
    { key: "gallery", label: "Gallery", Icon: ImageIcon, Comp: Gallery },
  ]} />;
}
