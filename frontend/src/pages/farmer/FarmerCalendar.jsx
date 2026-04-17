/**
 * FarmerCalendar.jsx — Farm Calendar (stub)
 * Full build: planting schedules, task reminders, weather events.
 */
import FarmerLayout from "../../components/farmer/FarmerLayout";
const C = { soil: "#2C1A0E", green: "#3D8C40", cream: "#F5EFE0", border: "#E0D5C0", gold: "#D4A017" };
export default function FarmerCalendar() {
  return (
    <FarmerLayout>
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="text-6xl mb-4">📅</div>
        <h1 className="text-2xl font-bold mb-2"
          style={{ color: C.soil, fontFamily: "'Playfair Display', Georgia, serif" }}>
          Farm Calendar
        </h1>
        <p className="text-gray-500 text-sm max-w-xs leading-relaxed">
          Planting schedules, harvest windows, task reminders, and seasonal planning — coming soon.
        </p>
        <span className="mt-4 px-3 py-1 rounded-full text-xs font-semibold text-white"
          style={{ background: C.gold }}>
          In Development
        </span>
      </div>
    </FarmerLayout>
  );
}
